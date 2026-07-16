"""
main_job.py
Nightly job entrypoint for the screener.

CLI:  python -m app.main_job --date YYYY-MM-DD [--fixtures-dir path]

Workflow:
  1. Load data (fixtures or live feeds)
  2. Equity leg: ingest_and_adjust → run_for_date
  3. Metals leg: run_metals_for_date (failure → partial, never blocks equity)
  4. Persist: run, scores, calls, metal scores, metal signals, screener_latest, prices
"""

from __future__ import annotations

import argparse
import os
import sys
import traceback
from datetime import datetime, timezone, timedelta
import pandas as pd

IST = timezone(timedelta(hours=5, minutes=30))

# Add core/ to sys.path
_CORE_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "core")
if os.path.abspath(_CORE_DIR) not in sys.path:
    sys.path.insert(0, os.path.abspath(_CORE_DIR))

from pipeline import ingest_and_adjust, run_for_date, LOGIC_VERSION  # noqa: E402
from metals_run import run_metals_for_date  # noqa: E402

from app.data.loaders import (  # noqa: E402
    load_fixture_symbols,
    load_fixture_fundamentals,
    load_fixture_bhavcopy,
    load_fixture_corp_actions,
    load_fixture_metals,
)
from app.db.memory_store import MemoryStore  # noqa: E402

# Module-level store singleton (shared with server.py)
_store: MemoryStore | None = None


def get_store() -> MemoryStore:
    global _store
    if _store is None:
        _store = MemoryStore()
    return _store


def set_store(store: MemoryStore) -> None:
    global _store
    _store = store


def run_job(run_date: str, fixtures_dir: str, store=None, live: bool = False) -> dict:
    """
    Run the full nightly job for one date. Returns the run record.
    """
    if store is None:
        store = get_store()

    started = datetime.now(timezone.utc).isoformat()
    print(f"[job] Starting run for {run_date} (live={live})")

    # ── 1. Load data ──────────────────────────────────────────────────
    if live:
        from app.data.loaders import (
            download_nse_bhavcopy,
            load_live_metals_fx,
            load_fixture_fundamentals,
            load_fixture_corp_actions,
        )

        # Load known universe from Firestore cache
        known_symbols = store.get_known_symbols()
        symbols = [store.get_symbol_metadata(s) for s in known_symbols if store.get_symbol_metadata(s) is not None]
        print(f"[job] Live: Loaded {len(symbols)} symbols from store universe")

        # Load fundamentals and corporate actions
        fundamentals = load_fixture_fundamentals(fixtures_dir)
        corp_actions = load_fixture_corp_actions(fixtures_dir)

        # Fetch live metals and FX
        gold_usd, silver_usd, usdinr = load_live_metals_fx()

        # Fetch, merge, and persist raw daily bhavcopy
        print(f"[job] Live: Downloading today's bhavcopy for {run_date}")
        try:
            bhav_df = download_nse_bhavcopy(run_date)
            bhav_lookup = {row["symbol"].upper(): row for row in bhav_df.to_dict("records")}
        except Exception as e:
            print(f"[job] Live: WARNING: Failed to download bhavcopy (possibly a holiday): {e}")
            bhav_lookup = {}

        raw_prices = {}
        for sym_meta in symbols:
            sym = sym_meta["symbol"].upper()
            # Fetch unadjusted history from store
            raw_hist = store.get_raw_prices(sym)
            history_df = pd.DataFrame(raw_hist)
            if len(history_df) > 0:
                history_df["date"] = pd.to_datetime(history_df["date"])

            today_row = bhav_lookup.get(sym)
            if today_row:
                new_bar = {
                    "date": pd.to_datetime(today_row["date"]),
                    "open": float(today_row["open"]),
                    "high": float(today_row["high"]),
                    "low": float(today_row["low"]),
                    "close": float(today_row["close"]),
                    "volume": float(today_row["volume"])
                }
                new_bar_df = pd.DataFrame([new_bar])
                if len(history_df) > 0:
                    history_df = pd.concat([history_df, new_bar_df], ignore_index=True)
                else:
                    history_df = new_bar_df

            if len(history_df) > 0:
                # Clean, sort, deduplicate, cap
                history_df = history_df.sort_values("date").drop_duplicates(subset=["date"], keep="last").reset_index(drop=True)
                history_df = history_df.tail(400)

                # Persist unadjusted raw prices back to store
                persist_rows = history_df.copy()
                persist_rows["date"] = persist_rows["date"].dt.strftime("%Y-%m-%d")
                store.write_raw_prices(sym, persist_rows.to_dict("records"))

                raw_prices[sym] = history_df
    else:
        from app.data.loaders import (
            load_fixture_symbols,
            load_fixture_fundamentals,
            load_fixture_bhavcopy,
            load_fixture_corp_actions,
            load_fixture_metals,
        )
        symbols = load_fixture_symbols(fixtures_dir)
        fundamentals = load_fixture_fundamentals(fixtures_dir)
        raw_prices = load_fixture_bhavcopy(fixtures_dir)
        corp_actions = load_fixture_corp_actions(fixtures_dir)
        gold_usd, silver_usd, usdinr = load_fixture_metals(fixtures_dir)

    # ── 2. Equity leg ─────────────────────────────────────────────────
    adj_prices = ingest_and_adjust(raw_prices, corp_actions)

    watchlist = store.get_watchlist()

    run_record, scores, calls = run_for_date(
        run_date=run_date,
        symbols=symbols,
        adj_prices=adj_prices,
        fundamentals=fundamentals,
        watchlist=watchlist,
    )

    print(f"[job] Equity: {run_record['scored_count']} scored, "
          f"{run_record['passed_count']} passed")

    # ── 3. Metals leg (failure = partial, never blocks equity) ────────
    metals_section = None
    metal_records = []
    metal_signals = []
    try:
        metals_section, metal_records, metal_signals = run_metals_for_date(
            run_date=run_date,
            gold_usd=gold_usd,
            silver_usd=silver_usd,
            usdinr=usdinr,
        )
        print(f"[job] Metals: {metals_section['status']}, "
              f"{len(metal_signals)} signal(s)")
        if metals_section["status"] != "ok":
            run_record["status"] = "partial"
    except Exception:
        traceback.print_exc()
        print("[job] Metals section FAILED — marking run as partial")
        run_record["status"] = "partial"
        metals_section = {"status": "failed", "run_date": run_date}

    # ── 4. Persist ────────────────────────────────────────────────────
    run_record["started"] = started
    run_record["finished"] = datetime.now(timezone.utc).isoformat()
    if metals_section:
        run_record["metals_section"] = metals_section

    store.write_run(run_date, run_record)
    store.write_scores(run_date, scores)
    store.write_calls(run_date, calls)
    store.write_metal_scores(run_date, metal_records)
    store.write_metal_signals(run_date, metal_signals)

    # Denormalised screener_latest: only gate-passers
    store.write_screener_latest(
        records=calls,
        metals={
            "section": metals_section,
            "scores": metal_records,
            "signals": metal_signals,
        },
    )

    # Persist price arrays (capped at ~400 per symbol)
    for sym, adf in adj_prices.items():
        rows = adf[["date", "adj_close", "adj_open", "adj_high", "adj_low", "adj_volume"]].copy()
        rows.columns = ["date", "close", "open", "high", "low", "volume"]
        rows["date"] = rows["date"].dt.strftime("%Y-%m-%d")
        store.write_prices(sym, rows.to_dict("records"))

    print(f"[job] Persisted. Run status: {run_record['status']}")
    return run_record


def main():
    parser = argparse.ArgumentParser(description="Nightly screener job")
    parser.add_argument("--date",
                        default=datetime.now(IST).strftime("%Y-%m-%d"),
                        help="Run date YYYY-MM-DD (default: today IST)")
    parser.add_argument("--fixtures-dir",
                        default=os.path.join(os.path.dirname(__file__), "..", "fixtures"),
                        help="Path to fixture data directory")
    parser.add_argument("--skipped", action="store_true",
                        help="Write a skipped-run record (NSE holiday)")
    parser.add_argument("--live", action="store_true",
                        help="Run in live mode using live feeds and updating raw_prices")
    parser.add_argument("--seed-symbols", action="store_true",
                        help="Seed the symbols collection from fixtures and exit")
    args = parser.parse_args()

    # Select store based on environment
    use_firestore = os.environ.get("USE_FIRESTORE", "false").lower() == "true"
    if use_firestore:
        from app.db.firestore_store import FirestoreStore
        store = FirestoreStore()
        print("[job] Using FirestoreStore.")
    else:
        store = get_store()
        print("[job] Using MemoryStore.")

    set_store(store)

    if args.seed_symbols:
        print("[job] Seeding symbols...")
        symbols = load_fixture_symbols(args.fixtures_dir)
        store.set_known_symbols(symbols)
        print(f"[job] Seeded {len(symbols)} symbols successfully.")
        return

    if args.skipped:
        store.write_run(args.date, {
            "run_date": args.date,
            "status": "skipped",
            "logic_version": LOGIC_VERSION,
        })
        print(f"[job] Wrote skipped-run record for {args.date}")
        return

    run_job(args.date, args.fixtures_dir, store, live=args.live)


if __name__ == "__main__":
    main()

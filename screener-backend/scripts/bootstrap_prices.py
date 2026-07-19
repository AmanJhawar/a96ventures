"""
bootstrap_prices.py
One-time seed: download 2 years of daily OHLCV for all symbols in the universe
via yfinance and write to Firestore raw_prices/{SYMBOL}.

Run:  python scripts/bootstrap_prices.py [--batch-size 50] [--start-from SYMBOL]

yfinance batch-downloads up to ~50 tickers at a time efficiently.
The script processes symbols alphabetically and is idempotent — symbols
that already have >= 200 bars in Firestore are skipped.
"""

import argparse
import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

import pandas as pd
import yfinance as yf
from app.db.firestore_store import FirestoreStore


def download_batch(symbols: list[str], start: str) -> dict[str, pd.DataFrame]:
    """
    Batch-download OHLCV for a list of NSE symbols.
    Returns {SYMBOL: DataFrame} for symbols that returned data.
    """
    tickers = [f"{s}.NS" for s in symbols]
    ticker_str = " ".join(tickers)

    try:
        data = yf.download(ticker_str, start=start, group_by="ticker", progress=False, threads=True)
    except Exception as e:
        print(f"    yfinance error for batch: {e}")
        return {}

    results = {}
    for sym in symbols:
        yf_ticker = f"{sym}.NS"
        try:
            if len(symbols) == 1:
                # Single ticker: data is not grouped
                df = data.copy()
            else:
                df = data[yf_ticker].copy()

            if isinstance(df.columns, pd.MultiIndex):
                df.columns = [c[0] for c in df.columns]

            df = df.reset_index()
            df.columns = [c.lower() for c in df.columns]
            df["date"] = pd.to_datetime(df["date"]).dt.strftime("%Y-%m-%d")

            for c in ("open", "high", "low", "close", "volume"):
                if c in df.columns:
                    df[c] = pd.to_numeric(df[c], errors="coerce")

            df = df.dropna(subset=["close"])
            if len(df) > 0:
                results[sym] = df[["date", "open", "high", "low", "close", "volume"]].reset_index(drop=True)
        except (KeyError, TypeError):
            pass  # No data for this symbol

    return results


def main():
    parser = argparse.ArgumentParser(description="Bootstrap raw price history from yfinance")
    parser.add_argument("--batch-size", type=int, default=50, help="Symbols per yfinance batch")
    parser.add_argument("--start-from", type=str, default=None, help="Resume from this symbol (alphabetical)")
    parser.add_argument("--days", type=int, default=730, help="Days of history to fetch (default: 730 = 2 years)")
    args = parser.parse_args()

    start = (pd.Timestamp.now() - pd.Timedelta(days=args.days)).strftime("%Y-%m-%d")
    print(f"[bootstrap_prices] Fetching {args.days} days of prices from {start}")

    store = FirestoreStore()

    # Get all known symbols
    known = sorted(store.get_known_symbols())
    print(f"[bootstrap_prices] {len(known)} symbols in universe")

    if args.start_from:
        idx = next((i for i, s in enumerate(known) if s >= args.start_from.upper()), 0)
        known = known[idx:]
        print(f"[bootstrap_prices] Resuming from {known[0]} ({len(known)} remaining)")

    total = len(known)
    written = 0
    skipped = 0
    failed = 0

    for batch_start in range(0, total, args.batch_size):
        batch = known[batch_start:batch_start + args.batch_size]
        batch_num = batch_start // args.batch_size + 1
        total_batches = (total + args.batch_size - 1) // args.batch_size

        # Check which symbols need data
        needs_data = []
        for sym in batch:
            existing = store.get_raw_prices(sym)
            if len(existing) >= 200:
                skipped += 1
                continue
            needs_data.append(sym)

        if not needs_data:
            print(f"  Batch {batch_num}/{total_batches}: all {len(batch)} symbols already seeded, skipping")
            continue

        print(f"  Batch {batch_num}/{total_batches}: downloading {len(needs_data)} symbols "
              f"({batch[0]}..{batch[-1]})  [written={written}, skipped={skipped}, failed={failed}]")

        results = download_batch(needs_data, start)

        for sym in needs_data:
            if sym in results:
                df = results[sym]
                rows = df.to_dict("records")
                try:
                    store.write_raw_prices(sym, rows)
                    written += 1
                except Exception as e:
                    print(f"    ERROR writing {sym}: {e}")
                    failed += 1
            else:
                failed += 1

        # Rate-limit to avoid Yahoo throttling
        time.sleep(2)

    print(f"\n[bootstrap_prices] Complete: written={written}, skipped={skipped}, failed={failed}")


if __name__ == "__main__":
    main()

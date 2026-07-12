"""
bootstrap_raw_prices.py
One-time script to seed 400+ days of unadjusted historical raw prices for all universe symbols.
Downloads history from Yahoo Finance in batches and saves them to the raw_prices collection.
"""

from __future__ import annotations

import argparse
import os
import sys
import time
import pandas as pd

# Add core/ and backend/ to sys.path
_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_CORE_DIR = os.path.join(_BACKEND_DIR, "..", "core")
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)
if _CORE_DIR not in sys.path:
    sys.path.insert(0, _CORE_DIR)

from app.main_job import get_store, set_store  # noqa: E402


def main():
    parser = argparse.ArgumentParser(description="One-time raw prices bootstrapper")
    parser.add_argument("--days", type=int, default=600,
                        help="Number of historical days to download (default: 600 days to get ~400 trading days)")
    parser.add_argument("--batch-size", type=int, default=50,
                        help="Batch size for yfinance requests (default: 50)")
    parser.add_argument("--fixtures-dir",
                        default=os.path.join(os.path.dirname(__file__), "..", "fixtures"),
                        help="Path to fixture data directory")
    args = parser.parse_args()

    # Select store based on environment
    use_firestore = os.environ.get("USE_FIRESTORE", "false").lower() == "true"
    if use_firestore:
        from app.db.firestore_store import FirestoreStore
        store = FirestoreStore()
        print("[bootstrap] Using FirestoreStore.")
    else:
        store = get_store()
        print("[bootstrap] Using MemoryStore.")

    set_store(store)

    # 1. Fetch universe symbols
    known_symbols = store.get_known_symbols()
    if not known_symbols:
        print("[bootstrap] Firestore symbols collection is empty. Seeding from fixtures first...")
        from app.data.loaders import load_fixture_symbols
        symbols_list = load_fixture_symbols(args.fixtures_dir)
        store.set_known_symbols(symbols_list)
        known_symbols = store.get_known_symbols()

    symbols_list = sorted(list(known_symbols))
    total_symbols = len(symbols_list)
    print(f"[bootstrap] Found {total_symbols} symbols to seed.")

    # 2. Download from yfinance and save
    import yfinance as yf
    start_date = (pd.Timestamp.now() - pd.Timedelta(days=args.days)).strftime("%Y-%m-%d")
    print(f"[bootstrap] Fetching history from {start_date} in batches of {args.batch_size}...")

    success_count = 0
    fail_count = 0

    for i in range(0, total_symbols, args.batch_size):
        chunk_syms = symbols_list[i : i + args.batch_size]
        chunk_yf_tickers = [f"{sym}.NS" for sym in chunk_syms]

        print(f"[bootstrap] Downloading batch {i // args.batch_size + 1}: {chunk_syms[:3]}... ({len(chunk_syms)} symbols)")
        try:
            # Fetch bulk data
            data = yf.download(chunk_yf_tickers, start=start_date, group_by="ticker", progress=False)
            time.sleep(1)  # Rate limiting safety cushion
        except Exception as e:
            print(f"[bootstrap] Error downloading batch: {e}")
            fail_count += len(chunk_syms)
            continue

        for sym in chunk_syms:
            yf_sym = f"{sym}.NS"
            try:
                # Resolve structure
                if isinstance(data.columns, pd.MultiIndex):
                    if yf_sym not in data.columns.get_level_values(0):
                        print(f"[bootstrap] No data for {sym} in response. Skipping.")
                        fail_count += 1
                        continue
                    df = data[yf_sym]
                else:
                    # Single ticker response
                    df = data

                df = df.copy().reset_index()
                df.columns = [c.lower() for c in df.columns]
                df = df.dropna(subset=["close"])

                if len(df) == 0:
                    print(f"[bootstrap] Data for {sym} is empty. Skipping.")
                    fail_count += 1
                    continue

                # Format to standard unadjusted bars
                df = df.rename(columns={"open": "open", "high": "high", "low": "low", "close": "close", "volume": "volume"})
                df["date"] = pd.to_datetime(df["date"]).dt.strftime("%Y-%m-%d")
                rows = df[["date", "open", "high", "low", "close", "volume"]].to_dict("records")

                # Persist to database
                store.write_raw_prices(sym, rows)
                success_count += 1
            except Exception as e:
                print(f"[bootstrap] Error processing {sym}: {e}")
                fail_count += 1

    print(f"[bootstrap] Seeding complete. Success: {success_count}, Failed/Skipped: {fail_count}")


if __name__ == "__main__":
    main()

"""
bootstrap_metals.py
One-time seed: download 2 years of gold, silver (USD OHLC) and USDINR (rate)
via yfinance (from a local machine where it works) and write to Firestore
metals_feed/{gold|silver|usdinr}.

Run:  python scripts/bootstrap_metals.py
"""

import os
import sys

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

import pandas as pd
import yfinance as yf
from app.db.firestore_store import FirestoreStore


def fetch_ohlc(ticker: str, start: str) -> pd.DataFrame:
    """Download OHLC from yfinance. Returns [date, open, high, low, close]."""
    print(f"  Downloading {ticker} from {start}...")
    df = yf.download(ticker, start=start, progress=False)
    if df.empty:
        raise ValueError(f"No data returned for {ticker}")
    df = df.reset_index()
    # yfinance returns multi-level columns for single ticker too sometimes
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = [c[0] for c in df.columns]
    df.columns = [c.lower() for c in df.columns]
    df["date"] = pd.to_datetime(df["date"]).dt.strftime("%Y-%m-%d")
    df = df.dropna(subset=["close"])
    return df[["date", "open", "high", "low", "close"]].reset_index(drop=True)


def fetch_rate(ticker: str, start: str) -> pd.DataFrame:
    """Download FX rate from yfinance. Returns [date, rate]."""
    print(f"  Downloading {ticker} from {start}...")
    df = yf.download(ticker, start=start, progress=False)
    if df.empty:
        raise ValueError(f"No data returned for {ticker}")
    df = df.reset_index()
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = [c[0] for c in df.columns]
    df.columns = [c.lower() for c in df.columns]
    df["date"] = pd.to_datetime(df["date"]).dt.strftime("%Y-%m-%d")
    df = df.rename(columns={"close": "rate"})
    df = df.dropna(subset=["rate"])
    return df[["date", "rate"]].reset_index(drop=True)


def main():
    start = (pd.Timestamp.now() - pd.Timedelta(days=730)).strftime("%Y-%m-%d")
    print(f"[bootstrap_metals] Fetching 2 years of metals data from {start}")

    gold = fetch_ohlc("GC=F", start)
    silver = fetch_ohlc("SI=F", start)
    usdinr = fetch_rate("USDINR=X", start)

    print(f"  Gold:   {len(gold)} bars")
    print(f"  Silver: {len(silver)} bars")
    print(f"  USDINR: {len(usdinr)} bars")

    store = FirestoreStore()

    print("[bootstrap_metals] Writing to Firestore metals_feed...")
    store.write_metals_feed("gold", gold.to_dict("records"))
    store.write_metals_feed("silver", silver.to_dict("records"))
    store.write_metals_feed("usdinr", usdinr.to_dict("records"))

    # Verify
    for key in ("gold", "silver", "usdinr"):
        count = len(store.get_metals_feed(key))
        print(f"  metals_feed/{key}: {count} bars in Firestore")

    print("[bootstrap_metals] Done.")


if __name__ == "__main__":
    main()

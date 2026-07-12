"""
loaders.py
Fixture-file loaders for local development. Loads the fabricated data from
backend/fixtures/ and returns the shapes that core/pipeline and core/metals_run
expect.

LIVE FEED ADAPTERS: not implemented here. When wiring live feeds:
  - TODO: NSE bhavcopy download (verify UDiFF column layout)
  - TODO: Spot gold/silver USD feed
  - TODO: USDINR feed
  - TODO: Fundamentals refresh (screener.in CSV or manual upload)
Build against the DataFrame interfaces the core already accepts.
"""

from __future__ import annotations

import json
import os
import sys

import pandas as pd

# Add core/ to sys.path so we can import without modifying core files
_CORE_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "..", "core")
if _CORE_DIR not in sys.path:
    sys.path.insert(0, os.path.abspath(_CORE_DIR))

from pipeline import CorpAction  # noqa: E402


def _read_json(path: str):
    with open(path) as f:
        return json.load(f)


def load_fixture_symbols(fixtures_dir: str) -> list[dict]:
    """Load symbol metadata: [{symbol, name, sector, is_financial, shares_outstanding}]."""
    return _read_json(os.path.join(fixtures_dir, "symbols.json"))


def load_fixture_fundamentals(fixtures_dir: str) -> dict:
    """Load fundamentals: {symbol: {current, prior, annual_periods, ...}}."""
    return _read_json(os.path.join(fixtures_dir, "fundamentals.json"))


def load_fixture_bhavcopy(fixtures_dir: str) -> dict[str, pd.DataFrame]:
    """Load bhavcopy CSV and split into {symbol: DataFrame}."""
    path = os.path.join(fixtures_dir, "bhavcopy_sample.csv")
    df = pd.read_csv(path)
    df["date"] = pd.to_datetime(df["date"])
    for c in ("open", "high", "low", "close", "volume"):
        df[c] = pd.to_numeric(df[c], errors="coerce")
    return {sym: g.reset_index(drop=True) for sym, g in df.groupby("symbol")}


def load_fixture_corp_actions(fixtures_dir: str) -> dict[str, list]:
    """Load corp actions: {symbol: [CorpAction]}."""
    raw = _read_json(os.path.join(fixtures_dir, "corp_actions.json"))
    out = {}
    for sym, actions in raw.items():
        out[sym] = [CorpAction(ex_date=a["ex_date"], factor=a["factor"])
                    for a in actions]
    return out


def load_fixture_metals(fixtures_dir: str):
    """Load metals and FX data. Returns (gold_usd_df, silver_usd_df, usdinr_df)."""
    gold = pd.read_csv(os.path.join(fixtures_dir, "gold_usd.csv"))
    silver = pd.read_csv(os.path.join(fixtures_dir, "silver_usd.csv"))
    usdinr = pd.read_csv(os.path.join(fixtures_dir, "usdinr.csv"))
    for df in (gold, silver, usdinr):
        df["date"] = pd.to_datetime(df["date"])
    return gold, silver, usdinr


def load_live_metals_fx(start_date: str = None, end_date: str = None):
    """
    Fetch gold (GC=F), silver (SI=F), and USDINR=X from Yahoo Finance.
    If no start_date is given, fetches the last 550 days (~380 trading days) to ensure enough history for SMAs/ATRs.
    Returns (gold_df, silver_df, usdinr_df) formatted for the metals pipeline.
    """
    import yfinance as yf

    if not start_date:
        start_date = (pd.Timestamp.now() - pd.Timedelta(days=550)).strftime("%Y-%m-%d")

    print(f"[loaders] Fetching live metals and FX from {start_date} to {end_date or 'today'}...")

    tickers = ["GC=F", "SI=F", "USDINR=X"]
    data = yf.download(tickers, start=start_date, end=end_date, group_by="ticker", progress=False)

    def _extract_ohlc(ticker_df: pd.DataFrame):
        df = ticker_df.copy().reset_index()
        df.columns = [c.lower() for c in df.columns]
        df = df.rename(columns={"open": "open", "high": "high", "low": "low", "close": "close"})
        df["date"] = pd.to_datetime(df["date"])
        df = df.dropna(subset=["close"])
        return df[["date", "open", "high", "low", "close"]].reset_index(drop=True)

    def _extract_rate(ticker_df: pd.DataFrame):
        df = ticker_df.copy().reset_index()
        df.columns = [c.lower() for c in df.columns]
        df = df.rename(columns={"close": "rate"})
        df["date"] = pd.to_datetime(df["date"])
        df = df.dropna(subset=["rate"])
        return df[["date", "rate"]].reset_index(drop=True)

    gold = _extract_ohlc(data["GC=F"])
    silver = _extract_ohlc(data["SI=F"])
    usdinr = _extract_rate(data["USDINR=X"])

    return gold, silver, usdinr


def download_nse_bhavcopy(date_str: str) -> pd.DataFrame:
    """
    Download and extract the daily Bhavcopy from NSE Archives for the given date.
    date_str: YYYY-MM-DD format.
    Returns a DataFrame with columns: [symbol, open, high, low, close, volume, date]
    """
    import zipfile
    import io
    import urllib.request
    from datetime import datetime

    dt = datetime.strptime(date_str, "%Y-%m-%d")
    year = dt.strftime("%Y")
    month_short = dt.strftime("%b").upper()
    day_str = dt.strftime("%d")

    url = f"https://archives.nseindia.com/content/historical/EQUITIES/{year}/{month_short}/cm{day_str}{month_short}{year}bhav.csv.zip"
    print(f"[loaders] Downloading NSE Bhavcopy from: {url}")

    req = urllib.request.Request(
        url,
        headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        }
    )

    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            zip_data = response.read()
    except Exception as e:
        raise Exception(f"Failed to download Bhavcopy for {date_str} from NSE. It might be a weekend/holiday or NSE is blocking requests: {e}")

    with zipfile.ZipFile(io.BytesIO(zip_data)) as z:
        csv_name = [name for name in z.namelist() if name.endswith(".csv")][0]
        with z.open(csv_name) as f:
            df = pd.read_csv(f)

    df.columns = [c.strip().upper() for c in df.columns]

    if "SERIES" in df.columns:
        df = df[df["SERIES"].isin(["EQ", "BE"])]

    rename_map = {
        "SYMBOL": "symbol",
        "OPEN": "open",
        "HIGH": "high",
        "LOW": "low",
        "CLOSE": "close",
        "TOTTRDQTY": "volume"
    }
    df = df.rename(columns={k: v for k, v in rename_map.items() if k in df.columns})
    df["date"] = pd.to_datetime(date_str)

    for c in ("open", "high", "low", "close", "volume"):
        df[c] = pd.to_numeric(df[c], errors="coerce")

    return df[["symbol", "open", "high", "low", "close", "volume", "date"]].dropna(subset=["close"]).reset_index(drop=True)

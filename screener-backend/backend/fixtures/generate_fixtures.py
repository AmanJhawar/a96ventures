"""
generate_fixtures.py
One-off script to produce synthetic fixture data for local development.
Uses core/pipeline._fake_ohlcv for realistic-looking price series.

Run:  python generate_fixtures.py
Produces files in the same directory (backend/fixtures/).
"""

import json
import os
import sys

import numpy as np
import pandas as pd

# Add core/ to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "core"))
from pipeline import _fake_ohlcv  # noqa: E402

FIXTURES_DIR = os.path.dirname(os.path.abspath(__file__))
START = "2025-01-01"
N_BARS = 260


def _save_csv(df, name):
    path = os.path.join(FIXTURES_DIR, name)
    df.to_csv(path, index=False)
    print(f"  wrote {path} ({len(df)} rows)")


def _save_json(data, name):
    path = os.path.join(FIXTURES_DIR, name)
    with open(path, "w") as f:
        json.dump(data, f, indent=2, default=str)
    print(f"  wrote {path}")


def generate_bhavcopy():
    """Fabricate a multi-day bhavcopy with 5 symbols."""
    frames = []

    # SOLIDCO: beaten-down non-bank (should pass both gates)
    solid = _fake_ohlcv(START, N_BARS, 200, 120, seed=1, bump_last=3.0)
    solid["symbol"] = "SOLIDCO"

    # HOTCO: extended non-bank (fails technicals)
    hot = _fake_ohlcv(START, N_BARS, 90, 240, seed=2)
    hot["symbol"] = "HOTCO"

    # TINYCO: small-cap non-bank (fails market cap, watchlist-only)
    tiny = _fake_ohlcv(START, N_BARS, 60, 40, seed=3)
    tiny["symbol"] = "TINYCO"

    # BANKCO: beaten-down bank (tests bank engine)
    bank = _fake_ohlcv(START, N_BARS, 500, 300, seed=4, bump_last=2.5)
    bank["symbol"] = "BANKCO"

    # WEAKBANK: extended bank (fails technicals)
    weakbank = _fake_ohlcv(START, N_BARS, 200, 450, seed=5)
    weakbank["symbol"] = "WEAKBANK"

    for df in [solid, hot, tiny, bank, weakbank]:
        df["series"] = "EQ"
        frames.append(df)

    bhavcopy = pd.concat(frames, ignore_index=True)
    _save_csv(bhavcopy, "bhavcopy_sample.csv")


def generate_symbols():
    """Symbol metadata."""
    symbols = [
        {"symbol": "SOLIDCO", "name": "Solid Corp Ltd", "sector": "IT",
         "is_financial": False, "shares_outstanding": 1_000_000_000},
        {"symbol": "HOTCO", "name": "Hot Industries Ltd", "sector": "IT",
         "is_financial": False, "shares_outstanding": 1_000_000_000},
        {"symbol": "TINYCO", "name": "Tiny Ventures Ltd", "sector": "IT",
         "is_financial": False, "shares_outstanding": 5_000_000},
        {"symbol": "BANKCO", "name": "Bank Corp Ltd", "sector": "Banking",
         "is_financial": True, "shares_outstanding": 2_000_000_000},
        {"symbol": "WEAKBANK", "name": "Weak Bank Ltd", "sector": "Banking",
         "is_financial": True, "shares_outstanding": 1_500_000_000},
    ]
    _save_json(symbols, "symbols.json")


def generate_fundamentals():
    """Fundamentals for all symbols."""
    def fy(y, m=3, d=31):
        return f"{y}-{m:02d}-{d:02d}"

    fundamentals = {
        "SOLIDCO": {
            "current": dict(net_income=120, total_assets=1000, borrowings=100, cash=40,
                            operating_profit=180, revenue=900, gross_margin=42,
                            current_ratio=2.1, shares_outstanding=1_000_000_000, ocf=150),
            "prior": dict(net_income=90, total_assets=1000, borrowings=150, cash=30,
                          operating_profit=150, revenue=800, gross_margin=38,
                          current_ratio=1.8, shares_outstanding=1_000_000_000, ocf=110),
            "annual_periods": [
                dict(end_date=fy(2021), operating_profit=140, borrowings=170, cash=25),
                dict(end_date=fy(2022), operating_profit=150, borrowings=160, cash=28),
                dict(end_date=fy(2023), operating_profit=160, borrowings=150, cash=30),
                dict(end_date=fy(2024), operating_profit=170, borrowings=130, cash=35),
                dict(end_date=fy(2025), operating_profit=180, borrowings=100, cash=40),
            ],
            "debt_to_equity": 0.15,
        },
        "HOTCO": {
            "current": dict(net_income=30, total_assets=1000, borrowings=500, cash=10,
                            operating_profit=60, revenue=600, gross_margin=25,
                            current_ratio=1.1, shares_outstanding=1_000_000_000, ocf=20),
            "prior": dict(net_income=40, total_assets=900, borrowings=450, cash=15,
                          operating_profit=70, revenue=650, gross_margin=28,
                          current_ratio=1.3, shares_outstanding=1_000_000_000, ocf=45),
            "annual_periods": [
                dict(end_date=fy(2025), operating_profit=60, borrowings=500, cash=10),
            ],
            "debt_to_equity": 0.90,
        },
        "TINYCO": {
            "current": dict(net_income=5, total_assets=100, borrowings=10, cash=5,
                            operating_profit=8, revenue=90, gross_margin=20,
                            current_ratio=1.2, shares_outstanding=5_000_000, ocf=6),
            "prior": dict(net_income=4, total_assets=95, borrowings=12, cash=4,
                          operating_profit=7, revenue=85, gross_margin=19,
                          current_ratio=1.1, shares_outstanding=5_000_000, ocf=5),
            "annual_periods": [
                dict(end_date=fy(2025), operating_profit=8, borrowings=10, cash=5),
            ],
            "debt_to_equity": 0.60,
        },
        "BANKCO": {
            "current": dict(gross_npa=1.2, provision_coverage=78, roa=1.4, nim=3.5,
                            cost_to_income=42, casa_ratio=45, book_value=320),
            "prior": dict(gross_npa=1.8, provision_coverage=72, roa=1.1, nim=3.2,
                          cost_to_income=48, casa_ratio=40),
            "crar": 15.5,
            "tier1": 12.8,
            "book_periods": [
                dict(end_date=fy(2021), book_value=220),
                dict(end_date=fy(2022), book_value=250),
                dict(end_date=fy(2023), book_value=280),
                dict(end_date=fy(2024), book_value=300),
                dict(end_date=fy(2025), book_value=320),
            ],
            "debt_to_equity": None,  # not applicable for banks
        },
        "WEAKBANK": {
            "current": dict(gross_npa=4.5, provision_coverage=55, roa=0.3, nim=2.1,
                            cost_to_income=62, casa_ratio=28, book_value=180),
            "prior": dict(gross_npa=3.8, provision_coverage=60, roa=0.5, nim=2.4,
                          cost_to_income=58, casa_ratio=32),
            "crar": 12.0,
            "tier1": 10.0,
            "book_periods": [
                dict(end_date=fy(2025), book_value=180),
            ],
            "debt_to_equity": None,
        },
    }
    _save_json(fundamentals, "fundamentals.json")


def generate_corp_actions():
    """One split event to exercise the adjustment engine."""
    actions = {
        "SOLIDCO": [
            {"ex_date": "2025-06-15", "factor": 2.0},  # 2:1 split
        ],
    }
    _save_json(actions, "corp_actions.json")


def generate_metals():
    """Fabricated spot USD OHLC for gold/silver + USDINR rates."""
    rng = np.random.default_rng(42)
    dates = pd.bdate_range(start=START, periods=N_BARS)

    # Gold: uptrend from 1800 to 2400 (should be above 200-day SMA)
    gold_trend = np.linspace(1800, 2400, N_BARS)
    gold_close = gold_trend + rng.normal(0, 15, N_BARS)
    gold_df = pd.DataFrame({
        "date": dates,
        "open": gold_close * 0.998,
        "high": gold_close * 1.008,
        "low": gold_close * 0.992,
        "close": gold_close,
    })
    _save_csv(gold_df, "gold_usd.csv")

    # Silver: uptrend from 22 to 32
    silver_trend = np.linspace(22, 32, N_BARS)
    silver_close = silver_trend + rng.normal(0, 0.3, N_BARS)
    silver_df = pd.DataFrame({
        "date": dates,
        "open": silver_close * 0.997,
        "high": silver_close * 1.012,
        "low": silver_close * 0.988,
        "close": silver_close,
    })
    _save_csv(silver_df, "silver_usd.csv")

    # USDINR: gentle drift from 83 to 86
    fx_trend = np.linspace(83, 86, N_BARS)
    fx_rate = fx_trend + rng.normal(0, 0.15, N_BARS)
    fx_df = pd.DataFrame({
        "date": dates,
        "rate": fx_rate,
    })
    _save_csv(fx_df, "usdinr.csv")


if __name__ == "__main__":
    print("Generating fixture data...")
    generate_bhavcopy()
    generate_symbols()
    generate_fundamentals()
    generate_corp_actions()
    generate_metals()
    print("Done.")

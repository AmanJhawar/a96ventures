"""
test_pipeline.py

Runs with pytest, or directly:  python test_pipeline.py

Offline only: no NSE network is touched. The NSE download is not tested here;
everything below runs on fabricated or hand-constructed data.

The two adjustment tests are the ones that matter most, because a broken
corporate-action adjustment silently fakes crashes in RSI and KST:
  - turnover conservation: adj_close * adj_volume == raw close * raw volume
  - no fake crash: a genuine 2:1 event on economically flat data leaves the
    adjusted close flat, with no artificial step at the ex-date.
"""

import numpy as np
import pandas as pd

from pipeline import (
    CorpAction,
    bonus_factor,
    split_factor,
    adjust_prices,
    market_cap_cr,
    _price_on_or_before,
    historical_ratio_median,
    ev_ebit_current_and_median,
    screen_symbol,
    run_for_date,
    ingest_and_adjust,
    _fake_ohlcv,
)


# ---------------------------------------------------------------------------
# ratio constructors
# ---------------------------------------------------------------------------
def test_ratio_constructors():
    assert bonus_factor(1, 1) == 2.0        # 1:1 bonus doubles the shares
    assert bonus_factor(2, 1) == 3.0        # 2:1 bonus trebles them
    assert split_factor(10, 2) == 5.0       # face 10 -> 2 is a 5-for-1 split


# ---------------------------------------------------------------------------
# corporate-action adjustment
# ---------------------------------------------------------------------------
def _ohlcv(dates, closes, vols):
    closes = np.asarray(closes, dtype="float64")
    return pd.DataFrame({
        "date": pd.to_datetime(dates),
        "open": closes, "high": closes, "low": closes,
        "close": closes, "volume": np.asarray(vols, dtype="int64"),
    })


def test_adjustment_conserves_turnover():
    df = _fake_ohlcv("2025-01-01", 120, 300, 250, seed=7)
    adj = adjust_prices(df, [CorpAction("2025-04-01", split_factor(10, 2))])  # 5:1
    raw_turnover = df["close"].to_numpy() * df["volume"].to_numpy()
    adj_turnover = adj["adj_close"].to_numpy() * adj["adj_volume"].to_numpy()
    assert np.allclose(adj_turnover, raw_turnover, rtol=1e-9)


def test_adjustment_no_fake_crash_on_clean_split():
    # economically flat across a real 2:1 event: raw price halves, volume doubles
    dates = pd.bdate_range("2025-01-01", periods=20)
    closes = [100.0] * 10 + [50.0] * 10
    vols = [1000] * 10 + [2000] * 10
    df = _ohlcv(dates, closes, vols)
    adj = adjust_prices(df, [CorpAction(dates[10], 2.0)])
    # history is scaled to the present basis: every adjusted close is 50
    assert np.allclose(adj["adj_close"].to_numpy(), 50.0, atol=1e-9)
    # and every adjusted volume is 2000, so no step at the ex-date
    assert np.allclose(adj["adj_volume"].to_numpy(), 2000.0, atol=1e-9)


def test_adjustment_latest_bar_unchanged():
    df = _fake_ohlcv("2025-01-01", 60, 100, 140, seed=3)
    adj = adjust_prices(df, [CorpAction("2025-02-01", 3.0)])
    # the most recent bar is on the present basis: adjusted == raw
    assert abs(adj["adj_close"].iloc[-1] - df["close"].iloc[-1]) < 1e-9
    assert abs(adj["adj_volume"].iloc[-1] - df["volume"].iloc[-1]) < 1e-9


def test_adjustment_no_actions_is_identity():
    df = _fake_ohlcv("2025-01-01", 40, 80, 90, seed=1)
    adj = adjust_prices(df, [])
    assert np.allclose(adj["adj_close"].to_numpy(), df["close"].to_numpy())
    assert np.allclose(adj["adj_volume"].to_numpy(), df["volume"].to_numpy())


# ---------------------------------------------------------------------------
# market cap
# ---------------------------------------------------------------------------
def test_market_cap_cr():
    # 120 rupees * 1e9 shares = 1.2e11 rupees = 12,000 crore
    assert abs(market_cap_cr(120.0, 1_000_000_000) - 12000.0) < 1e-6
    assert market_cap_cr(None, 1_000_000_000) is None
    assert market_cap_cr(120.0, None) is None


# ---------------------------------------------------------------------------
# historical medians use the price ON the reporting date
# ---------------------------------------------------------------------------
def _series_at(pairs):
    idx = [pd.Timestamp(d) for d, _ in pairs]
    return pd.Series([v for _, v in pairs], index=idx).sort_index()


def test_price_on_or_before_picks_prior_trading_day():
    s = _series_at([("2023-03-31", 100.0), ("2023-06-30", 999.0)])
    # a date between the two resolves to the earlier one, never the later
    assert _price_on_or_before(s, "2023-04-15") == 100.0
    # a date before all data returns None
    assert _price_on_or_before(s, "2020-01-01") is None


def test_historical_ratio_median_pb_style():
    # shares 1e7 with money_unit 1e7 makes market-cap-in-crore equal the price,
    # so the P/B for each period is simply price / book value.
    s = _series_at([
        ("2023-03-31", 100.0),
        ("2023-06-30", 500.0),     # later noise that must be ignored below
        ("2024-03-31", 150.0),
    ])
    periods = [
        {"end_date": "2023-03-31", "denominator": 10.0},   # 100/10 = 10
        {"end_date": "2024-03-31", "denominator": 10.0},   # 150/10 = 15
    ]
    med = historical_ratio_median(s, 1e7, periods, add_net_debt=False, money_unit=1e7)
    assert abs(med - 12.5) < 1e-9


def test_historical_ratio_median_skips_bad_periods():
    s = _series_at([("2024-03-31", 150.0)])
    periods = [
        {"end_date": "2024-03-31", "denominator": 10.0},   # 15
        {"end_date": "2024-03-31", "denominator": 0.0},    # non-positive -> skip
        {"end_date": "2019-01-01", "denominator": 10.0},   # no price -> skip
    ]
    med = historical_ratio_median(s, 1e7, periods, add_net_debt=False, money_unit=1e7)
    assert med == 15.0


def test_ev_ebit_uses_net_debt():
    s = _series_at([("2025-03-31", 100.0)])
    fund = {
        "current": dict(borrowings=200.0, cash=50.0, operating_profit=100.0),
        "annual_periods": [dict(end_date="2025-03-31", operating_profit=10.0,
                                borrowings=60.0, cash=20.0)],
    }
    # current: mc 100cr + net debt (200-50)=150 -> 250 / 100 = 2.5
    # median : price 100 -> mc 100cr + (60-20)=40 -> 140 / 10 = 14.0
    ev_cur, ev_med = ev_ebit_current_and_median(s, 1e7, fund, money_unit=1e7)
    assert abs(ev_cur - 2.5) < 1e-9
    assert abs(ev_med - 14.0) < 1e-9


# ---------------------------------------------------------------------------
# a call requires being in-universe, not just clearing both gates
# ---------------------------------------------------------------------------
def _beaten_down_df(seed=11):
    # steady decline -> price below both SMAs, low RSI, KST negative
    return _fake_ohlcv("2025-01-01", 260, 200, 120, seed=seed, bump_last=3.0)


_SOLID_FUND = {
    "current": dict(net_income=120, total_assets=1000, borrowings=100, cash=40,
                    operating_profit=180, revenue=900, gross_margin=42,
                    current_ratio=2.1, shares_outstanding=1_000_000_000, ocf=150),
    "prior": dict(net_income=90, total_assets=1000, borrowings=150, cash=30,
                  operating_profit=150, revenue=800, gross_margin=38,
                  current_ratio=1.8, shares_outstanding=1_000_000_000, ocf=110),
    "annual_periods": [dict(end_date="2025-03-31", operating_profit=180,
                            borrowings=100, cash=40)],
    "debt_to_equity": 0.15,
}


def test_call_requires_in_universe():
    adf = ingest_and_adjust({"X": _beaten_down_df()}, {})["X"]

    # shares that put market cap inside the band -> in universe -> a call
    meta_in = {"symbol": "X", "sector": "IT", "is_financial": False,
               "shares_outstanding": 1_000_000_000}
    rec_in = screen_symbol(meta_in, adf, _SOLID_FUND, sector_de_median=0.60)
    assert rec_in["f_pass"] and rec_in["t_pass"]
    assert rec_in["in_universe"] is True
    assert rec_in["is_call"] is True

    # same fundamentals and chart, but far fewer shares -> market cap below the
    # 5,000cr floor -> NOT in universe -> NOT a call, despite both gates passing
    meta_out = dict(meta_in, shares_outstanding=10_000_000)
    rec_out = screen_symbol(meta_out, adf, _SOLID_FUND, sector_de_median=0.60)
    assert rec_out["f_pass"] and rec_out["t_pass"]
    assert rec_out["in_universe"] is False
    assert "market_cap_band" in rec_out["filters_failed"]
    assert rec_out["is_call"] is False


# ---------------------------------------------------------------------------
# end to end
# ---------------------------------------------------------------------------
def test_end_to_end_run_produces_a_call_and_flags_watchlist():
    solid = _fake_ohlcv("2025-01-01", 260, 200, 120, seed=1, bump_last=3.0)
    hot = _fake_ohlcv("2025-01-01", 260, 90, 240, seed=2)      # extended
    tiny = _fake_ohlcv("2025-01-01", 260, 60, 40, seed=3)      # sub-band cap
    adj = ingest_and_adjust({"SOLIDCO": solid, "HOTCO": hot, "TINYCO": tiny}, {})

    symbols = [
        {"symbol": "SOLIDCO", "sector": "IT", "is_financial": False, "shares_outstanding": 1_000_000_000},
        {"symbol": "HOTCO", "sector": "IT", "is_financial": False, "shares_outstanding": 1_000_000_000},
        {"symbol": "TINYCO", "sector": "IT", "is_financial": False, "shares_outstanding": 5_000_000},
    ]
    hot_fund = {
        "current": dict(net_income=30, total_assets=1000, borrowings=500, cash=10,
                        operating_profit=60, revenue=600, gross_margin=25,
                        current_ratio=1.1, shares_outstanding=1_000_000_000, ocf=20),
        "prior": dict(net_income=40, total_assets=900, borrowings=450, cash=15,
                      operating_profit=70, revenue=650, gross_margin=28,
                      current_ratio=1.3, shares_outstanding=1_000_000_000, ocf=45),
        "annual_periods": [dict(end_date="2025-03-31", operating_profit=60, borrowings=500, cash=10)],
        "debt_to_equity": 0.90,
    }
    tiny_fund = dict(_SOLID_FUND, debt_to_equity=0.60)
    fundamentals = {"SOLIDCO": _SOLID_FUND, "HOTCO": hot_fund, "TINYCO": tiny_fund}

    run, scores, calls = run_for_date(
        "2025-12-31", symbols, adj, fundamentals, watchlist={"TINYCO"},
    )

    by = {r["symbol"]: r for r in scores}
    assert run["scored_count"] == 3
    assert by["SOLIDCO"]["is_call"] is True                    # solid + beaten-down
    assert by["HOTCO"]["is_call"] is False                     # extended, fails technicals
    assert by["TINYCO"]["on_watchlist"] is True
    assert by["TINYCO"]["is_call"] is False                    # scored but sub-band
    assert "market_cap_band" in by["TINYCO"]["filters_failed"]
    assert [c["symbol"] for c in calls] == ["SOLIDCO"]
    assert run["passed_count"] == 1


if __name__ == "__main__":
    import sys

    fns = [v for k, v in sorted(globals().items())
           if k.startswith("test_") and callable(v)]
    failed = 0
    for fn in fns:
        try:
            fn()
            print(f"PASS  {fn.__name__}")
        except AssertionError as e:
            failed += 1
            print(f"FAIL  {fn.__name__}: {e}")
    print(f"\n{len(fns) - failed}/{len(fns)} passed")
    sys.exit(1 if failed else 0)

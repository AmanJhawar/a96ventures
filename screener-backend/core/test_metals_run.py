"""
test_metals_run.py
Runs with pytest, or directly:  python test_metals_run.py

Exercises the nightly metals section end to end on fabricated settled bars:
a signal fires on a pullback within an uptrend, a stale FX leg records the row
but suppresses the signal, a dead feed degrades the section to 'partial'
without touching the other metal, and the GSR stance rides the section record.
"""

import numpy as np
import pandas as pd

from metals_run import score_metal, run_metals_for_date, MIN_BARS


def _usd_bars(start, n, p0, p1, seed=0, dip_last=0.0):
    """Settled daily bars trending p0 -> p1, optional late dip fraction."""
    rng = np.random.default_rng(seed)
    trend = np.linspace(p0, p1, n)
    close = np.maximum(trend + rng.normal(0, max(p0, p1) * 0.003, n), 1.0)
    if dip_last > 0:
        k = max(int(n * 0.06), 5)               # dip over the last ~6% of bars
        close[-k:] = close[-k:] * np.linspace(1.0, 1.0 - dip_last, k)
    dates = pd.bdate_range(start=start, periods=n)
    return pd.DataFrame({
        "date": dates,
        "open": close, "high": close * 1.004, "low": close * 0.996,
        "close": close,
    })


def _fx(dates, rate0=90.0, rate1=95.5):
    rates = np.linspace(rate0, rate1, len(dates))
    return pd.DataFrame({"date": dates, "rate": rates})


def test_signal_fires_on_pullback_in_uptrend():
    # long uptrend with a recent ~7% dip: above the 200-day, below the 50-day
    bars = _usd_bars("2025-06-01", 280, 3000, 4300, seed=1, dip_last=0.07)
    fx = _fx(bars["date"])
    rec = score_metal("gold", bars, fx, base_tranche=100_000)
    assert rec["status"] == "ok"
    assert rec["regime"] == "uptrend"
    assert rec["is_buy_signal"] is True
    assert rec["t_score"] >= 3
    assert "suggested_tranche" in rec and rec["suggested_tranche"] > 0


def test_no_signal_in_downtrend():
    bars = _usd_bars("2025-06-01", 280, 4300, 3000, seed=2)   # sustained decline
    fx = _fx(bars["date"])
    rec = score_metal("gold", bars, fx)
    assert rec["status"] == "ok"
    assert rec["regime"] == "downtrend"
    assert rec["is_buy_signal"] is False


def test_stale_fx_records_but_suppresses():
    bars = _usd_bars("2025-06-01", 280, 3000, 4300, seed=1, dip_last=0.07)
    # FX feed stops 10 business days before the last bar -> stale beyond limit
    fx = _fx(bars["date"][:-10])
    rec = score_metal("gold", bars, fx, max_staleness_days=3)
    assert rec["status"] == "stale_fx"
    assert rec["fx_stale"] is True
    assert rec["is_buy_signal"] is False
    assert rec["price_inr"] is not None            # the row is still recorded


def test_insufficient_history():
    bars = _usd_bars("2026-01-01", MIN_BARS - 50, 4000, 4100, seed=3)
    fx = _fx(bars["date"])
    rec = score_metal("gold", bars, fx)
    assert rec["status"] == "insufficient_history"
    assert "is_buy_signal" not in rec or not rec.get("is_buy_signal")


def test_dead_feed_isolates_to_partial():
    gold = _usd_bars("2025-06-01", 280, 3000, 4300, seed=1, dip_last=0.07)
    silver_empty = pd.DataFrame(columns=["date", "open", "high", "low", "close"])
    fx = _fx(gold["date"])
    section, recs, signals = run_metals_for_date(
        "2026-07-09", gold, silver_empty, fx, base_tranche_gold=100_000,
    )
    assert section["status"] == "partial"          # silver feed dead
    by = {r["metal"]: r for r in recs}
    assert by["gold"]["status"] == "ok"            # gold unaffected
    assert by["silver"]["status"] == "no_data"
    assert [s["metal"] for s in signals] == ["gold"]
    assert signals[0]["price_at_signal"] == by["gold"]["price_inr"]


def test_gsr_rides_the_section():
    # gold ~80x silver at the last bar -> stance 'silver_cheap'
    gold = _usd_bars("2025-06-01", 280, 3200, 4000, seed=4)
    silver = _usd_bars("2025-06-01", 280, 40, 50, seed=5)
    fx = _fx(gold["date"])
    section, recs, signals = run_metals_for_date("2026-07-09", gold, silver, fx)
    assert section["status"] == "ok"
    assert section["gsr"] is not None
    assert 70 < section["gsr"] < 90
    assert section["gsr_stance"] in ("silver_cheap", "neutral")
    # each signal carries the ratio context it was made under
    for s in signals:
        assert s["gsr"] == section["gsr"]


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

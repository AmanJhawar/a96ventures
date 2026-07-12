"""
test_metals.py
Runs with pytest, or directly:  python test_metals.py

Direction tests are the point: in accumulate mode a pullback within an uptrend
must score high and a blow-off top must not, and a broken trend (below the
200-day) must suppress the buy signal regardless of momentum. Chase mode
inverts the RSI/Bollinger preference.
"""

import numpy as np
import pandas as pd

from metals import (
    atr,
    bollinger,
    gold_silver_ratio,
    classify_gsr,
    metals_technical_score,
    tranche_size,
    synth_inr_ohlc,
)


def _s(vals):
    return pd.Series(vals, dtype="float64")


# ---------------------------------------------------------------------------
# indicators
# ---------------------------------------------------------------------------
def test_atr_constant_range():
    # flat close at 100, high +1 / low -1 -> true range is 2 every bar -> ATR 2
    n = 40
    close = _s([100.0] * n)
    high = close + 1.0
    low = close - 1.0
    a = atr(high, low, close, 14).dropna()
    assert (abs(a - 2.0) < 1e-9).all()


def test_bollinger_flat_is_midneutral():
    close = _s([50.0] * 30)
    mid, upper, lower, pct_b, bandwidth = bollinger(close, 20, 2.0)
    assert abs(mid.iloc[-1] - 50.0) < 1e-9
    assert abs(bandwidth.iloc[-1]) < 1e-9          # zero width on flat data
    assert abs(pct_b.iloc[-1] - 0.5) < 1e-9        # neutral when no width


def test_bollinger_pct_b_formula():
    rng = np.random.default_rng(0)
    close = _s(100 + np.cumsum(rng.normal(0, 1, 60)))
    mid, upper, lower, pct_b, _ = bollinger(close, 20, 2.0)
    i = -1
    expected = (close.iloc[i] - lower.iloc[i]) / (upper.iloc[i] - lower.iloc[i])
    assert abs(pct_b.iloc[i] - expected) < 1e-9


def test_gold_silver_ratio_currency_independent():
    idx = pd.date_range("2026-01-01", periods=2)
    gold = pd.Series([4000.0, 4100.0], index=idx)
    silver = pd.Series([50.0, 50.0], index=idx)
    r_usd = gold_silver_ratio(gold, silver)
    assert abs(r_usd.iloc[0] - 80.0) < 1e-9 and abs(r_usd.iloc[1] - 82.0) < 1e-9
    # multiply both legs by an FX rate: the ratio is unchanged
    r_inr = gold_silver_ratio(gold * 95.5, silver * 95.5)
    assert np.allclose(r_usd.to_numpy(), r_inr.to_numpy(), atol=1e-9)


def test_classify_gsr():
    assert classify_gsr(85) == "silver_cheap"
    assert classify_gsr(70) == "neutral"
    assert classify_gsr(45) == "silver_rich"
    assert classify_gsr(None) == "unknown"


# ---------------------------------------------------------------------------
# scoring: accumulate mode
# ---------------------------------------------------------------------------
def test_accumulate_pullback_in_uptrend_is_buy():
    # uptrend (price above 200), dip (below 50), moderate RSI, low %B, momentum up
    total, b, meta = metals_technical_score(
        rsi=38, kst=20, kst_signal=10, price=110, sma50=118, sma200=95,
        pct_b=0.15, atr=3.0, mode="accumulate",
    )
    assert meta["regime"] == "uptrend"
    assert total >= 3
    assert meta["is_buy_signal"] is True


def test_accumulate_blowoff_top_is_not_buy():
    # uptrend but overbought: high RSI, above upper band -> brakes engage
    total, b, meta = metals_technical_score(
        rsi=85, kst=30, kst_signal=10, price=140, sma50=120, sma200=100,
        pct_b=1.1, atr=5.0, mode="accumulate",
    )
    assert meta["regime"] == "uptrend"
    assert total < 3
    assert meta["is_buy_signal"] is False


def test_accumulate_downtrend_suppresses_buy():
    # strong momentum but price below the 200-day: secular thesis broken
    total, b, meta = metals_technical_score(
        rsi=40, kst=20, kst_signal=10, price=80, sma50=90, sma200=120,
        pct_b=0.15, atr=3.0, mode="accumulate",
    )
    assert meta["regime"] == "downtrend"
    assert meta["is_buy_signal"] is False


# ---------------------------------------------------------------------------
# scoring: chase mode inverts the RSI/Bollinger preference
# ---------------------------------------------------------------------------
def test_chase_buys_strength():
    total, b, meta = metals_technical_score(
        rsi=75, kst=30, kst_signal=10, price=130, sma50=115, sma200=100,
        pct_b=0.9, atr=4.0, mode="chase",
    )
    assert meta["regime"] == "uptrend"
    assert total >= 3
    assert meta["is_buy_signal"] is True


def test_same_inputs_diverge_by_mode():
    # a pullback scores well to accumulate, poorly to chase
    kwargs = dict(rsi=38, kst=20, kst_signal=10, price=110, sma50=118,
                  sma200=95, pct_b=0.15, atr=3.0)
    acc, _, _ = metals_technical_score(mode="accumulate", **kwargs)
    chase, _, _ = metals_technical_score(mode="chase", **kwargs)
    assert acc > chase


def test_missing_inputs_score_zero():
    total, b, meta = metals_technical_score()
    assert total == 0
    assert meta["regime"] == "unknown"
    assert meta["is_buy_signal"] is False


# ---------------------------------------------------------------------------
# volatility regime and tranche sizing
# ---------------------------------------------------------------------------
def test_vol_regime_and_tranche():
    _, _, meta = metals_technical_score(
        rsi=40, kst=20, kst_signal=10, price=100, sma50=105, sma200=90,
        pct_b=0.2, atr=4.0, atr_pct_ref=0.02, mode="accumulate",
    )
    assert meta["atr_pct"] == 0.04
    assert meta["vol_regime"] == "high"            # 0.04 >= 1.3 * 0.02
    # higher volatility -> smaller tranche than base
    small = tranche_size(100_000, atr_pct=0.04, target_pct=0.02)
    assert small < 100_000
    # lower volatility -> larger tranche, capped at 2x
    big = tranche_size(100_000, atr_pct=0.005, target_pct=0.02)
    assert big == 200_000


# ---------------------------------------------------------------------------
# the spot x USDINR join and its staleness flag
# ---------------------------------------------------------------------------
def test_synth_inr_join_flags_stale_fx():
    # metal trades daily; FX has a gap (Indian holiday) so later dates go stale
    usd = pd.DataFrame({
        "date": pd.to_datetime(["2026-03-02", "2026-03-03", "2026-03-09"]),
        "open": [4000, 4010, 4020], "high": [4005, 4015, 4025],
        "low": [3995, 4005, 4015], "close": [4000, 4010, 4020],
    })
    fx = pd.DataFrame({
        "date": pd.to_datetime(["2026-03-02", "2026-03-03"]),
        "rate": [95.0, 95.2],
    })
    out = synth_inr_ohlc(usd, fx, max_staleness_days=3)
    # first two rows use fresh FX
    assert out["is_stale"].iloc[0] == False
    assert out["is_stale"].iloc[1] == False
    # 2026-03-09 carries the 03-03 rate: 6 days old, beyond the 3-day limit
    assert out["is_stale"].iloc[2] == True
    assert abs(out["close"].iloc[1] - 4010 * 95.2) < 1e-6


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

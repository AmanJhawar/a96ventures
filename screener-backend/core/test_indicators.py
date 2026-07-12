"""
test_indicators.py

Runs with pytest, or directly:  python test_indicators.py

The exact-value RSI tests use series where Wilder's answer is known by hand:
  strictly increasing -> only gains -> 100
  strictly decreasing -> only losses -> 0
  flat                -> no gains, no losses -> 50 (our neutral convention)

The random test cross-checks rsi_wilder against a second, independent Wilder
implementation to catch coding bugs. For external validation, hand-verify one
real series against the same charting source you trust, using the recurrence:
  avg_gain_t = (avg_gain_{t-1}*(n-1) + gain_t) / n     (same for loss)
  RSI = 100 - 100/(1 + avg_gain/avg_loss)
seeded with the simple mean of the first n changes.
"""

import numpy as np
import pandas as pd

from indicators import rsi_wilder, kst


def _series(vals):
    return pd.Series(vals, dtype="float64")


def test_rsi_all_gains_is_100():
    s = _series(list(range(1, 40)))
    r = rsi_wilder(s, 14).dropna()
    assert len(r) > 0
    assert (abs(r - 100.0) < 1e-9).all()


def test_rsi_all_losses_is_0():
    s = _series(list(range(40, 1, -1)))
    r = rsi_wilder(s, 14).dropna()
    assert len(r) > 0
    assert (abs(r - 0.0) < 1e-9).all()


def test_rsi_flat_is_50():
    s = _series([50.0] * 40)
    r = rsi_wilder(s, 14).dropna()
    assert len(r) > 0
    assert (abs(r - 50.0) < 1e-9).all()


def test_rsi_too_short_is_all_nan():
    s = _series([1, 2, 3, 4, 5])          # fewer than n+1 for n=14
    r = rsi_wilder(s, 14)
    assert r.isna().all()


def _rsi_reference(close, n=14):
    """Independent transparent Wilder RSI for cross-checking."""
    d = np.diff(close)
    g = np.where(d > 0, d, 0.0)
    l = np.where(d < 0, -d, 0.0)
    out = [np.nan] * len(close)

    def f(ag, al):
        if al == 0 and ag == 0:
            return 50.0
        if al == 0:
            return 100.0
        if ag == 0:
            return 0.0
        return 100 - 100 / (1 + ag / al)

    ag = g[:n].mean()
    al = l[:n].mean()
    out[n] = f(ag, al)
    for i in range(n, len(d)):
        ag = (ag * (n - 1) + g[i]) / n
        al = (al * (n - 1) + l[i]) / n
        out[i + 1] = f(ag, al)
    return np.array(out)


def test_rsi_matches_independent_reference():
    rng = np.random.default_rng(0)
    prices = 100 + np.cumsum(rng.normal(0, 1, 300))
    r = rsi_wilder(_series(prices), 14).to_numpy()
    ref = _rsi_reference(prices, 14)
    mask = ~np.isnan(ref)
    assert np.allclose(r[mask], ref[mask], atol=1e-9)


def test_rsi_bounds():
    rng = np.random.default_rng(1)
    prices = 100 + np.cumsum(rng.normal(0, 2, 500))
    r = rsi_wilder(_series(prices), 14).dropna().to_numpy()
    assert (r >= 0.0).all() and (r <= 100.0).all()


def test_kst_positive_on_strong_uptrend():
    # exponential (constant-rate) growth keeps ROC positive and well-behaved;
    # a linear ramp would decelerate in ROC terms, so sign is the honest claim.
    s = _series([1.02 ** t for t in range(130)])
    kst_line, _ = kst(s)
    assert kst_line.dropna().iloc[-1] > 0


def test_kst_negative_on_strong_downtrend():
    s = _series(list(range(130, 1, -1)))
    kst_line, _ = kst(s)
    assert kst_line.dropna().iloc[-1] < 0


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

"""
indicators.py
Technical indicators for the Beaten-Down Quality Screener.

All indicators operate on a corporate-action-adjusted daily series
(adjusted close and adjusted volume). Definitions are pinned deliberately
so the output is hand-verifiable in the testing phase:

  - RSI uses Wilder's smoothing (RMA), seeded with the simple mean of the
    first n price changes, then recursive. A plain moving average of gains
    gives different, wrong tiers. pandas ewm(alpha=1/n) is NOT identical
    because it seeds on the first value, not the mean of the first n.
  - KST uses Pring's classic parameters (ROC 10/15/20/30, smoothed by
    SMA 10/10/10/15, weights 1/2/3/4, signal = 9-period SMA of KST).

Only pandas and numpy are required.
"""

from __future__ import annotations

import numpy as np
import pandas as pd


def sma(series: pd.Series, window: int) -> pd.Series:
    """Simple moving average. NaN until `window` observations exist."""
    return series.rolling(window=window, min_periods=window).mean()


def rsi_wilder(close: pd.Series, n: int = 14) -> pd.Series:
    """
    Wilder's RSI over n periods.

    The first RSI value appears at position n (the (n+1)th price), because
    the first averaging window is the first n price changes.

    Edge conventions:
      avg_loss == 0 and avg_gain  > 0  -> 100  (only gains)
      avg_gain == 0 and avg_loss  > 0  -> 0    (only losses)
      avg_gain == 0 and avg_loss == 0  -> 50   (flat)
    """
    close = close.astype("float64")
    delta = close.diff()                    # position 0 is NaN
    gain = delta.clip(lower=0.0)
    loss = (-delta).clip(lower=0.0)

    g = gain.to_numpy()
    l = loss.to_numpy()
    m = len(close)
    rsi = pd.Series(np.nan, index=close.index, dtype="float64")
    if m < n + 1:                           # need at least n changes
        return rsi

    def to_rsi(ag: float, al: float) -> float:
        if al == 0.0 and ag == 0.0:
            return 50.0
        if al == 0.0:
            return 100.0
        if ag == 0.0:
            return 0.0
        rs = ag / al
        return 100.0 - (100.0 / (1.0 + rs))

    # seed on the first n real changes, at array positions 1..n
    avg_g = float(np.nanmean(g[1:n + 1]))
    avg_l = float(np.nanmean(l[1:n + 1]))
    rsi.iloc[n] = to_rsi(avg_g, avg_l)

    for i in range(n + 1, m):
        gi = g[i] if not np.isnan(g[i]) else 0.0
        li = l[i] if not np.isnan(l[i]) else 0.0
        avg_g = (avg_g * (n - 1) + gi) / n
        avg_l = (avg_l * (n - 1) + li) / n
        rsi.iloc[i] = to_rsi(avg_g, avg_l)

    return rsi


def roc(close: pd.Series, n: int) -> pd.Series:
    """Rate of change, per cent."""
    return (close / close.shift(n) - 1.0) * 100.0


def kst(
    close: pd.Series,
    roc_periods=(10, 15, 20, 30),
    sma_periods=(10, 10, 10, 15),
    weights=(1, 2, 3, 4),
    signal_period: int = 9,
):
    """
    Pring's Know Sure Thing (KST) and its signal line.
    Returns (kst_line, signal_line) as two aligned Series.

    Both are NaN until every component is defined (longest component needs
    max(roc)+max(sma)-1 bars, and the signal needs a further signal_period).
    """
    assert len(roc_periods) == len(sma_periods) == len(weights) == 4
    rcma = [sma(roc(close, rp), sp) for rp, sp in zip(roc_periods, sma_periods)]
    kst_line = (
        weights[0] * rcma[0]
        + weights[1] * rcma[1]
        + weights[2] * rcma[2]
        + weights[3] * rcma[3]
    )
    signal = sma(kst_line, signal_period)
    return kst_line, signal


def indicator_snapshot(
    df: pd.DataFrame,
    price_col: str = "adj_close",
    volume_col: str = "adj_volume",
) -> dict:
    """
    Compute every technical input the scorer needs and return the latest
    row's values as a plain dict (None where an indicator is not yet defined).

    Feed the result straight into scoring.technical_score(**snapshot_without_price)
    or pull individual fields. A meaningful moving-average score needs at least
    200 adjusted bars; with fewer, sma200 is None and the MA component scores 0.
    """
    close = df[price_col].astype("float64")
    vol = df[volume_col].astype("float64")

    rsi = rsi_wilder(close, 14)
    kst_line, kst_sig = kst(close)
    s50 = sma(close, 50)
    s200 = sma(close, 200)
    vol20 = sma(vol, 20)

    def last(s: pd.Series):
        v = s.iloc[-1]
        return None if pd.isna(v) else float(v)

    return {
        "price": last(close),
        "rsi": last(rsi),
        "kst": last(kst_line),
        "kst_signal": last(kst_sig),
        "sma50": last(s50),
        "sma200": last(s200),
        "volume": last(vol),
        "vol_sma20": last(vol20),
    }

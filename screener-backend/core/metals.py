"""
metals.py
Technical module for gold and silver, for an Indian PHYSICAL accumulator.

Design decisions baked in (see the conversation for reasoning):
  - The price series is INR-denominated, built as spot-USD x USDINR. This is a
    SIGNAL series for timing the trend. It is NOT your landed cost: physical
    carries duty (15% as of May 2026), 3% GST and dealer premium on top, and
    those are a separate layer you maintain outside this module.
  - Trend-following orientation, the OPPOSITE of the equity mean-reversion
    engine. There you bought weakness; here the 200-day uptrend is a GATE and
    momentum is confirmation.
  - Two modes, because "chase momentum" and "accumulate physical" pull apart:
      mode="accumulate" (DEFAULT): only act when the secular uptrend is intact
        (price above the 200-day), then PREFER pullbacks and AVOID blow-off
        tops. Correct for a high-friction multi-year physical holder.
      mode="chase": pure momentum, buy strength. Provided because you asked for
        it, but it is the wrong fit for ~18% round-trip friction. Flip with care.
  - No volume signal (spot has no meaningful volume, and you asked to omit it).
  - ATR is a volatility-regime input for tranche sizing, not a +/- score.
  - The gold-silver ratio is currency-independent (USDINR cancels) and is your
    gold-vs-silver allocation lever, not a nightly buy score.

Reuses the equity core's indicator definitions where they are identical.
Only pandas, numpy, and indicators.py are required.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from indicators import sma, rsi_wilder, kst

T_GATE_METALS = 3


# ===========================================================================
# 1. New indicators: ATR, Bollinger, gold-silver ratio
# ===========================================================================
def _wilder_smooth(series: pd.Series, n: int) -> pd.Series:
    """Wilder RMA seeded with the SMA of the first n values (as RSI uses)."""
    x = series.to_numpy(dtype="float64")
    out = np.full(x.shape, np.nan, dtype="float64")
    if len(x) < n:
        return pd.Series(out, index=series.index)
    seed = np.nanmean(x[:n])
    out[n - 1] = seed
    for i in range(n, len(x)):
        xi = x[i] if not np.isnan(x[i]) else 0.0
        out[i] = (out[i - 1] * (n - 1) + xi) / n
    return pd.Series(out, index=series.index)


def atr(high: pd.Series, low: pd.Series, close: pd.Series, n: int = 14) -> pd.Series:
    """
    Average True Range (Wilder). TR = max(high-low, |high-prev_close|,
    |low-prev_close|), then Wilder-smoothed over n. Needs high, low, close.
    """
    high = high.astype("float64")
    low = low.astype("float64")
    close = close.astype("float64")
    prev_close = close.shift(1)
    tr = pd.concat(
        [(high - low).abs(), (high - prev_close).abs(), (low - prev_close).abs()],
        axis=1,
    ).max(axis=1)
    tr.iloc[0] = (high.iloc[0] - low.iloc[0]) if len(tr) else np.nan
    return _wilder_smooth(tr, n)


def bollinger(close: pd.Series, n: int = 20, k: float = 2.0):
    """
    Bollinger bands. Returns (mid, upper, lower, pct_b, bandwidth).
      pct_b = (close - lower) / (upper - lower); 0.5 when the band has no width.
      bandwidth = (upper - lower) / mid.
    Population standard deviation (ddof=0), matching common charting packages.
    """
    close = close.astype("float64")
    mid = close.rolling(n, min_periods=n).mean()
    sd = close.rolling(n, min_periods=n).std(ddof=0)
    upper = mid + k * sd
    lower = mid - k * sd
    width = (upper - lower)
    pct_b = (close - lower) / width.where(width != 0)
    pct_b = pct_b.fillna(0.5)
    bandwidth = width / mid.where(mid != 0)
    return mid, upper, lower, pct_b, bandwidth


def gold_silver_ratio(gold: pd.Series, silver: pd.Series) -> pd.Series:
    """
    Gold price over silver price, aligned by index. Currency-independent: pass
    the USD legs or the INR legs, the ratio is identical because the exchange
    rate cancels. Compute from the USD legs to avoid dragging in USDINR noise.
    """
    g = gold.astype("float64")
    s = silver.astype("float64")
    joined = pd.concat([g, s], axis=1).dropna()
    return joined.iloc[:, 0] / joined.iloc[:, 1].where(joined.iloc[:, 1] != 0)


def classify_gsr(ratio_value, cheap=80.0, rich=50.0):
    """
    Allocation guidance from the ratio LEVEL, not a nightly score.
      >= cheap  -> 'silver_cheap'  (favour accumulating silver)
      <= rich   -> 'silver_rich'   (favour gold)
      between   -> 'neutral'
    Defaults follow the common 80/50 rule. The ratio can sit at an extreme for
    years, so this tilts allocation, it does not time entries.
    """
    r = _num(ratio_value)
    if r is None:
        return "unknown"
    if r >= cheap:
        return "silver_cheap"
    if r <= rich:
        return "silver_rich"
    return "neutral"


# ===========================================================================
# 2. Scoring
# ===========================================================================
def _num(x):
    if x is None:
        return None
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    return None if np.isnan(v) else v


def _score_kst(kst_v, signal_v):
    """Momentum-following (the ORIGINAL orientation, not the equity flip):
    reward positive momentum above its signal."""
    k = _num(kst_v)
    s = _num(signal_v)
    if k is None or s is None:
        return 0
    if k >= s and k > 0:
        return 2
    if k >= s and k <= 0:
        return 1
    if k < s and k > 0:
        return -1
    return -2


def _score_accumulate(rsi_v, pct_b_v, price, sma50):
    """Prefer pullbacks within the uptrend, avoid blow-off tops."""
    b = {}
    r = _num(rsi_v)
    if r is None:
        b["rsi"] = 0
    elif r < 30:
        b["rsi"] = 1          # deep pullback, cautious plus
    elif r < 45:
        b["rsi"] = 2          # pullback sweet spot
    elif r < 60:
        b["rsi"] = 1          # healthy trend
    elif r <= 70:
        b["rsi"] = 0
    elif r <= 80:
        b["rsi"] = -1
    else:
        b["rsi"] = -2         # blow-off, do not chase

    pb = _num(pct_b_v)
    if pb is None:
        b["bollinger"] = 0
    elif pb < 0.2:
        b["bollinger"] = 2    # stretched cheap within the trend
    elif pb < 0.5:
        b["bollinger"] = 1
    elif pb <= 0.8:
        b["bollinger"] = 0
    elif pb <= 1.0:
        b["bollinger"] = -1
    else:
        b["bollinger"] = -2   # above the upper band, blow-off

    p = _num(price)
    s50 = _num(sma50)
    b["dip_vs_50"] = 1 if (p is not None and s50 is not None and p < s50) else 0
    return b


def _score_chase(rsi_v, pct_b_v, price, sma50):
    """Pure momentum, buy strength. Provided for completeness only."""
    b = {}
    r = _num(rsi_v)
    if r is None:
        b["rsi"] = 0
    elif r > 70:
        b["rsi"] = 2
    elif r > 55:
        b["rsi"] = 1
    elif r >= 45:
        b["rsi"] = 0
    elif r >= 30:
        b["rsi"] = -1
    else:
        b["rsi"] = -2

    pb = _num(pct_b_v)
    if pb is None:
        b["bollinger"] = 0
    elif pb > 0.8:
        b["bollinger"] = 2
    elif pb > 0.5:
        b["bollinger"] = 1
    elif pb >= 0.2:
        b["bollinger"] = 0
    else:
        b["bollinger"] = -1

    p = _num(price)
    s50 = _num(sma50)
    b["above_50"] = 1 if (p is not None and s50 is not None and p > s50) else 0
    return b


def metals_technical_score(
    rsi=None,
    kst=None,
    kst_signal=None,
    price=None,
    sma50=None,
    sma200=None,
    pct_b=None,
    atr=None,
    atr_pct_ref=None,
    mode="accumulate",
):
    """
    Momentum-oriented technical score for one metal on its INR series.
    Returns (total, breakdown, meta).

    meta contains:
      regime        : 'uptrend' if price >= 200-day SMA else 'downtrend'
                      (in accumulate mode a downtrend suppresses the buy signal:
                       the secular thesis is what you are timing into)
      is_buy_signal : regime == 'uptrend' AND total >= T_GATE_METALS
      atr, atr_pct  : volatility level and ATR/price, for tranche sizing
      vol_regime    : 'high'/'normal'/'low' vs atr_pct_ref if supplied
    """
    b = {"kst": _score_kst(kst, kst_signal)}
    if mode == "chase":
        b.update(_score_chase(rsi, pct_b, price, sma50))
    else:
        b.update(_score_accumulate(rsi, pct_b, price, sma50))
    total = sum(b.values())

    p = _num(price)
    s200 = _num(sma200)
    regime = "unknown"
    if p is not None and s200 is not None:
        regime = "uptrend" if p >= s200 else "downtrend"

    a = _num(atr)
    atr_pct = (a / p) if (a is not None and p not in (None, 0)) else None
    vol_regime = "unknown"
    ref = _num(atr_pct_ref)
    if atr_pct is not None and ref is not None and ref > 0:
        if atr_pct >= 1.3 * ref:
            vol_regime = "high"
        elif atr_pct <= 0.7 * ref:
            vol_regime = "low"
        else:
            vol_regime = "normal"

    is_buy = (regime == "uptrend") and (total >= T_GATE_METALS)
    meta = {
        "regime": regime,
        "is_buy_signal": is_buy,
        "atr": a,
        "atr_pct": atr_pct,
        "vol_regime": vol_regime,
        "mode": mode,
    }
    return total, b, meta


def tranche_size(base_tranche, atr_pct, target_pct=0.02, floor=0.25, cap=2.0):
    """
    Volatility-scaled tranche for accumulation: buy smaller when the metal is
    more volatile. size = base * (target_pct / atr_pct), clamped to
    [floor*base, cap*base]. Returns base unchanged if atr_pct is unusable.
    """
    ap = _num(atr_pct)
    if ap is None or ap <= 0:
        return base_tranche
    raw = base_tranche * (target_pct / ap)
    return float(min(max(raw, floor * base_tranche), cap * base_tranche))


# ===========================================================================
# 3. Building the INR signal series and the snapshot
# ===========================================================================
def synth_inr_ohlc(usd_ohlc: pd.DataFrame, usdinr: pd.DataFrame, max_staleness_days=3):
    """
    Build the INR-denominated OHLC signal series as spot-USD x USDINR, joining
    the two feeds AS-OF (nearest earlier FX rate for each metal date). US and
    Indian holidays do not align, so this flags rows where the FX leg is older
    than max_staleness_days: do not emit a signal on a stale row.

    usd_ohlc : columns [date, open, high, low, close] in USD
    usdinr   : columns [date, rate]
    Returns the INR OHLC frame plus 'fx_rate', 'fx_age_days', 'is_stale'.
    """
    u = usd_ohlc.copy()
    u["date"] = pd.to_datetime(u["date"])
    u = u.sort_values("date").reset_index(drop=True)
    fx = usdinr.copy()
    fx["date"] = pd.to_datetime(fx["date"])
    fx = fx.sort_values("date").reset_index(drop=True)

    merged = pd.merge_asof(u, fx.rename(columns={"date": "fx_date"}),
                           left_on="date", right_on="fx_date", direction="backward")
    merged["fx_age_days"] = (merged["date"] - merged["fx_date"]).dt.days
    merged["is_stale"] = (merged["fx_age_days"].isna()) | (merged["fx_age_days"] > max_staleness_days)
    for c in ("open", "high", "low", "close"):
        merged[c] = merged[c] * merged["rate"]
    merged = merged.rename(columns={"rate": "fx_rate"})
    return merged[["date", "open", "high", "low", "close", "fx_rate", "fx_age_days", "is_stale"]]


def metals_snapshot(inr_ohlc: pd.DataFrame, mode="accumulate", atr_pct_ref=None):
    """
    Compute every technical input from an INR OHLC frame and return the latest
    row's score. Needs >= 200 rows for a defined 200-day SMA and regime.
    """
    df = inr_ohlc.copy()
    df["date"] = pd.to_datetime(df["date"])
    df = df.sort_values("date").reset_index(drop=True)
    close = df["close"].astype("float64")

    rsi = rsi_wilder(close, 14)
    kst_line, kst_sig = kst(close)
    s50 = sma(close, 50)
    s200 = sma(close, 200)
    _, _, _, pct_b, _ = bollinger(close, 20, 2.0)
    atr_series = atr(df["high"], df["low"], close, 14)

    def last(s):
        v = s.iloc[-1]
        return None if pd.isna(v) else float(v)

    total, b, meta = metals_technical_score(
        rsi=last(rsi), kst=last(kst_line), kst_signal=last(kst_sig),
        price=last(close), sma50=last(s50), sma200=last(s200),
        pct_b=last(pct_b), atr=last(atr_series),
        atr_pct_ref=atr_pct_ref, mode=mode,
    )
    stale = bool(df["is_stale"].iloc[-1]) if "is_stale" in df.columns else False
    meta["fx_stale"] = stale
    return {"t_score": total, "breakdown": b, **meta}

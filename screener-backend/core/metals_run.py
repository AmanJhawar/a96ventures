"""
metals_run.py
Nightly orchestration for the gold/silver leg of the screener. Plugs into the
same 23:00 IST run as the equity pipeline but is deliberately decoupled:

  - INPUT CONVENTION: the metals leg scores YESTERDAY'S SETTLED USD CLOSE.
    At 23:00 IST the global spot market is mid-session (~13:30 New York), so a
    price captured at run time is an intraday snapshot, not a close. Feed this
    module settled daily bars only; the newest bar should be the last fully
    completed global trading day. A one-day lag is irrelevant to a multi-year
    accumulator; a noisy close series is not.

  - FAILURE ISOLATION: if a metals feed is missing or the FX leg is stale, this
    module returns a record saying so and the caller marks the run 'partial'.
    The equity leg must never be blocked by a metals feed outage.

  - SIGNAL LOG, NOT CALLS: metal buy signals go to their own collection
    ('metal_signals'), never into the equity calls table. The calls table is
    the gated stock-picking track record; an accumulation nudge is a different
    thesis and recurring by design. price_at_signal is write-once downstream,
    same convention as equity calls.

  - MODE: accumulate (confirmed). The chase path exists in metals.py but is not
    wired here.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from metals import (
    synth_inr_ohlc,
    metals_snapshot,
    gold_silver_ratio,
    classify_gsr,
    atr,
    tranche_size,
)

METALS_LOGIC_VERSION = "m1"
MIN_BARS = 200          # 200-day SMA must be defined or there is no regime
ATR_REF_WINDOW = 250    # ~1 trading year; the reference for the vol regime


def _atr_pct_reference(inr_ohlc: pd.DataFrame, window=ATR_REF_WINDOW):
    """Median ATR/price over the trailing window: the metal's own 'normal'
    volatility, against which today's reading is judged high or low."""
    df = inr_ohlc.sort_values("date").reset_index(drop=True)
    close = df["close"].astype("float64")
    a = atr(df["high"], df["low"], close, 14)
    atr_pct = (a / close).replace([np.inf, -np.inf], np.nan).dropna()
    if len(atr_pct) == 0:
        return None
    tail = atr_pct.tail(window)
    return float(tail.median())


def score_metal(
    name: str,
    usd_ohlc: pd.DataFrame,
    usdinr: pd.DataFrame,
    base_tranche=None,
    max_staleness_days=3,
):
    """
    Score one metal for the nightly run. Returns a record dict; never raises on
    bad data, instead returns status != 'ok' so the caller can mark the run
    partial without killing the equity leg.

    usd_ohlc: settled daily bars [date, open, high, low, close] in USD.
    usdinr:   [date, rate].
    base_tranche: optional rupee amount; if given, a volatility-scaled tranche
                  suggestion is included when there is a buy signal.
    """
    rec = {
        "metal": name,
        "logic_version": METALS_LOGIC_VERSION,
        "status": "ok",
        "reason": None,
    }
    if usd_ohlc is None or len(usd_ohlc) == 0:
        rec.update(status="no_data", reason="usd feed empty")
        return rec
    if usdinr is None or len(usdinr) == 0:
        rec.update(status="no_data", reason="usdinr feed empty")
        return rec

    inr = synth_inr_ohlc(usd_ohlc, usdinr, max_staleness_days=max_staleness_days)
    if len(inr) < MIN_BARS:
        rec.update(status="insufficient_history",
                   reason=f"{len(inr)} bars < {MIN_BARS}")
        return rec

    ref = _atr_pct_reference(inr)
    snap = metals_snapshot(inr, mode="accumulate", atr_pct_ref=ref)

    last = inr.iloc[-1]
    rec.update({
        "bar_date": pd.Timestamp(last["date"]).date().isoformat(),
        "price_inr": float(last["close"]),
        "fx_rate": float(last["fx_rate"]) if not pd.isna(last["fx_rate"]) else None,
        "fx_stale": bool(last["is_stale"]),
        "t_score": snap["t_score"],
        "breakdown": snap["breakdown"],
        "regime": snap["regime"],
        "atr": snap["atr"],
        "atr_pct": snap["atr_pct"],
        "atr_pct_ref": ref,
        "vol_regime": snap["vol_regime"],
        "mode": snap["mode"],
    })

    # A stale FX leg records the row but suppresses the signal: never act on a
    # price whose currency leg is days old.
    if rec["fx_stale"]:
        rec["is_buy_signal"] = False
        rec["status"] = "stale_fx"
        rec["reason"] = "usdinr leg older than staleness limit"
    else:
        rec["is_buy_signal"] = bool(snap["is_buy_signal"])

    if rec["is_buy_signal"] and base_tranche is not None:
        rec["suggested_tranche"] = tranche_size(base_tranche, rec["atr_pct"])

    return rec


def run_metals_for_date(
    run_date,
    gold_usd: pd.DataFrame,
    silver_usd: pd.DataFrame,
    usdinr: pd.DataFrame,
    base_tranche_gold=None,
    base_tranche_silver=None,
):
    """
    The metals section of the nightly run. Returns (section_record,
    [metal_records], [signal_records]).

    section_record.status: 'ok' if both metals scored cleanly, 'partial' if
    either had a data problem. The caller merges this into the overall run row;
    a metals 'partial' must NOT fail the equity leg.

    The gold-silver ratio and its allocation stance ride on the section record:
    it is an allocation lever between the metals, not a per-metal score, and it
    is computed from the USD legs (currency-independent, so FX staleness cannot
    corrupt it).
    """
    gold_rec = score_metal("gold", gold_usd, usdinr, base_tranche=base_tranche_gold)
    silver_rec = score_metal("silver", silver_usd, usdinr, base_tranche=base_tranche_silver)
    for r in (gold_rec, silver_rec):
        r["run_date"] = run_date

    # gold-silver ratio from the USD closes
    gsr_value = None
    gsr_stance = "unknown"
    try:
        g = gold_usd.copy()
        s = silver_usd.copy()
        g["date"] = pd.to_datetime(g["date"])
        s["date"] = pd.to_datetime(s["date"])
        gs = pd.Series(g.sort_values("date")["close"].to_numpy(),
                       index=g.sort_values("date")["date"])
        ss = pd.Series(s.sort_values("date")["close"].to_numpy(),
                       index=s.sort_values("date")["date"])
        ratio = gold_silver_ratio(gs, ss)
        if len(ratio):
            gsr_value = float(ratio.iloc[-1])
            gsr_stance = classify_gsr(gsr_value)
    except Exception:
        pass  # the ratio is context; its failure must not fail the section

    statuses = {gold_rec["status"], silver_rec["status"]}
    section = {
        "run_date": run_date,
        "logic_version": METALS_LOGIC_VERSION,
        "status": "ok" if statuses == {"ok"} else "partial",
        "gsr": gsr_value,
        "gsr_stance": gsr_stance,   # silver_cheap | neutral | silver_rich
    }

    # Signal records: only clean buy signals, price frozen at signal time.
    # These go to 'metal_signals', never to the equity calls collection.
    signals = []
    for r in (gold_rec, silver_rec):
        if r.get("is_buy_signal"):
            sig = {
                "run_date": run_date,
                "metal": r["metal"],
                "bar_date": r["bar_date"],
                "price_at_signal": r["price_inr"],   # write-once downstream
                "t_score": r["t_score"],
                "regime": r["regime"],
                "vol_regime": r["vol_regime"],
                "gsr": gsr_value,
                "gsr_stance": gsr_stance,
                "logic_version": METALS_LOGIC_VERSION,
            }
            if "suggested_tranche" in r:
                sig["suggested_tranche"] = r["suggested_tranche"]
            signals.append(sig)

    return section, [gold_rec, silver_rec], signals

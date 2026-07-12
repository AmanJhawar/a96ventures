"""
scoring.py
Fundamental and technical scoring for the Beaten-Down Quality Screener.

Two fundamental engines share one technical engine:
  - non-bank fundamental score  0..10, gate 7
  - bank fundamental score      0..8,  gate 6
  - technical score (shared, mean-reversion orientation), gate 3

A symbol passes only if it clears BOTH its fundamental gate and the technical
gate. See build-plan v2 for the reasoning behind every criterion.

Design rule: each criterion is a pure function of the values passed in.
A missing or unparseable input scores 0 for that criterion (you cannot confirm
an improvement you cannot see). Nothing crashes and nothing silently scores a
point on bad data.
"""

from __future__ import annotations

import numpy as np

# Gates
F_GATE_NONBANK = 7
F_GATE_BANK = 6
T_GATE = 3


# ----------------------------------------------------------------------------
# safe numeric helpers
# ----------------------------------------------------------------------------
def _num(x):
    """Return x as a float, or None if it is missing / NaN / unparseable."""
    if x is None:
        return None
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    if np.isnan(v):
        return None
    return v


def _ratio(a, b):
    """a / b as a float, or None if either is missing or b is zero."""
    a = _num(a)
    b = _num(b)
    if a is None or b is None or b == 0:
        return None
    return a / b


# ----------------------------------------------------------------------------
# technical score (shared)
# ----------------------------------------------------------------------------
def technical_score(
    rsi=None,
    kst=None,
    kst_signal=None,
    price=None,
    sma50=None,
    sma200=None,
    volume=None,
    vol_sma20=None,
):
    """
    Mean-reversion technical score. Returns (total, breakdown_dict).

    The moving-average rule is kept as the full four-way test on purpose.
    In the main screener the price < 200 SMA hard filter guarantees price is
    always below sma200, so the two 'above 200' branches never fire and the
    block behaves as a two-way test. They exist for the Watchlist, where a
    hand-picked symbol may sit above its 200-day and must still be scored
    correctly rather than mislabelled with a beaten-down score.
    """
    b = {}

    # RSI tiers (Wilder). 30 is the 'ordinarily oversold' line.
    r = _num(rsi)
    if r is None:
        b["rsi"] = 0
    elif r < 30:
        b["rsi"] = 2
    elif r < 50:
        b["rsi"] = 1
    elif r <= 80:
        b["rsi"] = -1
    else:
        b["rsi"] = -2

    # KST vs its signal line and the zero line (mean-reversion orientation).
    k = _num(kst)
    ks = _num(kst_signal)
    if k is None or ks is None:
        b["kst"] = 0
    elif k < 0 and k >= ks:
        b["kst"] = 2          # oversold, turning up: best
    elif k < 0 and k < ks:
        b["kst"] = 1          # oversold, still falling
    elif k >= 0 and k < ks:
        b["kst"] = -1         # extended, rolling over
    else:
        b["kst"] = -2         # k >= 0 and k >= signal: extended, accelerating

    # Moving averages (four-way, kept whole).
    p = _num(price)
    s50 = _num(sma50)
    s200 = _num(sma200)
    if p is None or s50 is None or s200 is None:
        b["ma"] = 0
    elif p < s200 and p < s50:
        b["ma"] = 2           # deep, still sinking
    elif p < s200 and p >= s50:
        b["ma"] = 1           # below the long line, bouncing off the low
    elif p >= s200 and p < s50:
        b["ma"] = -1
    else:
        b["ma"] = -2          # above both

    # Volume (adjusted volume above its 20-period average).
    v = _num(volume)
    vs = _num(vol_sma20)
    b["volume"] = 1 if (v is not None and vs is not None and v > vs) else 0

    total = sum(b.values())
    return total, b


# ----------------------------------------------------------------------------
# non-bank fundamental score (0..10)
# ----------------------------------------------------------------------------
# Required keys in `current` and `prior` (annual figures):
NONBANK_KEYS = (
    "net_income",
    "total_assets",
    "borrowings",
    "revenue",
    "gross_margin",
    "current_ratio",
    "shares_outstanding",
    "ocf",
)


def ev_ebit(market_cap, borrowings, cash, ebit):
    """
    Enterprise value / EBIT.
      EV  = market_cap + net_debt = market_cap + (borrowings - cash)
      Returns None if EBIT is missing or <= 0, so loss-making firms are not
      awarded the value point (a negative EV/EBIT would look spuriously cheap).

    Pass market_cap in the same currency unit as borrowings and cash. For the
    5-year median, compute this at each historical point using the price on
    that date, then take the median outside this function.
    """
    mc = _num(market_cap)
    br = _num(borrowings)
    csh = _num(cash)
    e = _num(ebit)
    if mc is None or br is None or csh is None or e is None or e <= 0:
        return None
    ev = mc + (br - csh)
    return ev / e


def fundamental_score_nonbank(
    current,
    prior,
    ev_ebit_current=None,
    ev_ebit_median_5y=None,
):
    """
    Non-bank fundamental score, 0..10. Returns (total, breakdown_dict).

    Criteria (one point each), all year-on-year vs the prior fiscal year:
      net_income            net income positive (== positive ROA)
      roa_delta             ROA higher than last year (profitability trend)
      ocf_positive          operating cash flow positive
      accrual               OCF > net income (earnings are cash-backed)
      debt_asset_delta      borrowings/assets lower than last year
      current_ratio_delta   current ratio higher than last year
      no_dilution           shares outstanding not increased
      gross_margin_delta    gross margin higher than last year
      asset_turnover_delta  revenue/assets higher than last year
      ev_ebit_value         EV/EBIT below its own 5-year median

    ev_ebit_current and ev_ebit_median_5y are passed in because the median
    needs historical prices this function does not hold. Use ev_ebit() above.
    """
    c = current or {}
    p = prior or {}
    b = {}

    ni = _num(c.get("net_income"))
    b["net_income"] = 1 if (ni is not None and ni > 0) else 0

    roa_c = _ratio(c.get("net_income"), c.get("total_assets"))
    roa_p = _ratio(p.get("net_income"), p.get("total_assets"))
    b["roa_delta"] = 1 if (roa_c is not None and roa_p is not None and roa_c > roa_p) else 0

    ocf = _num(c.get("ocf"))
    b["ocf_positive"] = 1 if (ocf is not None and ocf > 0) else 0
    b["accrual"] = 1 if (ocf is not None and ni is not None and ocf > ni) else 0

    da_c = _ratio(c.get("borrowings"), c.get("total_assets"))
    da_p = _ratio(p.get("borrowings"), p.get("total_assets"))
    b["debt_asset_delta"] = 1 if (da_c is not None and da_p is not None and da_c < da_p) else 0

    cr_c = _num(c.get("current_ratio"))
    cr_p = _num(p.get("current_ratio"))
    b["current_ratio_delta"] = 1 if (cr_c is not None and cr_p is not None and cr_c > cr_p) else 0

    sh_c = _num(c.get("shares_outstanding"))
    sh_p = _num(p.get("shares_outstanding"))
    b["no_dilution"] = 1 if (sh_c is not None and sh_p is not None and sh_c <= sh_p) else 0

    gm_c = _num(c.get("gross_margin"))
    gm_p = _num(p.get("gross_margin"))
    b["gross_margin_delta"] = 1 if (gm_c is not None and gm_p is not None and gm_c > gm_p) else 0

    at_c = _ratio(c.get("revenue"), c.get("total_assets"))
    at_p = _ratio(p.get("revenue"), p.get("total_assets"))
    b["asset_turnover_delta"] = 1 if (at_c is not None and at_p is not None and at_c > at_p) else 0

    ev = _num(ev_ebit_current)
    evm = _num(ev_ebit_median_5y)
    b["ev_ebit_value"] = 1 if (ev is not None and evm is not None and ev < evm) else 0

    total = sum(b.values())
    return total, b


# ----------------------------------------------------------------------------
# bank fundamental score (0..8)  -- phase 2
# ----------------------------------------------------------------------------
# Required keys in `current` and `yoy` (SAME quarter one year earlier):
BANK_KEYS = (
    "gross_npa",
    "provision_coverage",
    "roa",
    "nim",
    "cost_to_income",
    "casa_ratio",
)


def fundamental_score_bank(
    current,
    yoy,
    pb_current=None,
    pb_median_5y=None,
):
    """
    Bank fundamental score, 0..8. Returns (total, breakdown_dict).

    IMPORTANT: `yoy` must be the SAME quarter one year earlier, never the
    previous sequential quarter. Indian bank asset quality and cost ratios are
    seasonal, so sequential comparison flips signals on seasonality alone.

    The CRAR / tier-1 capital adequacy check is a hard universe filter (see
    meets_crar below), not one of these scored points.

    Criteria (one point each):
      gross_npa_down     gross NPA lower than same quarter last year
      pcr_up             provision coverage higher than same quarter last year
      roa_positive       ROA positive
      roa_up             ROA higher than same quarter last year
      nim_up             net interest margin higher than same quarter last year
      cost_income_down   cost-to-income lower than same quarter last year
      pb_value           price-to-book below its own 5-year median
      casa_up            CASA ratio higher than same quarter last year
    """
    c = current or {}
    y = yoy or {}
    b = {}

    gn_c = _num(c.get("gross_npa"))
    gn_y = _num(y.get("gross_npa"))
    b["gross_npa_down"] = 1 if (gn_c is not None and gn_y is not None and gn_c < gn_y) else 0

    pcr_c = _num(c.get("provision_coverage"))
    pcr_y = _num(y.get("provision_coverage"))
    b["pcr_up"] = 1 if (pcr_c is not None and pcr_y is not None and pcr_c > pcr_y) else 0

    roa_c = _num(c.get("roa"))
    roa_y = _num(y.get("roa"))
    b["roa_positive"] = 1 if (roa_c is not None and roa_c > 0) else 0
    b["roa_up"] = 1 if (roa_c is not None and roa_y is not None and roa_c > roa_y) else 0

    nim_c = _num(c.get("nim"))
    nim_y = _num(y.get("nim"))
    b["nim_up"] = 1 if (nim_c is not None and nim_y is not None and nim_c > nim_y) else 0

    ci_c = _num(c.get("cost_to_income"))
    ci_y = _num(y.get("cost_to_income"))
    b["cost_income_down"] = 1 if (ci_c is not None and ci_y is not None and ci_c < ci_y) else 0

    pb = _num(pb_current)
    pbm = _num(pb_median_5y)
    b["pb_value"] = 1 if (pb is not None and pbm is not None and pb < pbm) else 0

    casa_c = _num(c.get("casa_ratio"))
    casa_y = _num(y.get("casa_ratio"))
    b["casa_up"] = 1 if (casa_c is not None and casa_y is not None and casa_c > casa_y) else 0

    total = sum(b.values())
    return total, b


# ----------------------------------------------------------------------------
# evaluate: combine fundamental + technical + gates for one symbol
# ----------------------------------------------------------------------------
def evaluate_nonbank(
    fundamental_current,
    fundamental_prior,
    technical,
    ev_ebit_current=None,
    ev_ebit_median_5y=None,
):
    """`technical` is a dict of keyword args for technical_score()."""
    f, fb = fundamental_score_nonbank(
        fundamental_current, fundamental_prior, ev_ebit_current, ev_ebit_median_5y
    )
    t, tb = technical_score(**technical)
    return {
        "engine": "nonbank",
        "f_score": f,
        "t_score": t,
        "f_pass": f >= F_GATE_NONBANK,
        "t_pass": t >= T_GATE,
        "passed": (f >= F_GATE_NONBANK) and (t >= T_GATE),
        "f_breakdown": fb,
        "t_breakdown": tb,
    }


def evaluate_bank(
    fundamental_current,
    fundamental_yoy,
    technical,
    pb_current=None,
    pb_median_5y=None,
):
    """`technical` is a dict of keyword args for technical_score()."""
    f, fb = fundamental_score_bank(
        fundamental_current, fundamental_yoy, pb_current, pb_median_5y
    )
    t, tb = technical_score(**technical)
    return {
        "engine": "bank",
        "f_score": f,
        "t_score": t,
        "f_pass": f >= F_GATE_BANK,
        "t_pass": t >= T_GATE,
        "passed": (f >= F_GATE_BANK) and (t >= T_GATE),
        "f_breakdown": fb,
        "t_breakdown": tb,
    }


# ----------------------------------------------------------------------------
# hard-filter predicates (pipeline-level convenience)
# ----------------------------------------------------------------------------
# These are single-stock predicates only. The debt/equity filter is
# sector-relative (below the sector median), so it needs the whole sector and
# lives in the pipeline, not here.

def in_market_cap_band(market_cap_cr, low_cr=5000.0, high_cr=100000.0):
    """market_cap_cr in crore. Band 5,000 cr to 100,000 cr inclusive."""
    mc = _num(market_cap_cr)
    return mc is not None and low_cr <= mc <= high_cr


def below_200sma(price, sma200):
    """The 'wall': a genuine multi-month drawdown."""
    p = _num(price)
    s = _num(sma200)
    return p is not None and s is not None and p < s


def meets_crar(crar, tier1, crar_floor=11.5, tier1_floor=9.5):
    """
    Bank capital-adequacy hard filter, replacing debt/equity for financials.
    Defaults are Basel III India with the capital conservation buffer
    (total 11.5%, tier-1 9.5%). VERIFY against current RBI norms before use;
    these are placeholders, not a live regulatory reference.
    """
    c = _num(crar)
    t = _num(tier1)
    return c is not None and t is not None and c >= crar_floor and t >= tier1_floor

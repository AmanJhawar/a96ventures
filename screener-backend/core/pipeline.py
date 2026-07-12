"""
pipeline.py
Data layer for the Beaten-Down Quality Screener. Turns raw NSE end-of-day
prices plus manually-sourced fundamentals into run / scores / calls records,
using indicators.py and scoring.py.

WHAT IS TESTED (see test_pipeline.py, runs offline):
  - corporate-action adjustment of price AND volume, and the turnover-
    conservation invariant (adj_close * adj_volume == raw price * volume)
  - daily market cap
  - historical EV/EBIT and price-to-book medians that use the price on each
    past reporting date (the reason this belongs in the pipeline, not scoring)
  - sector-relative debt/equity filter, sector routing, per-symbol screening
  - a full synthetic end-to-end run

WHAT IS NOT TESTED HERE:
  - the live NSE bhavcopy download and its column layout. This environment has
    no network access to NSE, and NSE changed to the UDiFF format around mid
    2024. The download/parse is isolated behind parse_bhavcopy / load_bhavcopy
    and MUST be verified against the current NSE file. Everything downstream is
    format-agnostic: feed it a DataFrame with the canonical columns and it runs.

UNIT CONVENTION (pin this or ratios come out wrong):
  - prices in rupees per share
  - shares_outstanding as an absolute count
  - all monetary fundamentals (borrowings, cash, operating_profit, book_value,
    net_income, total_assets, revenue) in rupees CRORE, as screener.in reports.
    money_unit defaults to 1e7 (rupees per crore) to reconcile the two.
"""

from __future__ import annotations

import io
import zipfile
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime

import numpy as np
import pandas as pd

from indicators import indicator_snapshot
from scoring import (
    evaluate_nonbank,
    evaluate_bank,
    in_market_cap_band,
    below_200sma,
    meets_crar,
    _num,
)

LOGIC_VERSION = "v1"

CANONICAL_COLUMNS = ["symbol", "series", "date", "open", "high", "low", "close", "volume"]


# ===========================================================================
# 1. NSE bhavcopy adapter  (ISOLATED, UNVERIFIED HERE, VERIFY THE LAYOUT)
# ===========================================================================
# Tolerant column mapping: UDiFF (2024+) names first, legacy names as fallback.
_COLUMN_ALIASES = {
    "symbol": ["TckrSymb", "SYMBOL"],
    "series": ["SctySrs", "SERIES"],
    "date": ["TradDt", "TIMESTAMP", "DATE1"],
    "open": ["OpnPric", "OPEN"],
    "high": ["HghPric", "HIGH"],
    "low": ["LwPric", "LOW"],
    "close": ["ClsPric", "CLOSE"],
    "volume": ["TtlTradgVol", "TOTTRDQTY"],
}


def parse_bhavcopy(df: pd.DataFrame, equity_series=("EQ", "BE")) -> pd.DataFrame:
    """
    Map a raw NSE bhavcopy DataFrame to the canonical schema and keep only
    equity series. Raises if a required column cannot be found under any known
    alias, which is your early signal that NSE changed the layout again.
    """
    cols = {c.strip(): c for c in df.columns}
    rename = {}
    for canon, aliases in _COLUMN_ALIASES.items():
        src = next((cols[a] for a in aliases if a in cols), None)
        if src is None:
            raise KeyError(
                f"bhavcopy: no column for '{canon}' among {aliases}; "
                f"NSE layout may have changed. Present columns: {list(df.columns)}"
            )
        rename[src] = canon
    out = df.rename(columns=rename)[list(_COLUMN_ALIASES)].copy()
    out["series"] = out["series"].astype(str).str.strip()
    out = out[out["series"].isin(equity_series)]
    out["date"] = pd.to_datetime(out["date"], errors="coerce", dayfirst=False)
    for c in ("open", "high", "low", "close", "volume"):
        out[c] = pd.to_numeric(out[c], errors="coerce")
    out = out.dropna(subset=["date", "close"])
    return out.reset_index(drop=True)


def load_bhavcopy(path_or_bytes) -> pd.DataFrame:
    """
    Load a bhavcopy from a local .csv or .csv.zip (path or raw bytes) and parse
    it. This is the OFFLINE path: use it with files you have downloaded and
    verified, and it is exercised the same way regardless of NSE's quirks.
    """
    if isinstance(path_or_bytes, (bytes, bytearray)):
        raw = bytes(path_or_bytes)
        if raw[:2] == b"PK":
            with zipfile.ZipFile(io.BytesIO(raw)) as z:
                name = z.namelist()[0]
                df = pd.read_csv(z.open(name))
        else:
            df = pd.read_csv(io.BytesIO(raw))
    else:
        if str(path_or_bytes).endswith(".zip"):
            with zipfile.ZipFile(path_or_bytes) as z:
                name = z.namelist()[0]
                df = pd.read_csv(z.open(name))
        else:
            df = pd.read_csv(path_or_bytes)
    return parse_bhavcopy(df)


def download_bhavcopy(day: date):
    """
    UNVERIFIED IN THIS ENVIRONMENT (no NSE network access). Best-effort fetch of
    the UDiFF common bhavcopy. NSE blocks non-browser agents and needs a session
    cookie, so this primes cookies off the homepage first. VERIFY the URL and
    the resulting columns against a live file before relying on it; if NSE has
    moved things, prefer downloading manually and using load_bhavcopy().
    """
    import urllib.request

    ymd = day.strftime("%Y%m%d")
    url = (
        "https://nsearchives.nseindia.com/content/cm/"
        f"BhavCopy_NSE_CM_0_0_0_{ymd}_F_0000.csv.zip"
    )
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
        ),
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
    }
    opener = urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor()
    )
    opener.addheaders = list(headers.items())
    opener.open("https://www.nseindia.com", timeout=20).read()  # prime cookies
    raw = opener.open(url, timeout=30).read()
    return load_bhavcopy(raw)


# ===========================================================================
# 2. Corporate-action adjustment  (THE TOP BUG SOURCE, fully tested)
# ===========================================================================
def bonus_factor(new: float, held: float) -> float:
    """Bonus 'new for every held' -> share multiplier. 1:1 -> 2.0, 2:1 -> 3.0."""
    return (new + held) / held


def split_factor(old_face: float, new_face: float) -> float:
    """Face-value split -> share multiplier. 10 -> 2 gives 5.0 (5 for 1)."""
    return old_face / new_face


@dataclass
class CorpAction:
    """A split or bonus. `factor` is the share multiplier R (>1).
    On the ex-date the market price already reflects the action; historical
    prices before it are scaled by 1/R and historical volume by R."""
    ex_date: object          # date / datetime / str
    factor: float


def adjust_prices(prices: pd.DataFrame, actions=None) -> pd.DataFrame:
    """
    Back-adjust one symbol's OHLCV for splits and bonuses.

    Convention: the most recent bar carries factor 1 (present basis). For a bar
    dated strictly before an ex-date, price *= 1/R and volume *= R, cumulatively
    over all later actions. Dividends are NOT handled (they do not change share
    count, so volume is untouched and price-only screening does not need them).

    Turnover is conserved by construction:
        adj_close * adj_volume == close * volume   at every bar.
    """
    df = prices.copy()
    df["date"] = pd.to_datetime(df["date"])
    df = df.sort_values("date").reset_index(drop=True)

    price_factor = np.ones(len(df), dtype="float64")
    for a in (actions or []):
        ex = pd.Timestamp(a.ex_date)
        if a.factor is None or a.factor <= 0:
            continue
        mask = (df["date"] < ex).to_numpy()
        price_factor[mask] *= 1.0 / float(a.factor)
    vol_factor = 1.0 / price_factor

    df["adj_close"] = df["close"].to_numpy() * price_factor
    df["adj_open"] = df["open"].to_numpy() * price_factor
    df["adj_high"] = df["high"].to_numpy() * price_factor
    df["adj_low"] = df["low"].to_numpy() * price_factor
    df["adj_volume"] = df["volume"].to_numpy() * vol_factor
    return df


# ===========================================================================
# 3. Derived quantities  (daily market cap, historical ratio medians)
# ===========================================================================
def market_cap_cr(latest_adj_close, shares_outstanding, money_unit=1e7):
    """
    Today's market cap in crore. The latest adjusted close equals the raw close
    (present basis, factor 1), so this is the live market cap. shares_outstanding
    must be the CURRENT post-split share count.
    """
    px = _num(latest_adj_close)
    sh = _num(shares_outstanding)
    if px is None or sh is None:
        return None
    return px * sh / money_unit


def _price_on_or_before(adj_series: pd.Series, when):
    """Adjusted close on the given date or the nearest earlier trading day."""
    if adj_series is None or len(adj_series) == 0:
        return None
    s = adj_series.sort_index()
    pos = s.index.searchsorted(pd.Timestamp(when), side="right") - 1
    if pos < 0:
        return None
    return float(s.iloc[pos])


def historical_ratio_median(adj_series, shares, periods, add_net_debt=False, money_unit=1e7):
    """
    Median of a valuation ratio across past reporting periods, valuing each
    period at the ADJUSTED price on its reporting date times CURRENT shares.

    Identity that makes this correct without historical share counts:
        adj_price_then * current_shares == raw_price_then * raw_shares_then
    because the adjustment factor absorbs exactly the split in share count.

    periods: list of dicts, each with 'end_date', 'denominator' (EBIT or book
    value in crore) and, when add_net_debt is True, 'borrowings' and 'cash'.
    A period with a missing denominator, non-positive denominator or no price on
    or before its date is skipped. Returns None if nothing is usable.
    """
    sh = _num(shares)
    if sh is None or adj_series is None or len(adj_series) == 0:
        return None
    s = adj_series.sort_index()
    ratios = []
    for p in periods or []:
        end = p.get("end_date")
        den = _num(p.get("denominator"))
        if end is None or den is None or den <= 0:
            continue
        px = _price_on_or_before(s, end)
        if px is None:
            continue
        mc_units = px * sh / money_unit
        add = 0.0
        if add_net_debt:
            b = _num(p.get("borrowings"))
            c = _num(p.get("cash"))
            if b is None or c is None:
                continue
            add = b - c
        ratios.append((mc_units + add) / den)
    if not ratios:
        return None
    return float(np.median(ratios))


def ev_ebit_current_and_median(adj_series, shares, fundamentals, money_unit=1e7):
    """(current EV/EBIT, 5-year median EV/EBIT) for a non-bank symbol."""
    cur = fundamentals.get("current") or {}
    periods = fundamentals.get("annual_periods") or []
    sh = _num(shares)
    latest_px = float(adj_series.iloc[-1]) if (adj_series is not None and len(adj_series)) else None

    ev_cur = None
    if latest_px is not None and sh is not None:
        mc_units = latest_px * sh / money_unit
        b = _num(cur.get("borrowings"))
        c = _num(cur.get("cash"))
        e = _num(cur.get("operating_profit"))
        if b is not None and c is not None and e is not None and e > 0:
            ev_cur = (mc_units + (b - c)) / e

    ev_med = historical_ratio_median(
        adj_series, sh,
        [{"end_date": p.get("end_date"),
          "denominator": p.get("operating_profit"),
          "borrowings": p.get("borrowings"),
          "cash": p.get("cash")} for p in periods],
        add_net_debt=True, money_unit=money_unit,
    )
    return ev_cur, ev_med


def pb_current_and_median(adj_series, shares, fundamentals, money_unit=1e7):
    """(current P/B, 5-year median P/B) for a bank symbol."""
    cur = fundamentals.get("current") or {}
    periods = fundamentals.get("book_periods") or []
    sh = _num(shares)
    latest_px = float(adj_series.iloc[-1]) if (adj_series is not None and len(adj_series)) else None

    pb_cur = None
    bv = _num(cur.get("book_value"))
    if latest_px is not None and sh is not None and bv is not None and bv > 0:
        mc_units = latest_px * sh / money_unit
        pb_cur = mc_units / bv

    pb_med = historical_ratio_median(
        adj_series, sh,
        [{"end_date": p.get("end_date"), "denominator": p.get("book_value")} for p in periods],
        add_net_debt=False, money_unit=money_unit,
    )
    return pb_cur, pb_med


# ===========================================================================
# 4. Per-symbol screening
# ===========================================================================
def _adj_series(adj_df: pd.DataFrame) -> pd.Series:
    return pd.Series(
        adj_df["adj_close"].to_numpy(dtype="float64"),
        index=pd.to_datetime(adj_df["date"]),
    )


def screen_symbol(meta, adj_df, fundamentals, sector_de_median=None, on_watchlist=False):
    """
    Score one symbol and decide its filter status. Returns a full score record.

    A record is a CALL only if it is in-universe (fails no hard filter) AND
    clears both gates. A Watchlist symbol that fails a hard filter is still
    scored and flagged, but is never a call.
    """
    is_fin = bool(meta.get("is_financial"))
    shares = _num(meta.get("shares_outstanding"))
    snap = indicator_snapshot(adj_df)          # dict keyed exactly for technical_score
    price = snap["price"]
    mc = market_cap_cr(price, shares)
    adj_series = _adj_series(adj_df)

    filters_failed = []
    if not in_market_cap_band(mc):
        filters_failed.append("market_cap_band")
    if not below_200sma(price, snap["sma200"]):
        filters_failed.append("above_200sma")

    if is_fin:
        if not meets_crar(fundamentals.get("crar"), fundamentals.get("tier1")):
            filters_failed.append("crar")
        val_cur, val_med = pb_current_and_median(adj_series, shares, fundamentals)
        result = evaluate_bank(
            fundamentals.get("current"), fundamentals.get("prior"),
            technical=snap, pb_current=val_cur, pb_median_5y=val_med,
        )
        value_key = "price_to_book"
    else:
        de = _num(fundamentals.get("debt_to_equity"))
        if sector_de_median is None or de is None or not (de < sector_de_median):
            filters_failed.append("debt_equity_sector")
        val_cur, val_med = ev_ebit_current_and_median(adj_series, shares, fundamentals)
        result = evaluate_nonbank(
            fundamentals.get("current"), fundamentals.get("prior"),
            technical=snap, ev_ebit_current=val_cur, ev_ebit_median_5y=val_med,
        )
        value_key = "ev_ebit"

    in_universe = len(filters_failed) == 0
    is_call = in_universe and result["f_pass"] and result["t_pass"]

    return {
        "symbol": meta.get("symbol"),
        "sector": meta.get("sector"),
        "engine": result["engine"],
        "f_score": result["f_score"],
        "t_score": result["t_score"],
        "f_pass": result["f_pass"],
        "t_pass": result["t_pass"],
        "in_universe": in_universe,
        "filters_failed": filters_failed,
        "is_call": is_call,
        "on_watchlist": on_watchlist,
        "price": price,
        "market_cap_cr": mc,
        "rsi": snap["rsi"],
        "kst": snap["kst"],
        "kst_signal": snap["kst_signal"],
        "sma50": snap["sma50"],
        "sma200": snap["sma200"],
        "volume": snap["volume"],
        "vol_sma20": snap["vol_sma20"],
        value_key: val_cur,
        value_key + "_median": val_med,
        "f_breakdown": result["f_breakdown"],
        "t_breakdown": result["t_breakdown"],
    }


# ===========================================================================
# 5. Run orchestration
# ===========================================================================
def ingest_and_adjust(raw_prices: dict, actions: dict) -> dict:
    """raw_prices: {symbol: OHLCV DataFrame}; actions: {symbol: [CorpAction]}.
    Returns {symbol: adjusted DataFrame}."""
    return {s: adjust_prices(df, actions.get(s, [])) for s, df in raw_prices.items()}


def _sector_de_medians(symbols, fundamentals) -> dict:
    """Median current debt/equity per sector, over non-financial symbols only."""
    buckets = defaultdict(list)
    for m in symbols:
        if m.get("is_financial"):
            continue
        f = fundamentals.get(m["symbol"])
        de = _num(f.get("debt_to_equity")) if f else None
        if de is None:
            continue
        buckets[m.get("sector")].append(de)
    return {sec: float(np.median(v)) for sec, v in buckets.items() if v}


def run_for_date(
    run_date,
    symbols,
    adj_prices,
    fundamentals,
    watchlist=None,
    min_bars=200,
    logic_version=LOGIC_VERSION,
):
    """
    Score the union of universe symbols and the Watchlist for one date.

    symbols: [{symbol, sector, is_financial, shares_outstanding}, ...]
    adj_prices: {symbol: adjusted DataFrame}
    fundamentals: {symbol: bundle}  (see module docstring / demo for the shape)
    watchlist: iterable of symbols

    Returns (run_record, [score_records], [call_records]). A symbol with fewer
    than min_bars adjusted bars is skipped (no meaningful moving-average score).
    """
    watchlist = set(watchlist or [])
    metas = {m["symbol"]: m for m in symbols}
    sector_de = _sector_de_medians(symbols, fundamentals)
    scored_syms = set(metas) | watchlist

    scores = []
    for sym in sorted(scored_syms):
        meta = metas.get(sym)
        adf = adj_prices.get(sym)
        fund = fundamentals.get(sym)
        if meta is None or adf is None or fund is None or len(adf) < min_bars:
            continue
        rec = screen_symbol(
            meta, adf, fund,
            sector_de_median=sector_de.get(meta.get("sector")),
            on_watchlist=(sym in watchlist),
        )
        rec["run_date"] = run_date
        scores.append(rec)

    calls = [
        {
            "run_date": run_date,
            "symbol": r["symbol"],
            "engine": r["engine"],
            "price_at_call": r["price"],   # write-once downstream; never rewritten on a re-run
            "f_score": r["f_score"],
            "t_score": r["t_score"],
        }
        for r in scores if r["is_call"]
    ]

    run = {
        "run_date": run_date,
        "logic_version": logic_version,
        "universe_count": len(metas),
        "scored_count": len(scores),
        "passed_count": len(calls),
        "status": "ok",
    }
    return run, scores, calls


# ===========================================================================
# 6. Offline demo  (no network): fabricate prices, adjust, run, print
# ===========================================================================
def _fake_ohlcv(start, n, p0, p1, seed=0, base_vol=1_000_000, bump_last=1.0):
    rng = np.random.default_rng(seed)
    trend = np.linspace(p0, p1, n)
    close = np.maximum(trend + rng.normal(0, max(p0, p1) * 0.004, n), 1.0)
    vol = np.clip(base_vol * (1 + rng.normal(0, 0.08, n)), 1, None)
    vol[-1] *= bump_last
    dates = pd.bdate_range(start=start, periods=n)
    return pd.DataFrame({
        "date": dates, "open": close, "high": close * 1.01,
        "low": close * 0.99, "close": close, "volume": vol.astype("int64"),
    })


def _demo():
    start = "2025-01-01"
    n = 260

    # a beaten-down but solid non-bank: steady decline -> below both SMAs, low RSI
    solid_px = _fake_ohlcv(start, n, 200, 120, seed=1, bump_last=3.0)
    # an extended strong non-bank: uptrend to highs -> above both SMAs, high RSI
    hot_px = _fake_ohlcv(start, n, 90, 240, seed=2)
    # a small-cap that will fail the market-cap band (watchlist only)
    tiny_px = _fake_ohlcv(start, n, 60, 40, seed=3)

    raw = {"SOLIDCO": solid_px, "HOTCO": hot_px, "TINYCO": tiny_px}
    # No split here: these fabricated prices are smooth and do NOT contain the
    # real split-day price drop, so applying a CorpAction would fake a jump.
    # The adjustment engine is exercised properly in test_pipeline.py.
    adj = ingest_and_adjust(raw, actions={})

    symbols = [
        {"symbol": "SOLIDCO", "sector": "IT", "is_financial": False, "shares_outstanding": 1_000_000_000},
        {"symbol": "HOTCO", "sector": "IT", "is_financial": False, "shares_outstanding": 1_000_000_000},
        {"symbol": "TINYCO", "sector": "IT", "is_financial": False, "shares_outstanding": 5_000_000},
    ]

    def fy(y, m=3, d=31):
        return pd.Timestamp(f"{y}-{m:02d}-{d:02d}")

    solid_fund = {
        "current": dict(net_income=120, total_assets=1000, borrowings=100, cash=40,
                        operating_profit=180, revenue=900, gross_margin=42,
                        current_ratio=2.1, shares_outstanding=50_000_000, ocf=150),
        "prior": dict(net_income=90, total_assets=1000, borrowings=150, cash=30,
                      operating_profit=150, revenue=800, gross_margin=38,
                      current_ratio=1.8, shares_outstanding=50_000_000, ocf=110),
        "annual_periods": [
            dict(end_date=fy(2021), operating_profit=140, borrowings=170, cash=25),
            dict(end_date=fy(2022), operating_profit=150, borrowings=160, cash=28),
            dict(end_date=fy(2023), operating_profit=160, borrowings=150, cash=30),
            dict(end_date=fy(2024), operating_profit=170, borrowings=130, cash=35),
            dict(end_date=fy(2025), operating_profit=180, borrowings=100, cash=40),
        ],
        "debt_to_equity": 0.15,
    }
    hot_fund = {
        "current": dict(net_income=30, total_assets=1000, borrowings=500, cash=10,
                        operating_profit=60, revenue=600, gross_margin=25,
                        current_ratio=1.1, shares_outstanding=40_000_000, ocf=20),
        "prior": dict(net_income=40, total_assets=900, borrowings=450, cash=15,
                      operating_profit=70, revenue=650, gross_margin=28,
                      current_ratio=1.3, shares_outstanding=38_000_000, ocf=45),
        "annual_periods": [dict(end_date=fy(2025), operating_profit=60, borrowings=500, cash=10)],
        "debt_to_equity": 0.90,
    }
    tiny_fund = {
        "current": dict(net_income=5, total_assets=100, borrowings=10, cash=5,
                        operating_profit=8, revenue=90, gross_margin=20,
                        current_ratio=1.2, shares_outstanding=5_000_000, ocf=6),
        "prior": dict(net_income=4, total_assets=95, borrowings=12, cash=4,
                      operating_profit=7, revenue=85, gross_margin=19,
                      current_ratio=1.1, shares_outstanding=5_000_000, ocf=5),
        "annual_periods": [dict(end_date=fy(2025), operating_profit=8, borrowings=10, cash=5)],
        "debt_to_equity": 0.60,
    }
    fundamentals = {"SOLIDCO": solid_fund, "HOTCO": hot_fund, "TINYCO": tiny_fund}

    run, scores, calls = run_for_date(
        "2025-12-31", symbols, adj, fundamentals, watchlist={"TINYCO"},
    )

    print("RUN:", run)
    print("\nSCORES:")
    for r in scores:
        print(f"  {r['symbol']:8} {r['engine']:7} F={r['f_score']:2} T={r['t_score']:2} "
              f"cap={r['market_cap_cr']:.0f}cr  in_universe={r['in_universe']} "
              f"call={r['is_call']}  failed={r['filters_failed']}")
    print("\nCALLS:")
    for c in calls:
        print(f"  {c['symbol']:8} {c['engine']:7} price_at_call={c['price_at_call']:.2f} "
              f"F={c['f_score']} T={c['t_score']}")


if __name__ == "__main__":
    _demo()

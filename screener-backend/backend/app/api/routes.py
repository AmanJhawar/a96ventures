"""
routes.py
FastAPI read API for the screener frontend.

All endpoints return JSON. The frontend fetches these from the Next.js dev server
via proxy or directly. CORS is handled at the app level (server.py).
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/api")

# The store is injected at startup via set_store_for_routes()
_store = None


def set_store_for_routes(store):
    global _store
    _store = store


def _get_store():
    if _store is None:
        raise HTTPException(status_code=503, detail="Store not initialised")
    return _store


# ── Screener ──────────────────────────────────────────────────────────

@router.get("/screener/latest")
def screener_latest():
    """
    Segmented gate-passers (bank / non-bank) plus metals panel.
    Never raw-sorts bank and non-bank F-scores together (invariant §9).
    """
    store = _get_store()
    latest = store.get_screener_latest()
    calls = latest.get("calls", [])
    metals = latest.get("metals")

    # Segment by engine
    nonbank = sorted(
        [c for c in calls if c.get("engine") == "nonbank"],
        key=lambda x: x.get("f_score", 0),
        reverse=True,
    )
    bank = sorted(
        [c for c in calls if c.get("engine") == "bank"],
        key=lambda x: x.get("f_score", 0),
        reverse=True,
    )

    # Find the run date from the latest run
    runs = store.get_runs_index()
    run_date = runs[0]["run_date"] if runs else None
    run_record = store.get_run(run_date) if run_date else None

    return {
        "run_date": run_date,
        "run_status": run_record.get("status") if run_record else None,
        "nonbank": nonbank,
        "bank": bank,
        "metals": metals,
    }


# ── Watchlist ─────────────────────────────────────────────────────────

@router.get("/watchlist")
def list_watchlist():
    store = _get_store()
    symbols = store.get_watchlist()

    # Enrich with latest scores if available
    runs = store.get_runs_index()
    if not runs:
        return {"symbols": [{"symbol": s} for s in symbols]}

    latest_date = runs[0]["run_date"]
    scores = store.get_scores(latest_date)
    scores_by_sym = {s["symbol"]: s for s in scores}

    enriched = []
    for sym in symbols:
        score = scores_by_sym.get(sym, {})
        meta = store.get_symbol_metadata(sym) or {}
        enriched.append({
            "symbol": sym,
            "name": meta.get("name", ""),
            "f_score": score.get("f_score"),
            "t_score": score.get("t_score"),
            "engine": score.get("engine"),
            "is_call": score.get("is_call"),
            "filters_failed": score.get("filters_failed", []),
            "in_universe": score.get("in_universe"),
            "price": score.get("price"),
        })
    return {"symbols": enriched, "run_date": latest_date}


@router.post("/watchlist/{symbol}")
def add_to_watchlist(symbol: str):
    store = _get_store()
    sym = symbol.upper()
    
    if store.has_watchlist(sym):
        raise HTTPException(status_code=409, detail=f"{sym} is already on your watchlist")
        
    known = store.get_known_symbols()
    if known and sym not in known:
        raise HTTPException(status_code=422, detail=f"{sym} is not a recognised NSE symbol")
        
    store.add_watchlist(sym)
    return {"status": "added", "symbol": sym}


@router.delete("/watchlist/{symbol}")
def remove_from_watchlist(symbol: str):
    store = _get_store()
    store.remove_watchlist(symbol)
    return {"status": "removed", "symbol": symbol.upper()}


@router.get("/symbols")
def get_symbols():
    """List of all known valid symbols."""
    store = _get_store()
    return {"symbols": sorted(list(store.get_known_symbols()))}


@router.get("/symbols/search")
def search_symbols(q: str):
    """Search symbols by ticker or company name."""
    store = _get_store()
    if not q or len(q) < 2:
        return {"results": []}
    
    results = store.search_symbols(q)
    return {"results": results}


# ── Logs ──────────────────────────────────────────────────────────────

@router.get("/logs")
def list_runs():
    """Run dates + statuses for the sidebar."""
    store = _get_store()
    return {"runs": store.get_runs_index()}


@router.get("/logs/{run_date}")
def get_log(run_date: str):
    """Full scored set + calls + metals for a specific date."""
    store = _get_store()
    run = store.get_run(run_date)
    if run is None:
        raise HTTPException(status_code=404, detail=f"No run for {run_date}")

    scores = store.get_scores(run_date)
    calls = store.get_calls(run_date)
    metal_scores = store.get_metal_scores(run_date)
    metal_signals = store.get_metal_signals(run_date)

    return {
        "run": run,
        "scores": scores,
        "calls": calls,
        "metal_scores": metal_scores,
        "metal_signals": metal_signals,
    }


# ── Stock detail ──────────────────────────────────────────────────────

@router.get("/stock/{symbol}")
def get_stock(symbol: str):
    """Latest score, breakdown, price history, and call history for one symbol."""
    store = _get_store()
    symbol = symbol.upper()

    # Latest score
    runs = store.get_runs_index()
    score = None
    if runs:
        latest_date = runs[0]["run_date"]
        scores = store.get_scores(latest_date)
        score = next((s for s in scores if s["symbol"] == symbol), None)

    # Price history
    prices = store.get_prices(symbol)

    # Call history
    call_history = store.get_call_history(symbol)

    if score is None and not prices:
        raise HTTPException(status_code=404, detail=f"No data for {symbol}")

    return {
        "symbol": symbol,
        "score": score,
        "prices": prices,
        "call_history": call_history,
    }


# ── Metals ────────────────────────────────────────────────────────────

@router.get("/metals/latest")
def metals_latest():
    """Latest metal scores + signals + GSR."""
    store = _get_store()
    return store.get_latest_metals()

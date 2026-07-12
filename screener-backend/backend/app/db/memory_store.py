"""
memory_store.py
In-memory dict-backed Store for local development and testing.

Enforces every invariant the Firestore implementation must also enforce:
  - price_at_call is write-once per (run_date, symbol)
  - price_at_signal is write-once per (run_date, metal)
  - re-run replaces scores but preserves frozen prices
  - price arrays are capped at PRICE_CAP entries
"""

from __future__ import annotations

import copy
from collections import defaultdict

PRICE_CAP = 400


class MemoryStore:
    """Dict-backed implementation of the Store protocol."""

    def __init__(self):
        self._runs: dict[str, dict] = {}                   # run_date -> record
        self._scores: dict[str, list[dict]] = {}            # run_date -> [records]
        self._calls: dict[str, dict[str, dict]] = {}        # run_date -> {symbol: record}
        self._metal_scores: dict[str, list[dict]] = {}      # run_date -> [records]
        self._metal_signals: dict[str, dict[str, dict]] = {}  # run_date -> {metal: record}
        self._screener_latest: dict = {"calls": [], "metals": None}
        self._prices: dict[str, list[dict]] = {}            # symbol -> [rows]
        self._raw_prices: dict[str, list[dict]] = {}        # symbol -> [rows] (unadjusted)
        self._watchlist: set[str] = set()
        self._known_symbols: dict[str, dict] = {}

    # ── runs ──────────────────────────────────────────────────────────
    def write_run(self, run_date: str, record: dict) -> None:
        self._runs[run_date] = copy.deepcopy(record)

    def get_run(self, run_date: str) -> dict | None:
        r = self._runs.get(run_date)
        return copy.deepcopy(r) if r else None

    def get_runs_index(self) -> list[dict]:
        return sorted(
            [{"run_date": k, "status": v.get("status", "unknown")}
             for k, v in self._runs.items()],
            key=lambda x: x["run_date"],
            reverse=True,
        )

    # ── scores ────────────────────────────────────────────────────────
    def write_scores(self, run_date: str, records: list[dict]) -> None:
        self._scores[run_date] = copy.deepcopy(records)

    def get_scores(self, run_date: str) -> list[dict]:
        return copy.deepcopy(self._scores.get(run_date, []))

    # ── calls (price_at_call is WRITE-ONCE) ───────────────────────────
    def write_calls(self, run_date: str, records: list[dict]) -> None:
        if run_date not in self._calls:
            self._calls[run_date] = {}
        bucket = self._calls[run_date]
        for rec in records:
            sym = rec["symbol"]
            if sym in bucket:
                # WRITE-ONCE: preserve the original price_at_call
                frozen_price = bucket[sym]["price_at_call"]
                new = copy.deepcopy(rec)
                new["price_at_call"] = frozen_price
                bucket[sym] = new
            else:
                bucket[sym] = copy.deepcopy(rec)

    def get_calls(self, run_date: str) -> list[dict]:
        bucket = self._calls.get(run_date, {})
        return list(copy.deepcopy(bucket).values())

    def get_call_history(self, symbol: str) -> list[dict]:
        out = []
        for run_date, bucket in sorted(self._calls.items()):
            if symbol in bucket:
                rec = copy.deepcopy(bucket[symbol])
                rec["run_date"] = run_date
                out.append(rec)
        return out

    # ── metal scores ──────────────────────────────────────────────────
    def write_metal_scores(self, run_date: str, records: list[dict]) -> None:
        self._metal_scores[run_date] = copy.deepcopy(records)

    def get_metal_scores(self, run_date: str) -> list[dict]:
        return copy.deepcopy(self._metal_scores.get(run_date, []))

    # ── metal signals (price_at_signal is WRITE-ONCE) ─────────────────
    def write_metal_signals(self, run_date: str, records: list[dict]) -> None:
        if run_date not in self._metal_signals:
            self._metal_signals[run_date] = {}
        bucket = self._metal_signals[run_date]
        for rec in records:
            metal = rec["metal"]
            if metal in bucket:
                # WRITE-ONCE: preserve the original price_at_signal
                frozen_price = bucket[metal]["price_at_signal"]
                new = copy.deepcopy(rec)
                new["price_at_signal"] = frozen_price
                bucket[metal] = new
            else:
                bucket[metal] = copy.deepcopy(rec)

    def get_metal_signals(self, run_date: str) -> list[dict]:
        bucket = self._metal_signals.get(run_date, {})
        return list(copy.deepcopy(bucket).values())

    # ── screener latest (denormalised page payload) ───────────────────
    def write_screener_latest(self, records: list[dict], metals: dict | None = None) -> None:
        self._screener_latest = {
            "calls": copy.deepcopy(records),
            "metals": copy.deepcopy(metals),
        }

    def get_screener_latest(self) -> dict:
        return copy.deepcopy(self._screener_latest)

    # ── latest metals snapshot ────────────────────────────────────────
    def get_latest_metals(self) -> dict:
        # Find the most recent run_date with metal scores
        if not self._metal_scores:
            return {"scores": [], "signals": [], "section": None}
        latest_date = max(self._metal_scores.keys())
        return {
            "run_date": latest_date,
            "scores": self.get_metal_scores(latest_date),
            "signals": self.get_metal_signals(latest_date),
            "section": self._runs.get(latest_date, {}).get("metals_section"),
        }

    # ── prices (capped ~400 day array per symbol) ─────────────────────
    def write_prices(self, symbol: str, rows: list[dict]) -> None:
        existing = self._prices.get(symbol, [])
        existing_dates = {r["date"] for r in existing}
        for r in rows:
            if r["date"] not in existing_dates:
                existing.append(copy.deepcopy(r))
                existing_dates.add(r["date"])
        # Sort by date, cap at PRICE_CAP (keep most recent)
        existing.sort(key=lambda x: x["date"])
        self._prices[symbol] = existing[-PRICE_CAP:]

    def get_prices(self, symbol: str) -> list[dict]:
        return copy.deepcopy(self._prices.get(symbol, []))

    # ── raw_prices (unadjusted daily price history, capped ~400 day array per symbol) ──
    def write_raw_prices(self, symbol: str, rows: list[dict]) -> None:
        existing = self._raw_prices.get(symbol, [])
        existing_dates = {r["date"] for r in existing}
        for r in rows:
            if r["date"] not in existing_dates:
                existing.append(copy.deepcopy(r))
                existing_dates.add(r["date"])
        # Sort by date, cap at PRICE_CAP (keep most recent)
        existing.sort(key=lambda x: x["date"])
        self._raw_prices[symbol] = existing[-PRICE_CAP:]

    def get_raw_prices(self, symbol: str) -> list[dict]:
        return copy.deepcopy(self._raw_prices.get(symbol, []))

    # ── watchlist (single-user CRUD) ──────────────────────────────────
    def get_watchlist(self) -> list[str]:
        return sorted(self._watchlist)

    def add_watchlist(self, symbol: str) -> None:
        self._watchlist.add(symbol.upper())

    def remove_watchlist(self, symbol: str) -> None:
        self._watchlist.discard(symbol.upper())

    def has_watchlist(self, symbol: str) -> bool:
        return symbol.upper() in self._watchlist

    # ── known universe ────────────────────────────────────────────────
    def set_known_symbols(self, symbols: list[dict]) -> None:
        self._known_symbols = {s["symbol"].upper(): copy.deepcopy(s) for s in symbols}

    def get_known_symbols(self) -> set[str]:
        return set(self._known_symbols.keys())

    def get_symbol_metadata(self, symbol: str) -> dict | None:
        return copy.deepcopy(self._known_symbols.get(symbol.upper()))

    def search_symbols(self, query: str, limit: int = 8) -> list[dict]:
        q = query.lower()
        results = []
        for sym, data in self._known_symbols.items():
            if q in sym.lower() or q in data.get("name", "").lower():
                results.append(data)
                if len(results) >= limit:
                    break
        return results

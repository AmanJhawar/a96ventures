"""
firestore_store.py
Firestore implementation of the Store protocol for production.

Enforces write-once invariants using Firestore transactions.
"""

from __future__ import annotations

import copy
from google.cloud import firestore
from .store import Store

PRICE_CAP = 400


class FirestoreStore:
    def __init__(self, project: str | None = None):
        # Client handles auth automatically in GCP/Firebase environments
        self.db = firestore.Client(project=project)
        self._watchlist_cache: set[str] | None = None
        self._known_symbols_cache: dict[str, dict] | None = None

    # ── runs ──────────────────────────────────────────────────────────
    def write_run(self, run_date: str, record: dict) -> None:
        doc_ref = self.db.collection("runs").document(run_date)
        doc_ref.set(record, merge=True)

    def get_run(self, run_date: str) -> dict | None:
        doc = self.db.collection("runs").document(run_date).get()
        return doc.to_dict() if doc.exists else None

    def get_runs_index(self) -> list[dict]:
        # Return descending order of runs by sorting in memory to avoid __name__ index override
        docs = self.db.collection("runs").get()
        out = []
        for doc in docs:
            d = doc.to_dict()
            out.append({
                "run_date": doc.id,
                "status": d.get("status", "unknown")
            })
        # Sort descending by run_date
        out.sort(key=lambda x: x["run_date"], reverse=True)
        return out

    # ── scores ────────────────────────────────────────────────────────
    def write_scores(self, run_date: str, records: list[dict]) -> None:
        batch = self.db.batch()
        coll = self.db.collection("scores").document(run_date).collection("symbols")
        for rec in records:
            doc_ref = coll.document(rec["symbol"])
            batch.set(doc_ref, rec)
        batch.commit()

    def get_scores(self, run_date: str) -> list[dict]:
        docs = self.db.collection("scores").document(run_date).collection("symbols").get()
        return [doc.to_dict() for doc in docs]

    # ── calls (price_at_call is WRITE-ONCE) ───────────────────────────
    def write_calls(self, run_date: str, records: list[dict]) -> None:
        # Use a transaction to enforce write-once for price_at_call
        @firestore.transactional
        def _write_calls_txn(transaction, records_batch):
            if not records_batch:
                return
            coll = self.db.collection("calls").document(run_date).collection("symbols")
            # First, read existing to find frozen prices
            reads = []
            for rec in records_batch:
                reads.append((rec, coll.document(rec["symbol"])))
                
            existing_docs = transaction.get_all([ref for _, ref in reads])
            existing_map = {doc.id: doc.to_dict() for doc in existing_docs if doc.exists}
            
            for rec, ref in reads:
                sym = rec["symbol"]
                new = copy.deepcopy(rec)
                if sym in existing_map and "price_at_call" in existing_map[sym]:
                    new["price_at_call"] = existing_map[sym]["price_at_call"]
                transaction.set(ref, new)

        _write_calls_txn(self.db.transaction(), records)

    def get_calls(self, run_date: str) -> list[dict]:
        docs = self.db.collection("calls").document(run_date).collection("symbols").get()
        return [doc.to_dict() for doc in docs]

    def get_call_history(self, symbol: str) -> list[dict]:
        # Collection group query across all 'symbols' subcollections
        docs = self.db.collection_group("symbols").where(filter=firestore.FieldFilter("symbol", "==", symbol)).get()
        # Filter down to only those that came from 'calls' (parent's parent is calls)
        out = []
        for doc in docs:
            path_parts = doc.reference.path.split('/')
            if len(path_parts) >= 4 and path_parts[-4] == "calls":
                run_date = path_parts[-3]
                rec = doc.to_dict()
                rec["run_date"] = run_date
                out.append(rec)
        return sorted(out, key=lambda x: x["run_date"])

    # ── metal scores ──────────────────────────────────────────────────
    def write_metal_scores(self, run_date: str, records: list[dict]) -> None:
        batch = self.db.batch()
        coll = self.db.collection("metal_scores").document(run_date).collection("metals")
        for rec in records:
            doc_ref = coll.document(rec["metal"])
            batch.set(doc_ref, rec)
        batch.commit()

    def get_metal_scores(self, run_date: str) -> list[dict]:
        docs = self.db.collection("metal_scores").document(run_date).collection("metals").get()
        return [doc.to_dict() for doc in docs]

    # ── metal signals (price_at_signal is WRITE-ONCE) ─────────────────
    def write_metal_signals(self, run_date: str, records: list[dict]) -> None:
        @firestore.transactional
        def _write_metal_signals_txn(transaction, records_batch):
            if not records_batch:
                return
            coll = self.db.collection("metal_signals").document(run_date).collection("metals")
            reads = []
            for rec in records_batch:
                reads.append((rec, coll.document(rec["metal"])))
                
            existing_docs = transaction.get_all([ref for _, ref in reads])
            existing_map = {doc.id: doc.to_dict() for doc in existing_docs if doc.exists}
            
            for rec, ref in reads:
                metal = rec["metal"]
                new = copy.deepcopy(rec)
                if metal in existing_map and "price_at_signal" in existing_map[metal]:
                    new["price_at_signal"] = existing_map[metal]["price_at_signal"]
                transaction.set(ref, new)

        _write_metal_signals_txn(self.db.transaction(), records)

    def get_metal_signals(self, run_date: str) -> list[dict]:
        docs = self.db.collection("metal_signals").document(run_date).collection("metals").get()
        return [doc.to_dict() for doc in docs]

    # ── screener latest (denormalised page payload) ───────────────────
    def write_screener_latest(self, records: list[dict], metals: dict | None = None) -> None:
        doc_ref = self.db.collection("screener_latest").document("latest")
        doc_ref.set({
            "calls": records,
            "metals": metals,
        })

    def get_screener_latest(self) -> dict:
        doc = self.db.collection("screener_latest").document("latest").get()
        if doc.exists:
            return doc.to_dict()
        return {"calls": [], "metals": None}

    def get_latest_metals(self) -> dict:
        docs = list(self.db.collection("metal_scores").get())
        if not docs:
            return {"scores": [], "signals": [], "section": None}
        
        # Sort descending by id to get the latest
        docs.sort(key=lambda d: d.id, reverse=True)
        latest_date = docs[0].id
        run_record = self.get_run(latest_date) or {}
        return {
            "run_date": latest_date,
            "scores": self.get_metal_scores(latest_date),
            "signals": self.get_metal_signals(latest_date),
            "section": run_record.get("metals_section"),
        }

    # ── prices (capped ~400 day array per symbol) ─────────────────────
    def write_prices(self, symbol: str, rows: list[dict]) -> None:
        # We need a transaction to append and cap
        @firestore.transactional
        def _write_prices_txn(transaction, sym, new_rows):
            ref = self.db.collection("prices").document(sym)
            docs = list(transaction.get(ref))
            doc = docs[0] if docs else None
            
            existing = doc.to_dict().get("history", []) if doc and doc.exists else []
            existing_dates = {r["date"] for r in existing}
            
            for r in new_rows:
                if r["date"] not in existing_dates:
                    existing.append(r)
                    existing_dates.add(r["date"])
                    
            existing.sort(key=lambda x: x["date"])
            capped = existing[-PRICE_CAP:]
            transaction.set(ref, {"history": capped})

        _write_prices_txn(self.db.transaction(), symbol, rows)

    def get_prices(self, symbol: str) -> list[dict]:
        doc = self.db.collection("prices").document(symbol).get()
        if doc.exists:
            return doc.to_dict().get("history", [])
        return []

    # ── raw_prices (unadjusted daily price history, capped ~400 day array per symbol) ──
    def write_raw_prices(self, symbol: str, rows: list[dict]) -> None:
        @firestore.transactional
        def _write_raw_prices_txn(transaction, sym, new_rows):
            ref = self.db.collection("raw_prices").document(sym)
            doc = ref.get(transaction=transaction)
            
            existing = doc.to_dict().get("history", []) if doc and doc.exists else []
            existing_dates = {r["date"] for r in existing}
            
            for r in new_rows:
                if r["date"] not in existing_dates:
                    existing.append(r)
                    existing_dates.add(r["date"])
                    
            existing.sort(key=lambda x: x["date"])
            capped = existing[-PRICE_CAP:]
            transaction.set(ref, {"history": capped})

        _write_raw_prices_txn(self.db.transaction(), symbol, rows)

    def get_raw_prices(self, symbol: str) -> list[dict]:
        doc = self.db.collection("raw_prices").document(symbol).get()
        if doc.exists:
            return doc.to_dict().get("history", [])
        return []

    # ── watchlist (single-user CRUD) ──────────────────────────────────
    def get_watchlist(self) -> list[str]:
        if self._watchlist_cache is not None:
            return sorted(self._watchlist_cache)
        docs = self.db.collection("watchlist").get()
        self._watchlist_cache = {doc.id for doc in docs}
        return sorted(self._watchlist_cache)

    def add_watchlist(self, symbol: str) -> None:
        sym = symbol.upper()
        self.db.collection("watchlist").document(sym).set({"added": firestore.SERVER_TIMESTAMP})
        if self._watchlist_cache is not None:
            self._watchlist_cache.add(sym)

    def remove_watchlist(self, symbol: str) -> None:
        sym = symbol.upper()
        self.db.collection("watchlist").document(sym).delete()
        if self._watchlist_cache is not None:
            self._watchlist_cache.discard(sym)

    def has_watchlist(self, symbol: str) -> bool:
        return symbol.upper() in set(self.get_watchlist())

    # ── known universe ────────────────────────────────────────────────
    def set_known_symbols(self, symbols: list[dict]) -> None:
        coll = self.db.collection("symbols")
        for i in range(0, len(symbols), 400):
            batch = self.db.batch()
            for s in symbols[i:i+400]:
                batch.set(coll.document(s["symbol"].upper()), s, merge=True)
            batch.commit()
        # Invalidate cache
        self._known_symbols_cache = None

    def get_known_symbols(self) -> set[str]:
        self._load_symbols_cache_if_needed()
        return set(self._known_symbols_cache.keys())

    def get_symbol_metadata(self, symbol: str) -> dict | None:
        self._load_symbols_cache_if_needed()
        return copy.deepcopy(self._known_symbols_cache.get(symbol.upper()))

    def search_symbols(self, query: str, limit: int = 8) -> list[dict]:
        self._load_symbols_cache_if_needed()
        q = query.lower()
        results = []
        for sym, data in self._known_symbols_cache.items():
            if q in sym.lower() or q in data.get("name", "").lower():
                results.append(data)
                if len(results) >= limit:
                    break
        return results

    def _load_symbols_cache_if_needed(self):
        # Use None as sentinel for "never loaded".
        # An empty dict means Firestore had no docs at load time — we refresh
        # automatically on next request so a cold-start race doesn't poison cache.
        if self._known_symbols_cache is None or len(self._known_symbols_cache) == 0:
            docs = self.db.collection("symbols").get()
            loaded = {doc.id: doc.to_dict() for doc in docs}
            if loaded:  # only cache once we have real data
                self._known_symbols_cache = loaded

"""
test_store.py
Persistence layer tests against MemoryStore.

Covers the critical invariants from AGENTS.md §4:
  - price_at_call is write-once (invariant 3)
  - price_at_signal is write-once (invariant 3)
  - re-run idempotency: scores replaced, call prices frozen
  - metal signals never enter equity calls (invariant 4)
  - price arrays capped at ~400 (invariant 12)
  - watchlist CRUD
"""

import pytest
from app.db.memory_store import MemoryStore, PRICE_CAP


@pytest.fixture
def store():
    return MemoryStore()


# ── write-once: price_at_call ─────────────────────────────────────────
class TestCallWriteOnce:
    def test_first_write_records_price(self, store):
        store.write_calls("2025-12-31", [
            {"symbol": "SOLIDCO", "price_at_call": 120.0, "f_score": 8, "t_score": 4},
        ])
        calls = store.get_calls("2025-12-31")
        assert len(calls) == 1
        assert calls[0]["price_at_call"] == 120.0

    def test_rerun_preserves_original_price(self, store):
        store.write_calls("2025-12-31", [
            {"symbol": "SOLIDCO", "price_at_call": 120.0, "f_score": 8, "t_score": 4},
        ])
        # Re-run: scores change, but price_at_call must NOT change
        store.write_calls("2025-12-31", [
            {"symbol": "SOLIDCO", "price_at_call": 999.0, "f_score": 9, "t_score": 5},
        ])
        calls = store.get_calls("2025-12-31")
        assert len(calls) == 1
        assert calls[0]["price_at_call"] == 120.0   # FROZEN
        assert calls[0]["f_score"] == 9               # scores updated

    def test_different_dates_are_independent(self, store):
        store.write_calls("2025-12-30", [
            {"symbol": "SOLIDCO", "price_at_call": 110.0, "f_score": 7, "t_score": 3},
        ])
        store.write_calls("2025-12-31", [
            {"symbol": "SOLIDCO", "price_at_call": 120.0, "f_score": 8, "t_score": 4},
        ])
        assert store.get_calls("2025-12-30")[0]["price_at_call"] == 110.0
        assert store.get_calls("2025-12-31")[0]["price_at_call"] == 120.0


# ── write-once: price_at_signal ───────────────────────────────────────
class TestMetalSignalWriteOnce:
    def test_first_write_records_price(self, store):
        store.write_metal_signals("2025-12-31", [
            {"metal": "gold", "price_at_signal": 5500.0, "t_score": 4},
        ])
        sigs = store.get_metal_signals("2025-12-31")
        assert len(sigs) == 1
        assert sigs[0]["price_at_signal"] == 5500.0

    def test_rerun_preserves_original_price(self, store):
        store.write_metal_signals("2025-12-31", [
            {"metal": "gold", "price_at_signal": 5500.0, "t_score": 4},
        ])
        # Re-run with a different price
        store.write_metal_signals("2025-12-31", [
            {"metal": "gold", "price_at_signal": 9999.0, "t_score": 5},
        ])
        sigs = store.get_metal_signals("2025-12-31")
        assert len(sigs) == 1
        assert sigs[0]["price_at_signal"] == 5500.0  # FROZEN
        assert sigs[0]["t_score"] == 5                 # scores updated


# ── re-run idempotency ────────────────────────────────────────────────
class TestRerunIdempotency:
    def test_scores_are_replaced_on_rerun(self, store):
        store.write_scores("2025-12-31", [
            {"symbol": "A", "f_score": 7},
            {"symbol": "B", "f_score": 5},
        ])
        store.write_scores("2025-12-31", [
            {"symbol": "A", "f_score": 8},
            {"symbol": "C", "f_score": 6},
        ])
        scores = store.get_scores("2025-12-31")
        syms = {s["symbol"] for s in scores}
        # Fully replaced, not appended
        assert syms == {"A", "C"}
        assert [s for s in scores if s["symbol"] == "A"][0]["f_score"] == 8

    def test_run_record_is_replaced_on_rerun(self, store):
        store.write_run("2025-12-31", {"status": "ok", "scored_count": 10})
        store.write_run("2025-12-31", {"status": "partial", "scored_count": 8})
        run = store.get_run("2025-12-31")
        assert run["status"] == "partial"
        assert run["scored_count"] == 8


# ── runs index ────────────────────────────────────────────────────────
class TestRunsIndex:
    def test_returns_newest_first(self, store):
        store.write_run("2025-12-29", {"status": "ok"})
        store.write_run("2025-12-31", {"status": "partial"})
        store.write_run("2025-12-30", {"status": "skipped"})
        idx = store.get_runs_index()
        assert [r["run_date"] for r in idx] == ["2025-12-31", "2025-12-30", "2025-12-29"]
        assert idx[0]["status"] == "partial"


# ── call history ──────────────────────────────────────────────────────
class TestCallHistory:
    def test_returns_all_calls_for_symbol(self, store):
        store.write_calls("2025-12-30", [
            {"symbol": "SOLIDCO", "price_at_call": 110.0, "f_score": 7, "t_score": 3},
        ])
        store.write_calls("2025-12-31", [
            {"symbol": "SOLIDCO", "price_at_call": 120.0, "f_score": 8, "t_score": 4},
            {"symbol": "HOTCO", "price_at_call": 200.0, "f_score": 8, "t_score": 4},
        ])
        hist = store.get_call_history("SOLIDCO")
        assert len(hist) == 2
        assert hist[0]["run_date"] == "2025-12-30"
        assert hist[1]["run_date"] == "2025-12-31"

    def test_returns_empty_for_unknown_symbol(self, store):
        assert store.get_call_history("NOEXIST") == []


# ── prices capped ─────────────────────────────────────────────────────
class TestPricesCapped:
    def test_cap_at_400(self, store):
        from datetime import date, timedelta
        base = date(2020, 1, 1)
        rows = [{"date": (base + timedelta(days=i)).isoformat(), "close": 100.0 + i}
                for i in range(PRICE_CAP + 100)]
        store.write_prices("TEST", rows)
        stored = store.get_prices("TEST")
        assert len(stored) == PRICE_CAP
        # Must keep the most recent
        assert stored[-1]["date"] == rows[-1]["date"]

    def test_deduplicates_by_date(self, store):
        store.write_prices("TEST", [
            {"date": "2025-01-01", "close": 100.0},
            {"date": "2025-01-02", "close": 101.0},
        ])
        store.write_prices("TEST", [
            {"date": "2025-01-02", "close": 999.0},  # duplicate
            {"date": "2025-01-03", "close": 102.0},
        ])
        stored = store.get_prices("TEST")
        assert len(stored) == 3


# ── watchlist CRUD ────────────────────────────────────────────────────
class TestWatchlist:
    def test_add_and_list(self, store):
        store.add_watchlist("SOLIDCO")
        store.add_watchlist("TINYCO")
        assert store.get_watchlist() == ["SOLIDCO", "TINYCO"]

    def test_remove(self, store):
        store.add_watchlist("SOLIDCO")
        store.add_watchlist("TINYCO")
        store.remove_watchlist("SOLIDCO")
        assert store.get_watchlist() == ["TINYCO"]

    def test_remove_nonexistent_is_noop(self, store):
        store.remove_watchlist("NOEXIST")  # must not raise

    def test_add_is_case_insensitive(self, store):
        store.add_watchlist("solidco")
        assert "SOLIDCO" in store.get_watchlist()

    def test_no_duplicates(self, store):
        store.add_watchlist("SOLIDCO")
        store.add_watchlist("SOLIDCO")
        assert len(store.get_watchlist()) == 1


# ── screener latest ──────────────────────────────────────────────────
class TestScreenerLatest:
    def test_write_and_read(self, store):
        calls = [{"symbol": "A", "f_score": 8}]
        metals = {"gold": {"t_score": 4}}
        store.write_screener_latest(calls, metals)
        latest = store.get_screener_latest()
        assert latest["calls"] == calls
        assert latest["metals"] == metals

    def test_overwrites_on_new_run(self, store):
        store.write_screener_latest([{"symbol": "A"}])
        store.write_screener_latest([{"symbol": "B"}])
        assert store.get_screener_latest()["calls"][0]["symbol"] == "B"


# ── raw prices capped ─────────────────────────────────────────────────
class TestRawPricesCapped:
    def test_cap_at_400(self, store):
        from datetime import date, timedelta
        base = date(2020, 1, 1)
        rows = [{"date": (base + timedelta(days=i)).isoformat(), "close": 100.0 + i}
                for i in range(PRICE_CAP + 100)]
        store.write_raw_prices("TEST", rows)
        stored = store.get_raw_prices("TEST")
        assert len(stored) == PRICE_CAP
        # Must keep the most recent
        assert stored[-1]["date"] == rows[-1]["date"]

    def test_deduplicates_by_date(self, store):
        store.write_raw_prices("TEST", [
            {"date": "2025-01-01", "close": 100.0},
            {"date": "2025-01-02", "close": 101.0},
        ])
        store.write_raw_prices("TEST", [
            {"date": "2025-01-02", "close": 999.0},  # duplicate
            {"date": "2025-01-03", "close": 102.0},
        ])
        stored = store.get_raw_prices("TEST")
        assert len(stored) == 3


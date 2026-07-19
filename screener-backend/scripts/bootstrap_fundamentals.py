"""
bootstrap_fundamentals.py
One-time seed: fetch annual financial statements for all symbols in the
universe via yfinance and write to Firestore fundamentals/{SYMBOL}.

Also enriches symbols/{SYMBOL} with sector, is_financial, and shares_outstanding.

Run:  python scripts/bootstrap_fundamentals.py [--batch-size 10] [--start-from SYMBOL]

NOTE: yfinance fundamentals queries are per-ticker (no batch mode), so this
is slower than price downloads. Expect ~1-2 seconds per symbol.
"""

import argparse
import os
import sys
import time
import traceback

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

import numpy as np
import yfinance as yf
from app.db.firestore_store import FirestoreStore

# Sectors we classify as "financial" for the bank scoring engine
FINANCIAL_SECTORS = {
    "financial services", "banks", "banking", "insurance",
    "financial", "banks - private sector", "banks - public sector",
    "finance", "nbfc",
}


def _safe_float(val):
    """Convert to float or return None."""
    if val is None:
        return None
    try:
        v = float(val)
        return None if np.isnan(v) or np.isinf(v) else v
    except (TypeError, ValueError):
        return None


def _to_crore(val):
    """Convert rupee amount to crore (÷ 1e7). yfinance returns absolute rupees."""
    v = _safe_float(val)
    return round(v / 1e7, 2) if v is not None else None


def _get_row(df, labels):
    """Get the first matching row from a DataFrame by trying multiple labels."""
    for label in labels:
        if label in df.index:
            return df.loc[label]
    return None


def extract_nonbank_fundamentals(ticker) -> dict | None:
    """
    Extract non-bank fundamental data from yfinance Ticker.
    Returns the pipeline-expected shape or None if insufficient data.
    """
    try:
        income = ticker.financials  # annual income statement
        balance = ticker.balance_sheet  # annual balance sheet
        cashflow = ticker.cashflow  # annual cash flow

        if income is None or income.empty or balance is None or balance.empty:
            return None

        # Current = most recent column, prior = second column
        periods = list(income.columns)
        if len(periods) < 2:
            return None

        def _extract_period(col_idx):
            inc_col = income.iloc[:, col_idx] if col_idx < len(income.columns) else None
            bal_col = balance.iloc[:, col_idx] if col_idx < len(balance.columns) else None
            cf_col = cashflow.iloc[:, col_idx] if cashflow is not None and col_idx < len(cashflow.columns) else None

            if inc_col is None or bal_col is None:
                return None

            # Net Income
            net_income = _to_crore(inc_col.get("Net Income") or inc_col.get("Net Income From Continuing Operations"))
            # Total Assets
            total_assets = _to_crore(bal_col.get("Total Assets"))
            # Borrowings (Total Debt)
            borrowings = _to_crore(bal_col.get("Total Debt") or bal_col.get("Long Term Debt"))
            # Cash
            cash = _to_crore(bal_col.get("Cash And Cash Equivalents") or bal_col.get("Cash Cash Equivalents And Short Term Investments"))
            # Operating Profit (EBIT)
            operating_profit = _to_crore(inc_col.get("EBIT") or inc_col.get("Operating Income"))
            # Revenue
            revenue = _to_crore(inc_col.get("Total Revenue") or inc_col.get("Operating Revenue"))
            # Gross Margin (%)
            gross_profit = _safe_float(inc_col.get("Gross Profit"))
            total_rev = _safe_float(inc_col.get("Total Revenue") or inc_col.get("Operating Revenue"))
            gross_margin = round(gross_profit / total_rev * 100, 2) if gross_profit and total_rev and total_rev > 0 else None
            # Current Ratio
            current_assets = _safe_float(bal_col.get("Current Assets"))
            current_liab = _safe_float(bal_col.get("Current Liabilities"))
            current_ratio = round(current_assets / current_liab, 2) if current_assets and current_liab and current_liab > 0 else None
            # Shares Outstanding
            shares = _safe_float(bal_col.get("Ordinary Shares Number") or bal_col.get("Share Issued"))
            # OCF
            ocf = _to_crore(cf_col.get("Operating Cash Flow") or cf_col.get("Cash Flow From Continuing Operating Activities")) if cf_col is not None else None

            return {
                "net_income": net_income,
                "total_assets": total_assets,
                "borrowings": borrowings,
                "cash": cash,
                "operating_profit": operating_profit,
                "revenue": revenue,
                "gross_margin": gross_margin,
                "current_ratio": current_ratio,
                "shares_outstanding": shares,
                "ocf": ocf,
            }

        current = _extract_period(0)
        prior = _extract_period(1)

        if current is None:
            return None

        # Annual periods for historical EV/EBIT median
        annual_periods = []
        for i in range(min(len(periods), 5)):
            col = income.iloc[:, i]
            bal = balance.iloc[:, i] if i < len(balance.columns) else None
            end_date = periods[i].strftime("%Y-%m-%d") if hasattr(periods[i], "strftime") else str(periods[i])
            op = _to_crore(col.get("EBIT") or col.get("Operating Income"))
            borr = _to_crore(bal.get("Total Debt") or bal.get("Long Term Debt")) if bal is not None else None
            csh = _to_crore(bal.get("Cash And Cash Equivalents") or bal.get("Cash Cash Equivalents And Short Term Investments")) if bal is not None else None
            annual_periods.append({
                "end_date": end_date,
                "operating_profit": op,
                "borrowings": borr,
                "cash": csh,
            })

        # Debt-to-equity
        equity = _safe_float(balance.iloc[:, 0].get("Total Equity Gross Minority Interest") or balance.iloc[:, 0].get("Stockholders Equity"))
        total_debt = _safe_float(balance.iloc[:, 0].get("Total Debt"))
        de = round(total_debt / equity, 2) if total_debt is not None and equity and equity > 0 else None

        return {
            "current": current,
            "prior": prior,
            "annual_periods": annual_periods,
            "debt_to_equity": de,
        }

    except Exception:
        return None


def extract_bank_fundamentals(ticker) -> dict | None:
    """
    Extract bank fundamental data from yfinance Ticker.
    Bank-specific metrics are harder to get from yfinance; we get what we can.
    """
    try:
        income = ticker.financials
        balance = ticker.balance_sheet

        if income is None or income.empty or balance is None or balance.empty:
            return None

        periods = list(income.columns)
        if len(periods) < 2:
            return None

        def _bank_period(col_idx):
            inc = income.iloc[:, col_idx] if col_idx < len(income.columns) else None
            bal = balance.iloc[:, col_idx] if col_idx < len(balance.columns) else None
            if inc is None or bal is None:
                return None

            # ROA
            net_income = _safe_float(inc.get("Net Income") or inc.get("Net Income From Continuing Operations"))
            total_assets = _safe_float(bal.get("Total Assets"))
            roa = round(net_income / total_assets * 100, 2) if net_income and total_assets and total_assets > 0 else None

            # Book value (in crore)
            equity = _safe_float(bal.get("Total Equity Gross Minority Interest") or bal.get("Stockholders Equity"))
            book_value = _to_crore(equity) if equity else None

            return {
                "roa": roa,
                "book_value": book_value,
                # These require quarterly data not easily available from yfinance:
                "gross_npa": None,
                "provision_coverage": None,
                "nim": None,
                "cost_to_income": None,
                "casa_ratio": None,
            }

        current = _bank_period(0)
        prior = _bank_period(1)

        if current is None:
            return None

        # Book periods for P/B median
        book_periods = []
        for i in range(min(len(periods), 5)):
            bal = balance.iloc[:, i] if i < len(balance.columns) else None
            end_date = periods[i].strftime("%Y-%m-%d") if hasattr(periods[i], "strftime") else str(periods[i])
            equity = _safe_float(bal.get("Total Equity Gross Minority Interest") or bal.get("Stockholders Equity")) if bal is not None else None
            bv = _to_crore(equity) if equity else None
            book_periods.append({"end_date": end_date, "book_value": bv})

        return {
            "current": current,
            "prior": prior,
            "book_periods": book_periods,
            "crar": None,  # Not available from yfinance
            "tier1": None,
            "debt_to_equity": None,
        }

    except Exception:
        return None


def process_symbol(sym: str, store: FirestoreStore) -> str:
    """
    Process one symbol: fetch fundamentals + enrich metadata.
    Returns status: 'ok', 'no_data', 'error', 'skipped'.
    """
    # Check if already populated
    existing = store.get_fundamentals(sym)
    if existing and existing.get("current"):
        return "skipped"

    try:
        ticker = yf.Ticker(f"{sym}.NS")
        info = ticker.info or {}

        # Determine sector and is_financial
        sector = info.get("sector", "") or ""
        industry = info.get("industry", "") or ""
        is_financial = sector.lower() in FINANCIAL_SECTORS or industry.lower() in FINANCIAL_SECTORS

        # Shares outstanding
        shares = _safe_float(info.get("sharesOutstanding"))

        # Extract fundamentals based on type
        if is_financial:
            fund = extract_bank_fundamentals(ticker)
        else:
            fund = extract_nonbank_fundamentals(ticker)

        if fund is None:
            return "no_data"

        # Write fundamentals
        store.write_fundamentals(sym, fund)

        # Enrich symbol metadata
        meta = store.get_symbol_metadata(sym) or {}
        updates = {
            **meta,
            "symbol": sym,
            "sector": sector or meta.get("sector", ""),
            "is_financial": is_financial,
        }
        if shares is not None:
            updates["shares_outstanding"] = int(shares)

        # Write back enriched metadata
        store.db.collection("symbols").document(sym).set(updates, merge=True)
        # Invalidate cache
        store._known_symbols_cache = None

        return "ok"

    except Exception as e:
        print(f"    ERROR {sym}: {e}")
        return "error"


def main():
    parser = argparse.ArgumentParser(description="Bootstrap fundamentals from yfinance")
    parser.add_argument("--start-from", type=str, default=None, help="Resume from this symbol (alphabetical)")
    parser.add_argument("--limit", type=int, default=None, help="Max symbols to process (for testing)")
    args = parser.parse_args()

    store = FirestoreStore()
    known = sorted(store.get_known_symbols())
    print(f"[bootstrap_fundamentals] {len(known)} symbols in universe")

    if args.start_from:
        idx = next((i for i, s in enumerate(known) if s >= args.start_from.upper()), 0)
        known = known[idx:]
        print(f"[bootstrap_fundamentals] Resuming from {known[0]} ({len(known)} remaining)")

    if args.limit:
        known = known[:args.limit]
        print(f"[bootstrap_fundamentals] Limited to {len(known)} symbols")

    stats = {"ok": 0, "no_data": 0, "error": 0, "skipped": 0}
    total = len(known)

    for i, sym in enumerate(known):
        if (i + 1) % 50 == 0 or i == 0:
            print(f"  [{i+1}/{total}] Processing {sym}... (ok={stats['ok']}, skip={stats['skipped']}, nodata={stats['no_data']}, err={stats['error']})")

        status = process_symbol(sym, store)
        stats[status] += 1

        # Rate limit: yfinance per-ticker queries
        time.sleep(0.5)

    print(f"\n[bootstrap_fundamentals] Complete: {stats}")


if __name__ == "__main__":
    main()

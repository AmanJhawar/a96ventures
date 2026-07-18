"""
seed_nse_symbols.py
Downloads the NSE equity symbol list and seeds it into Firestore via the
--seed-symbols flag of the main job.

Run from the project root:
    cd screener-backend
    USE_FIRESTORE=true python -m app.seed_nse_symbols
"""

import json
import os
import sys
import urllib.request
import csv
import io

# Add core/ to sys.path
_CORE_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "core")
if os.path.abspath(_CORE_DIR) not in sys.path:
    sys.path.insert(0, os.path.abspath(_CORE_DIR))


EQUITY_LIST_URL = "https://archives.nseindia.com/content/equities/EQUITY_L.csv"

# NSE sectors that are financial (for is_financial flag)
FINANCIAL_SECTORS = {
    "BANK",
    "BANKS",
    "FINANCIAL SERVICES",
    "FINANCE",
    "INSURANCE",
    "NBFC",
    "HOUSING FINANCE",
    "MICROFINANCE",
    "STOCK EXCHANGES & RATINGS",
}


def download_nse_equity_list() -> list[dict]:
    """
    Downloads NSE EQUITY_L.csv which contains all listed equities.
    Returns a list of symbol metadata dicts.
    """
    print(f"[seed] Downloading NSE equity list from {EQUITY_LIST_URL} ...")
    req = urllib.request.Request(
        EQUITY_LIST_URL,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
            "Referer": "https://www.nseindia.com/",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        content = resp.read().decode("latin-1")

    reader = csv.DictReader(io.StringIO(content))
    symbols = []
    for row in reader:
        # Only EQ series (exclude SME, ETF, etc.)
        series = row.get("SERIES", "").strip()
        if series not in ("EQ", "BE", ""):
            continue

        symbol = row.get("SYMBOL", "").strip().upper()
        name = row.get("NAME OF COMPANY", "").strip()
        # EQUITY_L doesn't have sector — we default to empty string
        # The screener uses is_financial for engine selection
        if not symbol:
            continue

        symbols.append({
            "symbol": symbol,
            "name": name,
            "sector": "",
            "is_financial": False,   # will update below from indices list
            "shares_outstanding": None,
        })

    print(f"[seed] Downloaded {len(symbols)} equity symbols from NSE.")
    return symbols


def flag_financial_symbols(symbols: list[dict]) -> list[dict]:
    """
    Downloads Nifty Bank + Nifty Financial Services index constituents
    and marks those symbols as is_financial=True.
    """
    financial_indices = [
        "https://archives.nseindia.com/content/indices/ind_niftybanklist.csv",
        "https://archives.nseindia.com/content/indices/ind_niftyfinsrvlist.csv",
    ]

    financial_symbols = set()
    for url in financial_indices:
        try:
            req = urllib.request.Request(
                url,
                headers={
                    "User-Agent": "Mozilla/5.0",
                    "Referer": "https://www.nseindia.com/",
                },
            )
            with urllib.request.urlopen(req, timeout=15) as resp:
                content = resp.read().decode("latin-1")
            reader = csv.DictReader(io.StringIO(content))
            for row in reader:
                sym = row.get("Symbol", "").strip().upper()
                if sym:
                    financial_symbols.add(sym)
            print(f"[seed] Fetched financial index from {url.split('/')[-1]}: {len(financial_symbols)} total so far")
        except Exception as e:
            print(f"[seed] WARNING: Could not fetch {url}: {e}")

    for sym_dict in symbols:
        if sym_dict["symbol"] in financial_symbols:
            sym_dict["is_financial"] = True

    print(f"[seed] Marked {len(financial_symbols)} symbols as financial.")
    return symbols


def seed_to_firestore(symbols: list[dict]):
    """Seeds the symbols list into the Firestore `symbols` collection via the store."""
    from app.db.firestore_store import FirestoreStore

    store = FirestoreStore()
    print(f"[seed] Seeding {len(symbols)} symbols into Firestore...")
    store.set_known_symbols(symbols)
    print("[seed] Done! Firestore symbols collection updated.")


if __name__ == "__main__":
    symbols = download_nse_equity_list()
    symbols = flag_financial_symbols(symbols)

    # Save locally for reference
    out_path = os.path.join(os.path.dirname(__file__), "..", "fixtures", "symbols.json")
    with open(out_path, "w") as f:
        json.dump(symbols, f, indent=2)
    print(f"[seed] Saved {len(symbols)} symbols to {out_path}")

    use_firestore = os.environ.get("USE_FIRESTORE", "false").lower() == "true"
    if use_firestore:
        seed_to_firestore(symbols)
    else:
        print("[seed] USE_FIRESTORE not set — skipping Firestore seed.")
        print(f"[seed] Symbols saved to fixtures/symbols.json only.")
        print("[seed] Re-run with USE_FIRESTORE=true to seed Firestore.")

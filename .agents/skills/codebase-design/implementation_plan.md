# Live Screener Core Pipeline Integration

Implement a live mode for the screener backend that moves off static fixtures to download live daily NSE price sheets (Bhavcopy) and live global commodity feeds (metals/FX) via Yahoo Finance, merging them with historical unadjusted price feeds stored in Firestore (`raw_prices`).

## User Review Required

> [!IMPORTANT]
> **NSE Bhavcopy Access**: NSE frequently changes its website structure and blocks automated scripts without specific HTTP headers. The proposed Bhavcopy downloader will use standard browser headers (`User-Agent`, cookies) to fetch the daily zip from `archives.nseindia.com`. If NSE implements stronger CDN protection (e.g. Cloudflare JS challenges), this downloader may need to be updated to use a headless browser or external data API.

> [!WARNING]
> **yfinance Rate Limits**: Seeding historical data for ~2000 tickers from Yahoo Finance in one go can trigger rate limits. The bootstrap script will chunk requests and process symbols in batches to prevent IP blocks.

## Open Questions

1. **NSE Symbol Suffixes**: Yahoo Finance tickers require a `.NS` suffix (e.g. `RELIANCE.NS`). Do you want us to handle mapping between standard NSE symbols (e.g. `RELIANCE`) and Yahoo Finance tickers automatically? *(Proposed: Yes, we will append `.NS` for `yfinance` downloads and strip it when saving to the database).*
2. **Metadata Coverage**: Should the one-time bootstrap script seed `raw_prices` for ALL symbols present in the Firestore `symbols` collection, or only for those currently on the `watchlist`? *(Proposed: All symbols in the universe, so the screener can evaluate any ticker on demand).*

## Proposed Changes

---

### Component: Database Persistence

#### [MODIFY] [store.py](file:///Users/amanjhawar/Downloads/a96ventures/screener-backend/backend/app/db/store.py)
* Add `write_raw_prices(symbol, rows)` and `get_raw_prices(symbol)` to the `Store` protocol.

#### [MODIFY] [memory_store.py](file:///Users/amanjhawar/Downloads/a96ventures/screener-backend/backend/app/db/memory_store.py)
* Add `_raw_prices` dictionary to the class constructor.
* Implement `write_raw_prices` and `get_raw_prices` matching the local cache/capping patterns.

#### [MODIFY] [firestore_store.py](file:///Users/amanjhawar/Downloads/a96ventures/screener-backend/backend/app/db/firestore_store.py)
* Implement `write_raw_prices` (using a Firestore transaction to merge, sort, and cap at 400 records).
* Implement `get_raw_prices` fetching from the `raw_prices` Firestore collection.

---

### Component: Live Data Loaders

#### [MODIFY] [requirements.txt](file:///Users/amanjhawar/Downloads/a96ventures/screener-backend/backend/requirements.txt)
* Add `yfinance` to dependencies.

#### [MODIFY] [loaders.py](file:///Users/amanjhawar/Downloads/a96ventures/screener-backend/backend/app/data/loaders.py)
* Implement `load_live_metals_fx(start_date, end_date)` to fetch `GC=F`, `SI=F`, and `USDINR=X` using `yfinance`.
* Implement `download_nse_bhavcopy(date_str)` to fetch and extract the official daily NSE price list zip.

---

### Component: Pipeline Orchestration

#### [MODIFY] [main_job.py](file:///Users/amanjhawar/Downloads/a96ventures/screener-backend/backend/app/main_job.py)
* Add a `--live` CLI flag to trigger the live-data pipeline.
* Implement live-mode execution:
  1. Retrieve `raw_prices` history from Firestore for all universe symbols.
  2. Download today's NSE Bhavcopy.
  3. Merge today's Bhavcopy prices with historical `raw_prices`.
  4. Persist the updated unadjusted `raw_prices` back to Firestore.
  5. Run corporate adjustments (`ingest_and_adjust`) on the raw history to compute `prices` (adjusted closes).
  6. Run the scoring pipeline and save outcomes.
  7. Fetch live metals/FX from Yahoo Finance and run `metals_run`.

---

### Component: Seeding Scripts

#### [NEW] [bootstrap_raw_prices.py](file:///Users/amanjhawar/Downloads/a96ventures/screener-backend/backend/app/bootstrap_raw_prices.py)
* Script to pull the list of active symbols from the Firestore `symbols` collection.
* Query `yfinance` in batches to retrieve 400+ days of historical daily prices.
* Batch write the raw price histories into the `raw_prices` Firestore collection.

## Verification Plan

### Automated Tests
1. **Store Tests:**
   * Extend `test_store.py` to assert write-once, append-only, and capping behaviors on the `raw_prices` collection.
2. **Execution Test:**
   * Execute the bootstrap script locally in `MemoryStore` mode.
   * Run the nightly job in `--live` mode using dummy/recent dates to ensure merging and processing run without exceptions.

### Manual Verification
* Run the bootstrap script pointing to a test Firestore environment to populate a few symbols, then run `main_job.py --live` to verify Firestore integration.

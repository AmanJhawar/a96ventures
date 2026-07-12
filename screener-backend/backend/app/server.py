"""
server.py
FastAPI application factory for the screener API.

On startup, auto-runs the nightly job against fixture data so the API starts
populated with real scored data. CORS is enabled for the Next.js dev server.

Run:  uvicorn app.server:app --port 8000 --reload
"""

from __future__ import annotations

import os
import sys

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Add core/ to sys.path
_CORE_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "core")
if os.path.abspath(_CORE_DIR) not in sys.path:
    sys.path.insert(0, os.path.abspath(_CORE_DIR))

from app.db.memory_store import MemoryStore  # noqa: E402
from app.api.routes import router, set_store_for_routes  # noqa: E402
from app.main_job import run_job, set_store  # noqa: E402


FIXTURES_DIR = os.path.join(os.path.dirname(__file__), "..", "fixtures")


@asynccontextmanager
async def lifespan(application: FastAPI):
    """Startup: seed the store with fixture data so the API has data immediately."""
    use_firestore = os.environ.get("USE_FIRESTORE", "false").lower() == "true"
    if use_firestore:
        from app.db.firestore_store import FirestoreStore
        store = FirestoreStore()
        print("[server] Using FirestoreStore.")
    else:
        store = MemoryStore()
        print("[server] Using MemoryStore.")
        
    set_store(store)
    set_store_for_routes(store)

    # Add some watchlist symbols for demo (if not in firestore, or just ensuring it's there)
    if not use_firestore:
        store.add_watchlist("TINYCO")

    # Run the job against fixture data only if not using firestore (avoid overwriting prod data on startup)
    if not use_firestore and os.path.exists(os.path.join(FIXTURES_DIR, "symbols.json")):
        print("[server] Seeding data from fixtures...")
        try:
            run_job("2025-12-31", FIXTURES_DIR, store)
            
            import json
            with open(os.path.join(FIXTURES_DIR, "symbols.json")) as f:
                sym_data = json.load(f)
                store.set_known_symbols(sym_data)
                
            print("[server] Seed complete.")
        except Exception as e:
            print(f"[server] Seed failed: {e}")
            import traceback
            traceback.print_exc()
    else:
        print("[server] No fixtures found — generate them first:")
        print("  cd backend/fixtures && python generate_fixtures.py")

    yield


def create_app() -> FastAPI:
    application = FastAPI(
        title="Beaten-Down Quality Screener API",
        version="0.1.0",
        lifespan=lifespan,
    )

    # CORS configuration
    origins = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
    ]
    frontend_url = os.environ.get("FRONTEND_URL")
    if frontend_url:
        # Support both single strings and comma-separated lists
        origins.extend([o.strip() for o in frontend_url.split(",")])

    application.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    application.include_router(router)
    return application


app = create_app()

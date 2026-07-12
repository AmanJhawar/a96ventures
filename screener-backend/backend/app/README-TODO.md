# backend/app — TO BUILD (see /AGENTS.md §2, build order 1–3)

Planned layout (from docs/build-plan-v2.md §6 and AGENTS.md):
  db/          Firestore persistence. Write-once enforcement for
               calls.price_at_call and metal_signals.price_at_signal.
               Re-run idempotency (replace scores, never call/signal prices).
  main_job.py  Cloud Run entrypoint + CLI for the 23:00 IST nightly run.
               Equity leg -> metals leg -> persist. Metals failure = 'partial'.
  api/         FastAPI read endpoints (build-plan-v2 §5 + /api/metals/latest).
  data/        Feed adapters. Local-file paths first (core.pipeline.load_bhavcopy,
               CSV loaders for metals/FX). Live-feed wiring is a HUMAN task:
               stub with clear TODOs, do not invent endpoints.

Import the core as-is: add the repo's core/ directory to PYTHONPATH or package
it; do NOT copy or modify core files.

# ADR 0001: Native Firestore Keyword Search

## Status
Accepted

## Context
The application needed a search feature for the Catalog. Because Firestore does not support native full-text search (`LIKE '%term%'`), we evaluated three options:
1. Third-party providers (Algolia, Typesense) requiring external sync via Cloud Functions.
2. In-memory client-side search via `fuse.js` (which would require downloading the entire catalog, breaking our deep modular architecture and pagination).
3. A native Firestore approach using an `array-contains` query on a pre-computed array of lowercase keywords.

## Decision
We chose to implement the native Firestore approach (Option 3). A `searchTerms` array of lowercase keywords will be added to every catalog item. This allows us to keep all infrastructure within Firebase, avoids third-party costs, and integrates perfectly with our `catalog.service.ts` adapter while preserving server-side pagination.

## Consequences
- **Pros:** Extremely cost-effective. No external infrastructure. Plays well with Firestore's `limit()` and `startAfter()` pagination.
- **Cons:** Exact-word matching only. No built-in typo tolerance. If a user searches for a partial word not explicitly listed in the array, it will not match.
- **Maintenance:** A Node.js backfill script was introduced to populate historical data. Any future admin dashboard that creates/edits catalog items must automatically generate and save the `searchTerms` array.

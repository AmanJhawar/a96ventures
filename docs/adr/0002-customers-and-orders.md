# ADR 0002: Customer CRM, Atomic Orders, and Zero-Balance Isolation

## Status
Accepted

## Context
A96 Ventures requires a comprehensive Customer Relationship Management (CRM) system to track customer identities, contact details, visits, inquiries, payment splits, and lifetime transaction histories.

Two critical architectural problems in the existing inventory and POS architecture necessitated this ADR:
1. **Zero-Balance Purges Historical Customer Sales:** At every fiscal year-end close (`src/lib/server/archive.ts`), the Zero-Balance system batches and deletes all historical records from `transactions` and `audit_logs` after establishing opening inventory balances. If customer sales were stored only in `transactions`, all customer purchase histories and lifetime metrics would be wiped out annually.
2. **Multi-Item Sales Lack Atomicity:** In the point-of-sale interface (`src/app/admin/sales/page.tsx`), multi-item sales iterate over items and call `recordTransaction()` once per line. If any line fails or connectivity drops midway, prior lines remain committed while subsequent lines fail, leaving dangling partial sales with no single bill grouping them.

Furthermore, compliance guidelines necessitate secure handling of sensitive Personally Identifiable Information (PII) like Indian Permanent Account Numbers (PAN).

## Decision

We chose to implement a decoupled Customer CRM and Atomic Order architecture:

1. **Independent Collections for Longevity & Fiscal Reset:**
   - Customer profiles live in `customers/{customerId}`.
   - Comprehensive multi-item bills live in `orders/{orderId}`.
   - Customer interactions and follow-ups live in `visits/{visitId}`.
   - Sequential bill numbers are generated from `counters/{fiscalYear}`.
   - **Zero-Balance Lifecycle:** Customer profiles, visits, PAN reservations, mobile reservations, lifetime stats (`customers.stats`), and fiscal bill counters are permanent and NEVER deleted during Zero-Balance. Bills in `orders` dated on or before the fiscal cutoff are archived into `ordersSnapshot` within the master archive (protected by SHA-256 checksum with `checksumScope: 'v2-orders'`), and then safely deleted by exact ID via `purgeArchivedOrdersServer(orderIds)`.

2. **Atomic Order Commit in One `runTransaction`:**
   - Multi-item sales and returns are committed in a single Firestore transaction (`runTransaction`).
   - All inventory line validations, stock deductions, customer lifetime statistics updates, counter increments, and audit entries are staged and committed atomically. Partial commits are impossible.

3. **Multi-Mode Payment Splits in Integer Paise:**
   - Payment rows (Cash, UPI, Card, Bank transfer, Old metal) are recorded on the `orders` document.
   - All monetary amounts in new collections are stored as integer paise to prevent floating-point rounding errors.
   - The server enforces `sum(payments[].amountPaise) === totals.amountPaise`.

4. **Cryptographic PAN Protection & Blind Indexing:**
   - PAN is encrypted at rest using AES-256-GCM with a server-only key in `customers/{customerId}/private/pan`.
   - Client access to the private subcollection is completely denied in `firestore.rules`.
   - Global PAN uniqueness is enforced without storing plaintext by using HMAC-SHA256 blind indexing in `customer_pans/{hmac}`.
   - PAN is masked on UI displays (`•••••1234F`) and only revealed via an audited, rate-limited endpoint for authorized roles (`customers.viewPan`).

## Consequences

- **Pros:**
  - Customer lifetime loyalty metrics, contact cards, PAN mappings, and visit logs survive fiscal year-end closes permanently.
  - Closed fiscal periods purge historical sales bills from active collections after sealing them in cryptographic master archives (`version: '1.5'`, `checksumScope: 'v2-orders'`).
  - Bill numbers generated from `counters/{fiscalYear}` remain unique across the fiscal year and are never reset.
  - Attempting to reverse a bill whose ledger entries have been archived and purged returns a clean 400 validation error ("This bill is from a closed period and cannot be reversed").
  - POS checkouts are 100% atomic: zero risk of partial inventory commits or unlinked line items.
  - Military-grade PII protection adhering to Indian data privacy expectations.
- **Cons:**
  - After Zero-Balance, historical bills prior to the cutoff date are only retrievable via the downloaded and verified master audit archives.
  - Strict atomic Firestore transactions require staging all reads before writes and must complete within Firestore's 500 document mutation limits (more than sufficient for retail sales).

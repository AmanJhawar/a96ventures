# A96 Customer CRM: Antigravity Implementation Plan

Repo snapshot: `a7de0e9` (19 Oct 2026). Stack: Next.js 16, React 19, Firestore via Admin SDK API routes, Tailwind v4.

## Scope

Record and view, per customer:

| Field | Required | Notes |
| --- | --- | --- |
| First name | Yes | 1 to 60 chars, trimmed |
| Middle name | No | |
| Last name | Yes | 1 to 60 chars, trimmed |
| Mobile | Yes | Country code + number, stored as E.164 (default +91). Unique across customers |
| Email | No | Lowercased, format-checked |
| Address | No | Line 1, line 2, city, state, PIN code (6 digits for India), country (default India) |
| PAN | No | Format-checked, encrypted at rest, masked on screen, unique across customers |
| Visits | | Purchase, return, walk-in, inquiry, follow-up, repair; optional follow-up date |
| Payment method | | Per bill: cash, UPI, card, bank transfer, old metal; split payments allowed |
| Transaction history | | Every bill with its items, payments and reversals, kept permanently |

Plus the permissions to control who can see and change each of these.

Out of scope: compliance warnings, credit/udhaar balances, Tally invoice matching, marketing features.

## Two problems the CRM must fix first

1. **Zero Balance deletes transactions.** `src/lib/server/archive.ts` and the zero-balance route batch-delete `transactions` and `audit_logs` at every yearly close. Customer history therefore lives in new collections (`customers`, `orders`, `visits`) that the archive never deletes. `transactions` stays the stock ledger.
2. **Multi-item sales are not atomic.** `src/app/admin/sales/page.tsx` calls `recordTransaction()` once per line. If line 3 of 4 fails, lines 1 and 2 stay committed with nothing linking them. A bill (`order`) is written in one `runTransaction` with all its lines.

## Data model

```
customers/{customerId}
  firstName: string                 // required
  middleName?: string
  lastName: string                  // required
  displayName: string               // derived: "First Middle Last"
  mobile: { countryCode: "+91", number: "9876543210", e164: "+919876543210" }   // required
  email?: string
  address?: { line1?, line2?, city?, state?, pincode?, country: "India" }
  pan?: { masked: "•••••1234F", last4: "234F", holderType: "P" }               // display only, never the full PAN
  hasPan: boolean
  notes?: string
  source: "walk_in" | "inquiry" | "referral" | "import"
  inquiryIds: string[]
  stats: {                          // updated in the same Firestore transaction as each order/visit
    firstVisitAt, lastVisitAt, visitCount,
    orderCount, lifetimeValuePaise, lifetimeWeightMg: { Gold, Silver },
    lastOrderId, openFollowUps
  }
  searchTerms: string[]             // ADR 0001 style: lowercase name prefixes (2+ chars), mobile digits, last 4 of mobile
  isArchived: boolean
  createdAt, createdBy, updatedAt, updatedBy

customers/{customerId}/private/pan  // client reads AND writes denied by rules; Admin SDK only
  ciphertext, iv, authTag, keyVersion   // AES-256-GCM
  updatedAt, updatedBy

customer_mobiles/{e164}             // uniqueness index for mobile
  customerId
customer_pans/{hmac}                // uniqueness index for PAN; doc id = HMAC-SHA256(PAN, PAN_HMAC_KEY), hex
  customerId

orders/{orderId}                    // one bill
  orderNo: "A96-2026-000123"        // per Indian fiscal year, from counters/{fy}
  type: "sale" | "return"
  customerId?: string               // optional: anonymous walk-in sales still allowed
  customerSnapshot?: { displayName, mobileE164 }
  locationId, locationName, date ("YYYY-MM-DD"), createdAt, createdBy
  lines: [{ transactionId, productId, productName, metal, category, qty, pieceWeightMg?, unitPricePaise, lineTotalPaise }]
  totals: { amountPaise, units, weightMg: { Gold, Silver } }
  payments: [{
    mode: "cash" | "upi" | "card" | "bank" | "old_metal",
    amountPaise,
    reference?: string,             // UPI ref / card last 4 / bank UTR
    metal?, weightMg?, purity?      // old_metal only
  }]
  notes?: string
  isReversed, reversedAt?, reversedBy?, reversalOrderId?, reversalOf?

visits/{visitId}
  customerId, locationId, at, staffId, staffName
  kind: "purchase" | "return" | "walk_in" | "inquiry" | "follow_up" | "repair"
  orderId?, inquiryId?, note?
  followUpOn?: "YYYY-MM-DD"
  followUpDone: boolean
  followUpOf?: visitId              // a follow_up that closes an earlier visit

counters/{fiscalYear}               // { nextOrderNo }

transactions/{id}                   // existing ledger; add orderId and customerId only
```

### Rules for the data

1. Money in all new collections is integer paise (prices can be fractional rupees). Existing `transactions.price` stays in rupees. Convert only through `src/lib/utils/money.ts`.
2. Weight is integer milligrams, as in the existing ledger.
3. `payments[].amountPaise` must sum exactly to `totals.amountPaise`; the server rejects any mismatch.
4. Mobile and PAN uniqueness are enforced by reserving the index document inside the same `runTransaction` as the customer write, the same way SKU uniqueness works today.
5. PAN format: `^[A-Z]{5}[0-9]{4}[A-Z]$` after uppercasing and removing spaces. The 4th character is stored as `holderType` (P = individual, C = company, F = firm, H = HUF and so on).
6. The full PAN exists in exactly one place: the encrypted `private/pan` doc. It never appears in `audit_logs`, console logs, API list responses, CSV exports, archive payloads or error messages.
7. `customers`, `customer_mobiles`, `customer_pans`, `orders`, `visits` and `counters` are never deleted by Zero Balance. Archive code uses an explicit allow-list of deletable collections.
8. Customers are not location-scoped: anyone with `customers.view` sees every customer. Orders and visits keep their `locationId` for reporting.

## Permissions

New modules in `UserPermissions`:

```ts
customers: { view, add, edit, delete, export, viewPan, editPan }
visits:    { view, add, edit, delete }
```

Existing `sales` and `returns` permissions control creating and reversing bills. Payment details on a bill follow `sales.view` / `returns.view`.

| Permission | What it allows | Super Admin | Store Manager | Sales Cashier | Vault Custodian |
| --- | --- | --- | --- | --- | --- |
| customers.view | List, search and open customer profiles, see bill and visit history | ✓ | ✓ | ✓ | |
| customers.add | Create a customer (including inline from the sale form) | ✓ | ✓ | ✓ | |
| customers.edit | Edit name, mobile, email, address, notes | ✓ | ✓ | | |
| customers.delete | Archive a customer (soft delete only) | ✓ | | | |
| customers.export | Download customer CSV (never includes full PAN) | ✓ | | | |
| customers.viewPan | Reveal the full PAN (each reveal is audited) | ✓ | ✓ | | |
| customers.editPan | Add or replace a PAN | ✓ | ✓ | ✓ | |
| visits.view | See visit timeline and follow-ups | ✓ | ✓ | ✓ | |
| visits.add | Log a walk-in, inquiry, follow-up or repair visit | ✓ | ✓ | ✓ | |
| visits.edit | Edit a visit note or follow-up date, mark follow-up done | ✓ | ✓ | ✓ | |
| visits.delete | Delete a manually logged visit (never purchase/return visits) | ✓ | | | |

Notes:

1. Sales Cashier can **enter** a PAN at the counter but cannot read it back (`editPan` without `viewPan`). Everyone else with `customers.view` sees only the masked value.
2. `customers.export` is super_admin only. It is not shown in the Users permission editor and the server ignores it on any other role, including custom roles.
3. Short codes for Firebase custom claims: module `cus` and `vis`; new actions `viewPan` → `p`, `editPan` → `k`. Existing codes (`v a e d x`) are reused. The custom-claims payload must stay under Firebase’s 1,000-byte limit; add a test that the full super_admin code list fits.
4. Creating a bill with a new customer needs `sales.add` + `customers.add`. Picking an existing customer needs `sales.add` + `customers.view`.

## How to run this in Antigravity

1. Commit `.agents/` first. It is in `.gitignore` (line 51), so each collaborator’s agent runs with different skills and rules. Keep `.agents/rules/` and `.agents/skills/` tracked.
2. Put `crm-domain.md` from this kit in `.agents/rules/`. It loads automatically whenever a task touches customers, bills, payments or the ledger.
3. One phase per agent conversation. Paste the phase’s **Prompt** verbatim. Ask for the implementation plan artefact before code and reject plans that touch files outside the phase’s **Files** list.
4. Every phase ends with `npm run lint`, `npm test` and `npm run test:emulated`. No merge with failing tests.
5. Order: 0 → 1 → 2, then 3 and 7 in parallel (7 uses mocked data until 3 lands), then 4 and 5 in parallel, then 6, then 8.

## Phases

### Phase 0: setup (½ day)

**Files:** `.gitignore`, `.agents/rules/crm-domain.md`, `.env.example`, `docs/adr/0002-customers-and-orders.md`, `docs/crm/PLAN.md`

**Prompt:**
> Read AGENTS.md, .agents/rules/crm-domain.md and docs/crm/PLAN.md. Do Phase 0 only. Remove `.agents/` from .gitignore and add `.agents/**/*.local.*` instead. Add to .env.example a new section “5. Customer data encryption (server-only)” with PAN_ENCRYPTION_KEY (32 random bytes, base64), PAN_HMAC_KEY (32 random bytes, base64) and PAN_KEY_VERSION=1, each with a one-line comment on how to generate it (`openssl rand -base64 32`) and a warning that losing PAN_ENCRYPTION_KEY makes stored PANs unreadable. Commit the ADR and plan as provided. No code changes.

**Done when:** keys generated and set in `.env.local` and in the hosting provider’s environment for every environment.

### Phase 1: types and permissions (1 day)

**Files:** `src/lib/types.ts`, `src/lib/constants/permissions.ts`, `firestore.rules`, `firestore.indexes.json`, `src/app/admin/users/page.tsx`, `tests/permissions.test.ts`, `tests/rules.test.ts`

**Prompt:**
> Do Phase 1 of docs/crm/PLAN.md. Add types Customer, CustomerAddress, CustomerPanSummary, CustomerStats, Order, OrderLine, OrderPayment, PaymentMode, Visit, VisitKind exactly as in the Data model section. Add `customers` and `visits` modules to UserPermissions, EMPTY_PERMISSIONS and every role preset exactly as in the Permissions table. Add `cus` and `vis` to MODULE_SHORT_CODES and `viewPan: 'p'`, `editPan: 'k'` to ACTION_SHORT_CODES, and extend permCode() in firestore.rules to match. Add a test that permissionsToShortCodes(SUPER_ADMIN_PERMISSIONS) serialises to under 1,000 bytes as JSON. In firestore.rules add matches: customers (read if customers.view), customers/{id}/private/{doc} (deny all client access), customer_mobiles and customer_pans (deny all client access), orders (read if sales.view or returns.view), visits (read if visits.view), counters (deny all). All client writes to these collections are denied. Add composite indexes: customers(searchTerms CONTAINS, isArchived ASC, stats.lastVisitAt DESC), customers(isArchived ASC, stats.lastVisitAt DESC), orders(customerId ASC, date DESC), orders(locationId ASC, date DESC), visits(customerId ASC, at DESC), visits(followUpDone ASC, followUpOn ASC). In src/app/admin/users/page.tsx add Customers and Visits rows to the permission editor; label viewPan “Reveal PAN” and editPan “Add or change PAN”; do not show an export toggle for customers at all, and make the server strip customers.export from any non-super_admin permission set on save. Extend rules and permissions tests for every new rule and preset, including: cashier cannot read customers/{id}/private/pan, store_manager has no export, nobody can read customer_pans from the client. Run npm run test:emulated and paste the result.

**Done when:** emulator tests green; Users screen shows and saves the new toggles.

### Phase 2: utilities (1 day)

**Files:** `src/lib/utils/phone.ts`, `src/lib/utils/money.ts`, `src/lib/server/pan.ts`, `src/lib/utils/customer-search.ts` (all new), `tests/crm-utils.test.ts` (new)

**Prompt:**
> Do Phase 2 of docs/crm/PLAN.md. Pure, unit-tested functions only, no routes. (1) phone.ts: normaliseMobile(countryCode, input) → { countryCode, number, e164 } or a typed error; default +91; for +91 require 10 digits starting 6 to 9; strip spaces, dashes, a leading 0 and a duplicated 91/+91 prefix. (2) money.ts: rupeesToPaise (string or number in, integer out, rejects more than 2 decimals), paiseToRupees, formatINR(paise) using Intl.NumberFormat en-IN INR with 0 to 2 decimals, sumPaise. (3) pan.ts (server-only, import 'server-only'): normalisePan, isValidPan, panHolderType, maskPan (→ “•••••1234F”), encryptPan / decryptPan with AES-256-GCM using node:crypto, random 12-byte IV, keyVersion from env; hashPan as HMAC-SHA256 hex. Throw if keys are missing; never include the PAN in an error message. (4) customer-search.ts: buildSearchTerms(customer) and queryToken(q) following docs/adr/0001-firestore-native-search.md. Tests: Indian mobile edge cases; money edge cases (0.1 + 0.2, “1999.99”, “1999.999” rejected); PAN valid/invalid samples, encrypt→decrypt round trip, tampered ciphertext fails, same PAN gives same hash, different keyVersion still decrypts.

### Phase 3: customer API (1.5 days)

**Files:** `src/lib/server/customers.ts` (new), `src/app/api/admin/customers/route.ts`, `src/app/api/admin/customers/[id]/route.ts`, `src/app/api/admin/customers/[id]/pan/route.ts`, `src/app/api/admin/customers/export/route.ts` (all new), `src/lib/services/audit.service.ts`, `src/lib/services/customers.service.ts` (new client wrapper), `tests/customers.test.ts` (new)

**Prompt:**
> Do Phase 3 of docs/crm/PLAN.md. Follow the auth, permission and audit pattern in src/app/api/admin/transactions/route.ts. Validate every body with zod. Routes: GET /api/admin/customers?q=&cursor= (customers.view; searchTerms array-contains on queryToken(q); excludes archived; ordered by stats.lastVisitAt desc; 25 per page; cursor pagination like transactions). POST /api/admin/customers (customers.add; firstName, lastName, mobile required; optional middleName, email, address, pan; if pan is present also require customers.editPan; in one runTransaction reserve customer_mobiles/{e164} and, if PAN given, customer_pans/{hmac}, write the customer and the encrypted private/pan doc; on conflict return 409 with { field: 'mobile' | 'pan', existingCustomerId }). GET /api/admin/customers/[id] (customers.view; customer + last 20 orders + last 20 visits; PAN only as masked). PATCH /api/admin/customers/[id] (customers.edit for profile fields; moving the mobile swaps the customer_mobiles reservation in the same transaction). PUT /api/admin/customers/[id]/pan (customers.editPan; set or replace, swapping customer_pans reservation; DELETE removes it). POST /api/admin/customers/[id]/pan/reveal (customers.viewPan; returns the full PAN, writes an audit entry “PAN revealed” without the value; rate-limit to 10 reveals per user per hour). DELETE /api/admin/customers/[id] (customers.delete; soft archive; releases nothing). GET /api/admin/customers/export (customers.export; CSV via src/lib/utils/csv.ts with masked PAN only; audited with row count). In audit.service.ts add a redaction step so any diff whose field is pan or matches the PAN regex is stored as “[redacted]”, and test it.

### Phase 4: bills with payments (2 days)

**Files:** `src/lib/server/orders.ts` (new), `src/app/api/admin/orders/route.ts` (new), `src/app/api/admin/orders/[id]/reverse/route.ts` (new), `src/lib/server/ledger.ts`, `src/lib/server/archive.ts`, `src/app/api/admin/transactions/archive/route.ts`, `tests/orders.test.ts` (new), `tests/ledger.test.ts`, `tests/fiscal-closing.test.ts`

**Prompt:**
> Do Phase 4 of docs/crm/PLAN.md. Extract the per-line stock logic from POST /api/admin/transactions into a function that takes a Firestore Transaction `t` and stages all reads before writes. Build POST /api/admin/orders (sales.add for type sale, returns.add for type return; customers.view if customerId given) accepting { type, customerId?, locationId, date, lines[], payments[], notes? } with money in paise. In ONE runTransaction: check the zero-balance lock and the caller’s location lock; validate and update stock for every line; reject unless sumPaise(payments) === total; for old_metal payments require metal, weightMg and purity; write one transactions row per line with orderId, customerId and the legacy rupee price; take orderNo from counters/{fiscalYear} (Indian FY April to March, IST); write the order; write a visits row of kind purchase or return; update customers.stats (visitCount, orderCount, lifetimeValuePaise, lifetimeWeightMg, firstVisitAt if unset, lastVisitAt, lastOrderId). Returns subtract from lifetime value and weight. POST /api/admin/orders/[id]/reverse (sales.delete or returns.delete) reverses every line via ledger.ts and reverses the stats change in one transaction. Keep POST /api/admin/transactions for purchases and movements. In archive.ts and the zero-balance route switch to an explicit allow-list of deletable collections that excludes customers, customer_mobiles, customer_pans, orders, visits and counters, and make sure archive payloads never include customers or private docs. Tests: 4-line order with line 3 out of stock commits nothing; payments 1 paisa short are rejected; reversal restores stock and stats exactly; a full zero-balance run leaves all CRM collections untouched.

### Phase 5: visits API (1 day, parallel with Phase 4)

**Files:** `src/lib/server/visits.ts` (new), `src/app/api/admin/visits/route.ts` (new), `src/app/api/admin/visits/[id]/route.ts` (new), `src/app/api/admin/visits/due/route.ts` (new), `tests/visits.test.ts` (new)

**Prompt:**
> Do Phase 5 of docs/crm/PLAN.md. POST /api/admin/visits (visits.add) records kinds walk_in, inquiry, follow_up and repair only (purchase and return visits are created by orders) with optional note, inquiryId and followUpOn; if followUpOf is given, set that visit’s followUpDone true in the same transaction. Update customers.stats.visitCount, lastVisitAt and openFollowUps transactionally. PATCH /api/admin/visits/[id] (visits.edit) edits note, followUpOn or followUpDone, keeping openFollowUps correct. DELETE (visits.delete) only for manually logged kinds; reverse the stats change. GET /api/admin/visits/due?until=YYYY-MM-DD (visits.view) lists open follow-ups due on or before the date, oldest first, with customer name and mobile. Audit every write. Test that stats stay correct across create, close, reopen and delete.

### Phase 6: sales form uses customers, bills and payments (2 days)

**Files:** `src/app/admin/sales/page.tsx`, `src/components/customer-picker.tsx` (new), `src/components/customer-form.tsx` (new), `src/components/payment-split.tsx` (new)

**Prompt:**
> Do Phase 6 of docs/crm/PLAN.md and follow the design rules in AGENTS.md. Replace the free-text “Customer Name / Entity” field with CustomerPicker: search by mobile or name after 2 characters (150 ms debounce, no animation on results), each result shows name, masked mobile and last visit; a “New customer” row opens CustomerForm inline; an explicit “Walk-in, no details” option. CustomerForm (reused in Phase 7): First name*, Middle name, Last name*, Mobile* (country code select defaulting to +91 + number), Email, Address (line 1, line 2, city, state select, PIN code), PAN (shown only with customers.editPan; uppercase as typed; validated on blur). Validate on blur with inline messages; on 409 show “This mobile/PAN already belongs to <name>” with a “Use this customer” button. Prices accept 2 decimals. Under the total add PaymentSplit: rows of mode (Cash, UPI, Card, Bank transfer, Old metal) + amount + optional reference; Old metal rows add metal, weight (g, 3 decimals) and purity; default one Cash row equal to the total; show remaining balance live; submit disabled until it is ₹0.00. Submit the whole bill to POST /api/admin/orders instead of looping recordTransaction. Sales table: one row per bill (bill no, date, customer linking to /admin/customers/[id], items count, total, payment modes) expandable to lines; reversal calls the order reverse endpoint.

### Phase 7: customer screens (2.5 days, can start after Phase 2 with mocked data)

**Files:** `src/app/admin/customers/page.tsx`, `src/app/admin/customers/[id]/page.tsx`, `src/app/admin/customers/new/page.tsx`, `src/components/log-visit-sheet.tsx` (all new), `src/app/admin/layout.tsx`

**Prompt:**
> Do Phase 7 of docs/crm/PLAN.md and follow the design rules in AGENTS.md. Add “Customers” to navItems after Sales (module customers, action view) and to AdminPageGate. List page: search (mobile or name), filters for last visit (30/90/365 days, never) and “has open follow-up”, table columns name, mobile, city, last visit (relative with exact date on hover), visits, lifetime value (formatINR), PAN on file (yes/no); sticky header; skeleton rows while loading; “Load more”; “New customer” button (customers.add); “Export CSV” only with customers.export. New page reuses CustomerForm. Detail page: header with full name, mobile (tel: link), email (mailto: link), address, PAN shown masked with a “Reveal” button only for customers.viewPan that shows it for 30 seconds then re-masks; Edit (customers.edit) and Archive (customers.delete, with confirm). Stat strip: first visit, last visit, visits, bills, lifetime value, average bill, Gold and Silver weight bought. Tabs “Timeline” and “Bills”, held in searchParams. Timeline merges visits and bills newest first; each bill expands to items and payments; open follow-ups pinned at top with “Mark done”. Bills tab lists every bill with payment modes and reversal state. “Log visit” (visits.add) opens a right-side sheet: kind, note, optional follow-up date. Hide every action the user lacks permission for rather than disabling it.

### Phase 8: inquiries and old sales (1 day)

**Files:** `src/app/admin/inquiries/page.tsx`, `scripts/backfill-customers.mjs` (new)

**Prompt:**
> Do Phase 8 of docs/crm/PLAN.md. On the inquiries page add “Convert to customer” (customers.add) that opens CustomerForm pre-filled from the inquiry’s firstName, middleName, lastName, countryCode, mobile and email. If inquiry.gstinPan is a valid 10-character PAN and the user has customers.editPan, pre-fill PAN; if it is a 15-character GSTIN, do not fill PAN and put “GSTIN: <value>” in notes. Save appends the inquiryId to the customer and writes a visit of kind inquiry dated at the inquiry’s createdAt. If the mobile already exists, link the inquiry and write the visit on that customer instead. Show “Linked to <customer>” on converted inquiries. Write scripts/backfill-customers.mjs, dry-run by default, that lists current-year sale transactions with a customerName and no customerId grouped by normalised name into a CSV for manual review. It must not create or link customers automatically.

## Acceptance checklist (whole CRM)

1. A customer cannot be saved without first name, last name and a valid mobile.
2. A second customer with the same mobile or the same PAN is refused with a link to the existing one.
3. A cashier can type a PAN but only ever sees it masked; a manager can reveal it and the reveal shows in the audit log without the PAN.
4. A 3-item bill paid ₹50,000 UPI + ₹1,20,000.50 cash + old silver appears as one bill on the customer’s Bills tab and as one visit on the Timeline.
5. After a full Zero Balance run, every customer’s bills, visits and lifetime figures are unchanged.
6. Only a super_admin sees the Export button, and the CSV contains no full PAN.

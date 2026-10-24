# CRM & Customer Domain Rules

These rules govern all code, API routes, data mutations, and UI components touching customers, bills, visits, payments, or the stock ledger.

## 1. Architectural Boundaries & Zero-Balance Isolation

1. **Isolation of Customer Identities & Fiscal Counters:** `customers`, `customers/*/private`, `customer_mobiles`, `customer_pans`, `visits`, and `counters` are permanent collections. They must NEVER be deleted, purged, or truncated by the annual Zero-Balance / fiscal closing process (`src/lib/server/archive.ts`). Customer lifetime statistics (`customers.stats`) stay as they are, and bill counters are never reset so bill numbers remain unique within a fiscal year.
2. **Stock Ledger & Bill Purging:** During year-end Zero-Balance, historical ledger rows in `transactions` AND bills in `orders` dated on or before the cutoff date are purged. Prior to deletion, orders on or before the cutoff are sealed into `ordersSnapshot` within the archive with cryptographic checksum verification (`version: '1.5'`, `checksumScope: 'v2-orders'`). Archived bills are deleted strictly by their exact IDs via `purgeArchivedOrdersServer(orderIds)` which is safe to run twice on resumed archive runs.
3. **Atomic Multi-Item Bills:** Sales and returns with multiple lines must be written as a single `orders` document in ONE atomic `runTransaction`. Looping individual transaction writes at the POS counter is forbidden.

## 2. Data Types & Field Rules

1. **Monetary Values (Paise):**
   - All money in `orders`, `payments`, and `customers.stats` MUST be stored as integer paise (1 Rupee = 100 Paise).
   - Conversions between Rupees and Paise must ONLY happen via `src/lib/utils/money.ts` (`rupeesToPaise`, `paiseToRupees`).
   - Fractional paise are prohibited. Always validate that `payments[].amountPaise` sums exactly to `totals.amountPaise`.
   - Legacy `transactions.price` remains in decimal Rupees for backwards compatibility with the stock ledger.
2. **Weights (Milligrams):**
   - All product and scrap weights are stored as integer milligrams (`mg`), consistent with the existing ledger utilities (`gramsToMg`, `mgToGrams`).
3. **Customer Mobile Numbers:**
   - Always normalized to E.164 format via `normaliseMobile(countryCode, input)` in `src/lib/utils/phone.ts`.
   - Default country code is `+91`. For Indian numbers, exactly 10 digits starting with 6–9 are required.
   - Mobile uniqueness is enforced by atomically reserving `customer_mobiles/{e164}` inside the customer write transaction.
4. **PAN Security & Privacy:**
   - Format: `^[A-Z]{5}[0-9]{4}[A-Z]$` (uppercase, stripped of whitespace).
   - The plain PAN must NEVER appear in:
     - Client responses (`customers` doc only contains `pan: { masked: "•••••1234F", last4: "234F", holderType: "P" }`)
     - General audit logs (`audit_logs`)
     - Application console logs or error messages
     - CSV exports (`customers.export`)
     - System archive payloads
   - **Encryption:** The full PAN is stored exclusively in `customers/{customerId}/private/pan` using AES-256-GCM with a 12-byte random IV and the server-only `PAN_ENCRYPTION_KEY`.
   - **Uniqueness / Blind Index:** Uniqueness is enforced by reserving `customer_pans/{hmac}`, where doc ID is `HMAC-SHA256(normalisePan(pan), PAN_HMAC_KEY)` in hex.
   - **Access Control:** Decryption/reveal requires `customers.viewPan` permission via `POST /api/admin/customers/[id]/pan/reveal`. Every reveal is audited (logging the operator, not the PAN value) and rate-limited.

## 3. Permissions & Security Hierarchy

- `customers: { view, add, edit, delete, export, viewPan, editPan }`
- `visits:    { view, add, edit, delete }`
- Cashiers (`sales_cashier`) can enter a PAN (`editPan`) during checkout or registration, but cannot reveal stored PANs (`viewPan` denied).
- Full PAN reveals are restricted to `store_manager` and `super_admin`.
- Customer export (`customers.export`) is strictly reserved for `super_admin` and stripped from all other roles on save.
- All client writes to `customers`, `orders`, `visits`, `counters`, `customer_mobiles`, and `customer_pans` are denied by `firestore.rules`. All mutations execute via authenticated Admin SDK API routes.

## 4. Design & Interaction Guidelines (Emil Kowalski Principles)

When building CRM and POS components (`CustomerPicker`, `CustomerForm`, `PaymentSplit`, `/admin/customers`):
1. **Font & Palette:** Use global `Inter` font, monochromatic/grayscale styling, high contrast, and subtle borders.
2. **Tactile Feedback:** Every button and interactive element must include active state scaling:
   ```css
   transition: background-color 160ms var(--ease-out), transform 160ms var(--ease-out);
   &:active { transform: scale(0.97); }
   ```
   Never use `transition-all`.
3. **Origin-Aware Popovers:** All dropdowns and pickers must animate with `origin-top`, not from the center.
4. **Natural Entrance:** Dialogs and popovers must enter starting from `opacity: 0` and `scale(0.95)` (no `scale(0)` pops).
5. **Debouncing:** Search inputs must use a 150ms debounce and render results without distracting layout shifts.

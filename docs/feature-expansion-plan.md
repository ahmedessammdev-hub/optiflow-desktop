# Feature expansion plan

## Phase 1 — Customer fulfilment (implemented)

- Appointments with scheduled time, status, purpose, reminder and customer linkage.
- Lab orders linked to customer, prescription and optional sale, with due date, cost and controlled status history.
- Quotes and optional stock reservations with immutable line snapshots, discount/tax/deposit/refund, expiry, cancellation and one-time conversion to a sale.
- Repairs and warranty intake with issue, resolution, due/delivery dates and status.
- Customer follow-ups for examinations, collections and lens replacement.

Acceptance: every record is persisted, searchable, permission-checked and audited; status changes are validated; quote conversion uses the normal transactional checkout path.

## Phase 2 — Inventory control (implemented)

- Structured product variants represented by independently stocked SKU/barcode product records linked to a parent style.
- Counted stocktake sessions with expected/count/difference and one atomic posting of adjustments.
- Supplier returns with original purchase linkage, stock reduction and supplier credit balance.
- Scannable Code 39 barcode label preview/print for products.

Acceptance: no negative stock, no duplicate posting, immutable posted documents, and supplier balances include returns.

## Phase 3 — Branch readiness (local foundation implemented)

- Branch directory, active branch selection and branch attribution on new operational records.
- Branch stock ledger and audited inter-branch transfers.
- Durable immutable outbox of operational mutations for a future authenticated synchronization service.

Acceptance: sales, purchasing, cash drawers, workflows, reports and stock are scoped to the active branch; local branch transfers balance to zero globally; reserved or physical branch stock cannot go negative; outbox events are immutable and idempotently identifiable. Live cloud synchronization remains a deployment integration because it requires a server URL, identity provider and conflict policy.

## Delivery gates

Each phase requires a checksum-verified SQLite migration, domain tests, renderer validation, Electron lifecycle coverage, production build and packaged acceptance. Existing invoice and inventory history must remain unchanged.

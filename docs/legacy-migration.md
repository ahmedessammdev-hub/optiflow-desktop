# Legacy import

Use a JSON export with arrays `customers`, `products`, `categories`, `invoices`, `invoice_items`, `payments`, and optionally `users`. Field names match the audited Laravel models. Export `created_at`/`updated_at` as ISO timestamps with explicit timezone (`2026-01-01T12:00:00+02:00`). Do not pass a SQL dump or an API URL to the importer.

Keep a separate backup of the legacy database/export. The desktop importer makes a target backup first. It imports in one database transaction; invalid relationships, missing timestamps, bad optical measurements, non-reconciling invoice totals or payment discrepancies roll back the entire import. Errors must be reconciled in the export and retried. No production database connection is used.

Import current stock as opening inventory, never deduct historical sales a second time. Legacy IDs and raw source rows are preserved. Exact repeated files are detected by SHA-256. Overlapping IDs from other exports are rejected. Duplicate customer phones are reported, never merged.

Medical information becomes an independent prescription with unknown examination date, preserving both monocular PD values and IPD. Old invoices do not inherit this current prescription. Historical product costs are marked unknown, not estimated from today's wholesale price; profit is unavailable for affected periods. Original product descriptions and seller identity were not snapshotted by legacy code; imported documents explicitly disclose that limitation.

Legacy user accounts are not activated. Password hashes are not copied into raw source records. Create new accounts with fresh passwords. Manual safe entries without invoices remain in the source archive and are reported for manual reconciliation because historical cash sessions cannot be reconstructed reliably. Legacy image paths remain in source records; image bytes need separate attachment import.

No real business data has been migrated during development.

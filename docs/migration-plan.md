# Migration plan

Never connect this implementation to a production database for writes. Require a legacy export and backup. Import into a new desktop database after backing up the target. Validate all rows and relationships before committing. Keep source identifiers and a content fingerprint for repeat-import protection.

Map others → other and contactLens → contact_lenses. Preserve customer address and all available OD/OS measurements including PD. If exam date is unknown, keep it null and label it imported/unknown. Do not claim the imported current prescription was used on old invoices. Reconcile invoice totals, payment sums and stock. Preserve unknown historical costs as unknown; exclude or flag affected profit reporting. Never silently invent a balancing payment.

Provide imported/skipped/failed/duplicate/warning counts and row details. Passwords require new setup/reset; do not migrate plaintext passwords or assume Laravel hashes are compatible. SQL dumps are not executable input: use a reviewed JSON export. No business data has yet been migrated.

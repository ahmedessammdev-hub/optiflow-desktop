# Release status

Work in progress. This file is the explicit acceptance ledger and must be updated with final test/package results.

Implemented: standalone Electron/React application; secure preload and sender-validated IPC; main-owned login/RBAC; clean setup; versioned SQLite migrations; catalog/customer CRUD and archival; customer prescription history; canonical prescription component; transactional stock movements; POS barcode/search/cart; integer totals; split and partial payments; invoice snapshots; payment reversal; partial returns/refunds; purchase creation/receiving; cash opening/closing/reconciliation; expenses; searchable reports/CSV; dashboard; print previews/PDF; store/print settings; backup/restore; JSON legacy importer.

Verified so far: strict typecheck, lint, production build, 19 unit/integration/render tests, and one Electron lifecycle test. The lifecycle covers setup, scan, partial checkout, debt payment, print preview, return, backup and restart persistence. Dependency audit was clean after switching to Electron 44 and bundled SQLite.

Remaining acceptance gaps to resolve or explicitly disclose before release: full Arabic translation coverage (some enum/date labels and backend validation remain English), all advanced report filters/metrics and print templates, managed attachment UI, automatic backup/retention/folder selection, administrator reset/role editing, purchase payment ledger, profile pagination beyond 100 invoices, complete component-test matrix, packaged launch/installer verification, external printer testing and signing. Optional lab orders/appointments are deferred until core release gates pass. Do not label this release production-ready while mandatory gaps remain.

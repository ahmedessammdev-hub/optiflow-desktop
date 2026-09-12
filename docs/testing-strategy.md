# Testing strategy

Unit tests cover integer money, discount/tax allocation, optical ranges, date periods and growth. Real SQLite integration tests cover atomic sale rollback, split/partial payments, stock, returns, purchasing, cash, permissions, archival snapshots and backup restoration. Component tests cover canonical prescription rendering, forms and print settings. Electron Playwright tests exercise first-run setup, login, customer/prescription/product creation, checkout, debt payment, return, report refresh, preview and restart persistence.

Known regression gates: search record 11+, old prescription/product snapshots survive edits, yesterday excludes today, profit growth compares prior profit, overpayment/invalid discounts/negative stock/excess returns fail, forged IPC permissions fail, invalid backups/path traversal fail, Arabic documents are RTL and currency is configurable.

Release gates: lint, strict typecheck, unit/integration/component/Electron tests, production build, NSIS packaging, packaged launch and isolated lifecycle verification. Do not describe unexecuted tests or packaging as passing. Hardware printer output requires an available printer; PDF rendering can be tested independently.

# Architecture

Local-first Electron application, React/TypeScript renderer, validated typed preload calls, main-process domain services and SQLite. The original repositories remain separate references.

SQLite uses foreign keys, WAL, busy timeout, checked constraints and versioned, checksum-verified migrations. Writes execute under BEGIN IMMEDIATE. Financial values are integer minor units; proportional allocations use integer arithmetic and deterministic remainder distribution. UTC timestamps and configured business timezone govern reporting.

The main process owns authentication and authorization. Renderer-supplied role/user claims are never trusted. Only explicit commands cross IPC; raw SQL and filesystem paths are not exposed. Context isolation, sandboxing, no Node integration, blocked navigation and restrictive CSP isolate presentation.

Domain modules cover identity, catalog, customers/prescriptions, sales, inventory, purchasing, ledgers, fulfilment workflows, quotes/reservations, branches and analytics. Shared Zod schemas define input contracts. React Query manages server state and invalidation. CSS design tokens provide accessible desktop layouts and logical RTL properties. Dedicated React print documents reuse PrescriptionView.

Database adapter decision: use Node's bundled `node:sqlite` through a small typed adapter. The patched Electron 44 runtime did not have a compatible better-sqlite3 prebuilt binary, and this machine has no Visual Studio C++ toolchain. Removing the native addon avoids an installer ABI dependency. Drizzle was removed rather than retaining an unused ORM; prepared SQL and checksum-verified SQL migrations implement the repository boundary. React Hook Form and React Query are used; plain CSS design tokens replace Tailwind for the compact shared styling layer. Optional cloud synchronization can consume stable UUIDs and the immutable operational outbox; no remote writes are implemented because endpoint identity and conflict policy are deployment inputs.

Production data belongs under Electron userData, outside installation. Packaging uses electron-builder NSIS. Clean databases require first-run administrator creation and contain no demo users or sales. Backups use a consistent database snapshot plus managed attachments and a checked manifest. Restore validates first, creates a safety backup, and requires an explicit restore action.

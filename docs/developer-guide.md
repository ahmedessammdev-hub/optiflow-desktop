# Developer guide

The renderer calls `window.optical.invoke`. Preload exposes only this constrained bridge. Main validates sender frame and queues commands. `Application.execute` dispatches to domain services, which validate Zod payloads and enforce main-owned permissions. The renderer never imports database modules at runtime.

`packages/database/migrations` contains immutable numbered SQL migrations. Add a new migration; never edit an applied migration. `Store` verifies migration hashes. Write operations use `Store.tx`, which begins an immediate transaction. No nested asynchronous operations are permitted inside these synchronous transactions.

All authoritative money is integer minor units, bounded to safe integer arithmetic. Use `minor`, `checked`, `totals`, and `allocate`. Returns allocate cumulative original line values to avoid rounding drift. Sale tax and discount shares are stored explicitly. Profit uses original unit cost and reverses returned cost, with unknown historical costs flagged.

Tests run with Node's built-in SQLite and isolated temporary databases. Electron end-to-end tests use `OPTICAL_TEST_DATA` only for unpackaged development; packaged builds ignore that override. Test artifacts are under `test-results`. Never aim development tooling at real userData.

Commands: `npm run dev`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e`, `npm run package`. `npm run format` formats source. SQLite migrations execute on startup; the maintenance CLI documents explicit migration/import/verification use when available.

Security boundary: local OS administrators can access unencrypted files. App RBAC is not filesystem encryption. No signing certificate or auto-update service is configured. Supply signing credentials only through deployment configuration, never committed files.

Both packaged and development builds accept `--user-data-dir=<absolute isolated directory>` for explicit test profiles. Set `OPTICAL_PACKAGED` to the packaged executable path and run `npx playwright test tests/e2e/release.spec.ts` for packaged acceptance. Never point tests at shop data.

After building, the maintenance CLI supports `npm run maintenance -- migrate --data-dir <directory>` and `npm run maintenance -- verify --data-dir <directory> --file <backup>`. Authenticated `backup` and `import --file <legacy-json>` additionally require `--username <admin>` and the process environment variable `OPTICAL_ADMIN_PASSWORD`. Do not put passwords in scripts or command history. Close the desktop app before maintenance. Import creates and verifies a safety backup before processing. Use Node 24 or newer with built-in SQLite and run from the project root.

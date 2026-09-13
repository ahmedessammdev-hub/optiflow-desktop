# Optical Desktop

Local-first optical shop management for Windows. Electron, React 19, TypeScript, SQLite (`node:sqlite`), Zod, React Query, React Hook Form, Recharts, Vitest and Playwright. The original Laravel/React repositories remain unchanged beside this application.

## Development

Use Node 24.10+ and npm on Windows.

```powershell
npm ci
npm run dev
```

`dev` builds and launches the desktop application without a development web server. On first launch, create an administrator with a password of at least 10 characters. There are no default production credentials and no demo business data.

## Verification and packaging

```powershell
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
npm run package
```

Installer output is in `release/`. App data lives in Electron's userData directory, separately from installation. See Settings & Help for exact local paths. `npm run package:dir` creates an unpacked build. Database migrations run automatically and verify checksums at startup.

See [user guide](docs/user-guide.md), [feature expansion plan](docs/feature-expansion-plan.md), [developer guide](docs/developer-guide.md), [architecture](docs/architecture.md), [legacy audit](docs/current-system-audit.md), [migration guide](docs/legacy-migration.md), [printing](docs/printing-design.md), [backup/restore](docs/backup-restore.md) and [release status](docs/release-status.md).

This repository's release status records verified coverage and remaining gaps. Do not assume every requirement in the master brief is complete merely because the application builds.

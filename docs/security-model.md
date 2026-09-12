# Security model

All commands validate inputs and resolve a main-process session. Permissions are checked in the domain boundary, including reads exposing profit and sensitive audit data. UI visibility is convenience, not authorization. First-run setup is available only when no users exist. Password hashing uses a salted adaptive KDF; login failures are rate limited. No default production credentials.

Preload exports a fixed command API, no raw ipcRenderer, filesystem or database. Main verifies sender identity, denies navigation/new windows and permissions, and loads packaged assets with contextIsolation=true, nodeIntegration=false and sandbox=true. Import/export paths come from native dialogs and managed asset names are generated internally. Imported strings are rendered as text; no executable HTML/SQL imports.

Financial records and audit events are append-only. Password hashes never appear in API results or audit logs. Local administrators with filesystem access remain outside the RBAC threat boundary; full database encryption requires an explicit key-recovery design. Restore is validated and preceded by a safety backup.

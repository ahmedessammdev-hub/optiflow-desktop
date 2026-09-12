# Backup and restore

Create Backup generates a consistent SQLite online snapshot and packages it with managed assets into an `.opticalbackup` gzip bundle. The manifest contains SHA-256 checksums for the database and each asset. Backup history records the generated filename and checksum. Backups currently reside in the application data backup folder shown in Settings & Help.

Restore requires backup permission and native file selection. It validates compressed size, JSON schema, filenames, checksums, SQLite integrity, foreign keys, migration hashes and schema/trigger definitions. It then creates a fresh safety backup, checkpoints/closes the active database, retains the previous database under a unique pre-restore name, installs the validated snapshot and restarts. A copy failure attempts to reinstate the previous database. Do not close or kill the application during restore.

Backups contain private customer and prescription data and are not encrypted. Copy them to a protected separate drive to survive machine failure. A backup on the same disk is not protection against disk failure. No database reset control is provided.

Automatic scheduling, retention and configurable external backup folders are tracked separately in release status until implemented and tested. An actual shop restore must be initiated by its authorized operator, not by development automation.

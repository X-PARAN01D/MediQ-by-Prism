# MediQ SQLite Database Integrity & Recovery Guide

## 1. Root Cause Analysis

### Why Recurring Corruption Occurred
In previous versions, `mediq.db` experienced corruption across multiple sessions and exports due to the following sequence:
1. **Unclean Process Kills in WAL Mode with `synchronous = NORMAL`**: When the container or dev process was killed abruptly (e.g. dev reload, container shutdown), in-flight transactions or uncheckpointed Write-Ahead Log (WAL) index headers (`.db-shm` / `.db-wal`) were left partially written, resulting in `PRAGMA integrity_check` failing with `database disk image is malformed`.
2. **Blind Backup Propagation**: The backup routine previously used direct file copying (`fs.copyFileSync`) on timed intervals and startup *without* running `PRAGMA integrity_check` first. As a result, when the live database became corrupt, the backup system copied the broken file into `/backups/`, overwriting healthy backups and pushing out older files until all backups were corrupted.

---

## 2. Implemented Root-Cause Fixes

### A. Pre-Backup & Startup Integrity Verification (`PRAGMA integrity_check`)
- **Startup Check**: On every server boot, `initDatabase()` executes `verifyDatabaseIntegrity()` before running schema migrations or accepting API traffic.
- **Backup Verification**: `dbBackup()` executes `verifyDatabaseIntegrity()` on the active database *before* taking a snapshot. If corrupted, backup creation is immediately aborted to prevent corrupting `/backups/`.
- **Post-Creation File Check**: Every generated snapshot file is verified via a standalone read-only connection before being committed or rotated.

### B. Atomic Snapshot Creation (`VACUUM INTO`)
- Backups now use SQLite's native online `VACUUM INTO` command, guaranteeing a zero-WAL, defragmented, standalone `.db` file that cannot contain torn WAL pages.

### C. Permanent Golden Baseline Backup (`mediq_backup_verified_golden.db`)
- A verified-healthy baseline copy (`backups/mediq_backup_verified_golden.db`) is generated and **exempt from automated rotation/pruning**.
- If a catastrophic corruption ever occurs on live disk, the server automatically recovers from this permanent golden baseline.

### D. Hardened Pragmas (`synchronous = FULL`)
- `PRAGMA synchronous = FULL;` ensures that all WAL frames and page headers are flushed to durable storage before transactions complete, preventing header corruption during sudden power or process terminations.
- `PRAGMA busy_timeout = 8000;` prevents concurrent busy locks.
- `PRAGMA wal_autocheckpoint = 1000;` maintains compact WAL file sizes.

### E. Graceful Process Signal Handling
- `SIGINT`, `SIGTERM`, and `beforeExit` hooks trigger `closeDatabaseGracefully()`, which runs `PRAGMA wal_checkpoint(TRUNCATE);` and `PRAGMA optimize;` before closing the database handle.

---

## 3. Developer & Operational Recovery Checklist

### If you suspect corruption or need to verify health:

1. **Check Live Integrity via API**:
   - Query `GET /api/system/status` (or `PRAGMA integrity_check(100);`).
   - If `status` is `"HEALTHY"` and `integrityStatus.valid` is `true`, your database is pristine.

2. **Trigger an On-Demand Verified Backup**:
   - Send `POST /api/system/backup` (authenticated doctor or admin).
   - This executes full integrity checks, VACUUMs an atomic snapshot, verifies the resulting file, and updates `/backups/mediq_backup_latest.db`.

3. **Manual Recovery Steps (if manually restoring files)**:
   - Stop the Node server.
   - Remove lingering lock files if present: `rm -f mediq.db-wal mediq.db-shm`.
   - Copy a verified backup file into place:
     ```bash
     cp backups/mediq_backup_verified_golden.db mediq.db
     ```
   - Restart the application: `npm run dev` or `npm start`.

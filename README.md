# MediQ: Smart Triage & Teleconsultation System for Rural Primary Health Centres (PHCs)

[![SIH 2026 PS-03](https://img.shields.io/badge/SIH%202026-Problem%20Statement%20PS--03-blue.svg)](https://sih.gov.in)
[![Security Hardened](https://img.shields.io/badge/Security-Hardened%20%26%20RBAC-success.svg)](https://github.com)
[![Database](https://img.shields.io/badge/Database-SQLite%203%20(WAL%20Mode)-orange.svg)](https://sqlite.org)

MediQ is an AI-augmented Clinical Triage, Priority Token Engine, and Real-Time WebRTC Teleconsultation platform tailored for India's rural Primary Health Centres (PHCs) and Sub-Centres under Ayushman Bharat Digital Mission (ABDM).

---

## 🔒 Security Architecture & Hardening

MediQ has been hardened for production environments handling real patient health records (EHR):

1. **Role-Based Access Control (RBAC)**:
   - Backend routes strictly enforce `requireRole('doctor')`, `requireRole('patient')`, or `requireAuth`.
   - Doctor-exclusive capabilities (calling next patient, generating prescriptions, accepting/rejecting teleconsults, ambulance dispatch) reject non-doctor sessions with HTTP `403 Forbidden`.
   - Patient health history modification and vitals logging require valid patient authorization matching their identifier.
   - Non-authenticated requests receive HTTP `401 Unauthorized`.

2. **Cryptographic Credential & Session Security**:
   - Passwords are encrypted using Node.js native `crypto.scryptSync` with 16-byte random salts (64-byte key length), preventing rainbow table and brute-force vulnerabilities.
   - Session tokens are generated using `crypto.randomBytes(32)` (256-bit cryptographically strong entropy).
   - Server-side session invalidation (`/api/auth/logout`) completely purges tokens from SQLite `auth_sessions`. Expired sessions are automatically reaped.

3. **Input Validation & Sanitization**:
   - Comprehensive request schemas validated across `/api/auth/register/*`, `/api/triage`, `/api/chatbot/diagnose-and-recommend`, `/api/consult/prescription`, and `/api/teleconsult/request`.
   - Recursive HTML entity escaping and control-character stripping (`sanitizePayload`) prevent XSS attacks and injection vectors.
   - All database transactions use SQLite parameterized prepared statements (`better-sqlite3`), preventing SQL Injection.

4. **Rate Limiting & Abuse Prevention**:
   - **Auth endpoints (`/api/auth/login`, `/api/auth/register/*`)**: Limited to 20 attempts per 15-minute window to block credential stuffing.
   - **AI/LLM endpoints (`/api/chatbot/*`, `/api/triage`, `/api/voice/*`)**: Rate-limited to prevent Gemini API quota exhaustion and denial-of-wallet attacks.
   - **General API endpoints**: Protected against traffic bursts with sliding reset windows.

5. **Transport & WebRTC Security**:
   - Production HTTPS enforcement via `Strict-Transport-Security` (HSTS), secure cookies, and TLS reverse proxy support.
   - Media devices (`navigator.mediaDevices.getUserMedia`) for video teleconsultation are secured through HTTPS transport.
   - Standard security headers added (`X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `X-XSS-Protection: 1; mode=block`).

---

## 🔑 Environment Variables & AI Fallback

The application reads secrets exclusively from system environment variables. Never commit `.env` to source control.

| Variable Name | Required | Description | Example |
|---|---|---|---|
| `GEMINI_API_KEY` | Recommended | Google Gemini API key used for AI-augmented clinical triage, copilot diagnostics, and speech translation. Server-side only; never leaked to client. | `AIzaSy...` |
| `DB_PATH` | Optional | Custom SQLite file location (useful to store DB outside cloud-synced folders). Default: `./mediq.db`. | `C:\dev\mediq\mediq.db` |
| `NODE_ENV` | Optional | Set to `production` in deployment to enforce HTTPS headers and static asset serving. | `production` |
| `PORT` | Optional | Port for the backend Express server (default: `3000`). | `3000` |
| `APP_URL` | Optional | Public base URL for OAuth callbacks and WebRTC signaling. | `https://my-mediq-app.run.app` |

> **Note on AI Triage vs. Rule-Based Fallback**:
> If `GEMINI_API_KEY` is not provided or invalid, MediQ **automatically switches to its built-in Clinical Rule-Based Triage Engine** (`evaluateRuleBasedTriage`). Critical emergency vitals, red-flag symptoms, pediatric fevers, and queue prioritization calculate 100% offline. Gemini-based conversational refinement and medical copilot summaries activate when a valid API key is present.

---

## 🚀 Quick Start & Windows Installation Guide

### Recommended Directory Structure on Windows
To avoid PowerShell special-character parsing issues (e.g. `&` or spaces in folder names) and OneDrive synchronization file locks:
- **Do not** place the project in folders containing `&` (e.g., `ai-&-teleconsultation`) or spaces.
- **Do not** place SQLite databases inside OneDrive, Dropbox, or iCloud synced folders.
- **Recommended path**: `C:\Projects\MediQ` or `C:\dev\mediq`.

### 1. Safe Windows Setup / Move Steps
```powershell
# Create a dedicated local development folder (outside OneDrive)
New-Item -ItemType Directory -Path "C:\Projects" -Force

# Move project to clean path
Move-Item -Path ".\old-folder-path" -Destination "C:\Projects\MediQ"

# Navigate and reinstall dependencies
Set-Location "C:\Projects\MediQ"
Remove-Item -Recurse -Force node_modules, package-lock.json -ErrorAction SilentlyContinue
npm install
```

### 2. Configure Environment
Copy `.env.example` to `.env`:
```powershell
Copy-Item .env.example .env
```

### 3. Run Development Server
```bash
npm run dev
```

### 4. Production Build & Start
```bash
npm run build
npm start
```

---

## 🛡️ Database Management & OneDrive Protection

MediQ persists all clinical data to a local SQLite database (`mediq.db`) with:
- **Write-Ahead Logging (WAL)** for high concurrency.
- **Automated Snapshots** saved on initialization and every 6 hours to `/backups/`.
- **Integrity Self-Healing**: Automated `PRAGMA quick_check` runs on startup to detect page anomalies.
- **System Health Endpoints**:
  - `GET /api/system/db-status` — Database connection, journal mode, and row counts.
  - `POST /api/system/backup` — Trigger on-demand backup snapshot (requires doctor or admin role).

### Fixing SQLite Disk Image Malformed (Corrupted DB)
If a database corruption occurs due to an unclean crash or cloud sync lock:
1. Stop the application server (`Ctrl + C`).
2. Delete the corrupted files:
   ```powershell
   Remove-Item mediq.db, mediq.db-wal, mediq.db-shm -ErrorAction SilentlyContinue
   Remove-Item backups\*.db -ErrorAction SilentlyContinue
   ```
3. Run `npm run dev`. `initDatabase()` will automatically regenerate a pristine database, seed demo doctors/patients, and create a fresh backup in `/backups/mediq_backup_latest.db`.

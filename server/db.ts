import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { DoctorProfile } from '../src/types';

// Persistent Database Path (Workspace Root, safe from build/dist directory wiping)
export const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'mediq.db');
export const BACKUP_DIR = path.join(process.cwd(), 'backups');
export const GOLDEN_BACKUP_NAME = 'mediq_backup_verified_golden.db';
export const GOLDEN_BACKUP_PATH = path.join(BACKUP_DIR, GOLDEN_BACKUP_NAME);

/**
 * Validates active SQLite database connection integrity using PRAGMA integrity_check.
 */
export function verifyDatabaseIntegrity(targetDb?: DatabaseSync, maxErrors = 100): { valid: boolean; issues: string[] } {
  try {
    const connection = targetDb || db;
    const rows = connection.prepare(`PRAGMA integrity_check(${maxErrors});`).all() as any[];
    if (!rows || rows.length === 0) {
      return { valid: false, issues: ['No integrity check rows returned from SQLite.'] };
    }
    const firstVal = Object.values(rows[0] || {})[0];
    if (rows.length === 1 && firstVal === 'ok') {
      return { valid: true, issues: [] };
    }
    const issues = rows.map(r => String(Object.values(r || {})[0]));
    return { valid: false, issues };
  } catch (err: any) {
    return { valid: false, issues: [err.message || 'Integrity check exception'] };
  }
}

/**
 * Validates an on-disk SQLite database file by opening a dedicated read-only connection.
 */
export function verifyFileIntegrity(filePath: string, maxErrors = 100): { valid: boolean; issues: string[] } {
  if (!fs.existsSync(filePath)) {
    return { valid: false, issues: ['Database file does not exist on disk.'] };
  }
  let tempConn: DatabaseSync | null = null;
  try {
    tempConn = new DatabaseSync(filePath, { readOnly: true });
    const result = verifyDatabaseIntegrity(tempConn, maxErrors);
    return result;
  } catch (err: any) {
    return { valid: false, issues: [err.message || 'Failed opening file for integrity verification'] };
  } finally {
    if (tempConn) {
      try {
        tempConn.close();
      } catch (_) {}
    }
  }
}

export function quarantineAndCleanDbFiles(reason = 'Corrupted database quarantined') {
  try {
    if (fs.existsSync(DB_PATH)) {
      const corruptName = path.join(process.cwd(), `mediq_corrupt_${Date.now()}.db`);
      fs.renameSync(DB_PATH, corruptName);
      console.warn(`[SQLite Self-Healing] ${reason}. Quarantined to: ${corruptName}`);
    }
  } catch (renameErr) {
    try {
      if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
    } catch (_) {}
  }
  try {
    if (fs.existsSync(`${DB_PATH}-wal`)) fs.unlinkSync(`${DB_PATH}-wal`);
    if (fs.existsSync(`${DB_PATH}-shm`)) fs.unlinkSync(`${DB_PATH}-shm`);
  } catch (_) {}
}

/**
 * Scans available backups in /backups, verifies their integrity, and restores the best verified backup.
 */
export function restoreFromVerifiedBackup(): { restored: boolean; sourcePath?: string } {
  try {
    if (!fs.existsSync(BACKUP_DIR)) {
      return { restored: false };
    }

    const candidateFiles: string[] = [];
    
    // Priority 1: Verified Golden Backup
    if (fs.existsSync(GOLDEN_BACKUP_PATH)) {
      candidateFiles.push(GOLDEN_BACKUP_PATH);
    }

    // Priority 2: Latest backup
    const latestPath = path.join(BACKUP_DIR, 'mediq_backup_latest.db');
    if (fs.existsSync(latestPath) && !candidateFiles.includes(latestPath)) {
      candidateFiles.push(latestPath);
    }

    // Priority 3: Timestamped backups sorted by newest first
    const allFiles = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('mediq_backup_') && f.endsWith('.db'))
      .map(f => path.join(BACKUP_DIR, f))
      .sort((a, b) => {
        try {
          return fs.statSync(b).mtime.getTime() - fs.statSync(a).mtime.getTime();
        } catch (_) {
          return 0;
        }
      });

    for (const file of allFiles) {
      if (!candidateFiles.includes(file)) {
        candidateFiles.push(file);
      }
    }

    for (const candidate of candidateFiles) {
      const check = verifyFileIntegrity(candidate);
      if (check.valid) {
        // Clean out any lingering WAL/SHM locks
        try {
          if (fs.existsSync(`${DB_PATH}-wal`)) fs.unlinkSync(`${DB_PATH}-wal`);
          if (fs.existsSync(`${DB_PATH}-shm`)) fs.unlinkSync(`${DB_PATH}-shm`);
        } catch (_) {}

        fs.copyFileSync(candidate, DB_PATH);
        console.log(`[SQLite Auto-Recovery] Successfully restored database from verified backup: ${candidate}`);
        return { restored: true, sourcePath: candidate };
      } else {
        console.warn(`[SQLite Auto-Recovery] Skipping invalid backup (${path.basename(candidate)}): ${check.issues.join(', ')}`);
      }
    }

    return { restored: false };
  } catch (err: any) {
    console.error('[SQLite Auto-Recovery] Backup restoration error:', err.message);
    return { restored: false };
  }
}

function createDatabaseConnection(): DatabaseSync {
  try {
    return new DatabaseSync(DB_PATH);
  } catch (err: any) {
    console.warn('[SQLite Self-Healing] Failed opening database, creating clean instance:', err.message);
    quarantineAndCleanDbFiles('Initial database connection failure');
    return new DatabaseSync(DB_PATH);
  }
}

export let db = createDatabaseConnection();

// ----------------------------------------------------
// Database Reliability & Performance Configuration (WAL Mode & Pragmas)
// ----------------------------------------------------
export function configurePragmas(targetDb?: DatabaseSync) {
  const connection = targetDb || db;
  try {
    // 1. Enable Write-Ahead Logging (WAL) for high concurrency (non-blocking reads & writes)
    connection.exec('PRAGMA journal_mode = WAL;');
    // 2. Set synchronous mode to FULL for crash-resilience and to protect WAL headers against abrupt kills
    connection.exec('PRAGMA synchronous = FULL;');
    // 3. Set busy timeout to 8000ms so concurrent transactions wait rather than throwing SQLITE_BUSY
    connection.exec('PRAGMA busy_timeout = 8000;');
    // 4. Enforce relational Foreign Key integrity
    connection.exec('PRAGMA foreign_keys = ON;');
    // 5. Memory cache optimization (64MB)
    connection.exec('PRAGMA cache_size = -64000;');
    connection.exec('PRAGMA temp_store = MEMORY;');
    // 6. Automatic WAL Checkpoint threshold
    connection.exec('PRAGMA wal_autocheckpoint = 1000;');
  } catch (err: any) {
    console.error('[SQLite] Error configuring pragmas:', err.message);
  }
}

// Run pragmas immediately on initial connection
configurePragmas();

// ----------------------------------------------------
// Transaction Helper & Retry Logic
// ----------------------------------------------------

let transactionDepth = 0;

/**
 * Execute a series of operations in a strict SQLite atomic transaction.
 * Automatically rolls back on failure and commits on success.
 * Supports nested calls safely by joining outer transactions.
 */
export function dbTransaction<T>(operation: () => T): T {
  return withDbRetry(() => {
    if (transactionDepth > 0) {
      // Already running inside an active outer transaction
      return operation();
    }

    try {
      transactionDepth++;
      db.exec('BEGIN IMMEDIATE;');
      const result = operation();
      db.exec('COMMIT;');
      return result;
    } catch (error) {
      try {
        db.exec('ROLLBACK;');
      } catch (rollbackErr) {
        // Rollback might fail if transaction was already terminated
      }
      throw error;
    } finally {
      transactionDepth--;
    }
  });
}

/**
 * Executes a database operation with exponential backoff retry
 * to protect against transient locking under high concurrency.
 */
export function withDbRetry<T>(fn: () => T, maxRetries = 4, baseDelayMs = 25): T {
  let attempt = 0;
  while (true) {
    try {
      return fn();
    } catch (err: any) {
      attempt++;
      const isLockError = err?.message && (
        err.message.includes('busy') ||
        err.message.includes('locked') ||
        err.message.includes('SQLITE_BUSY') ||
        err.message.includes('SQLITE_LOCKED')
      );

      if (attempt >= maxRetries || !isLockError) {
        throw err;
      }

      // Synchronous spin-delay for node:sqlite
      const waitTime = baseDelayMs * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 15);
      const start = Date.now();
      while (Date.now() - start < waitTime) {
        // spin wait
      }
    }
  }
}

// ----------------------------------------------------
// Security & Authentication Helpers
// ----------------------------------------------------
export function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const effectiveSalt = salt || crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, effectiveSalt, 64);
  return {
    hash: derivedKey.toString('hex'),
    salt: effectiveSalt
  };
}

export function verifyPassword(password: string, storedHash: string, storedSalt: string): boolean {
  try {
    const { hash } = hashPassword(password, storedSalt);
    const bufferA = Buffer.from(hash, 'hex');
    const bufferB = Buffer.from(storedHash, 'hex');
    if (bufferA.length !== bufferB.length) return false;
    return crypto.timingSafeEqual(bufferA, bufferB);
  } catch (err) {
    return false;
  }
}

// ----------------------------------------------------
// Complete SQLite Schema Definition & Safe Migration Routine
// ----------------------------------------------------
export function initDatabase() {
  console.log('[SQLite Lifecycle] Initializing MediQ SQLite database engine...');
  
  // Step 1: Check if DB file exists and verify its integrity before executing schema
  if (fs.existsSync(DB_PATH)) {
    const integrity = verifyDatabaseIntegrity(db);
    if (!integrity.valid) {
      console.error(`
================================================================================
[CRITICAL ALERT] SQLite Database Corruption Detected in mediq.db!
Integrity Check Failures: ${integrity.issues.join('; ')}
Initiating Automatic Safe Recovery Pipeline...
================================================================================
      `);

      try {
        db.close();
      } catch (_) {}

      quarantineAndCleanDbFiles('Corrupted database detected on startup');

      const recovery = restoreFromVerifiedBackup();
      if (recovery.restored) {
        console.log(`[SQLite Recovery] Successfully recovered from verified backup: ${recovery.sourcePath}`);
        db = new DatabaseSync(DB_PATH);
        configurePragmas();
        executeSchemaCreation(false);
      } else {
        console.warn('[SQLite Recovery] No valid backup available. Initializing fresh database with default clinical data...');
        db = new DatabaseSync(DB_PATH);
        configurePragmas();
        executeSchemaCreation(true);
      }
    } else {
      console.log('[SQLite Integrity Check] mediq.db passed integrity verification (status: ok).');
      executeSchemaCreation(false);
    }
  } else {
    // Fresh database
    executeSchemaCreation(true);
  }

  // Step 2: Ensure a verified golden backup exists
  try {
    if (!fs.existsSync(GOLDEN_BACKUP_PATH)) {
      console.log('[SQLite Backup] Creating initial verified golden backup baseline...');
      dbBackup(undefined, true);
    }
  } catch (err: any) {
    console.warn('[SQLite Backup] Initial golden backup notice:', err.message);
  }
}

function executeSchemaCreation(forceSeed = false) {
  configurePragmas();

  // 1. Users Table (Doctor & Patient Auth Accounts)
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      role TEXT NOT NULL CHECK(role IN ('patient', 'doctor')),
      name TEXT NOT NULL,
      name_regional TEXT,
      phone TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // 2. Patient Profiles Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS patient_profiles (
      user_id TEXT PRIMARY KEY,
      patient_id TEXT UNIQUE NOT NULL,
      abha_id TEXT,
      age INTEGER,
      gender TEXT,
      village TEXT,
      allergies TEXT,
      medical_history TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // 3. Doctor Profiles Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS doctor_profiles (
      user_id TEXT PRIMARY KEY,
      medical_id TEXT UNIQUE NOT NULL,
      specialization TEXT NOT NULL,
      location TEXT NOT NULL,
      contact_number TEXT NOT NULL,
      room_number TEXT,
      available_status TEXT DEFAULT 'Online Now',
      consult_fee INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // 4. Auth Sessions Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS auth_sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // 5. Patients Table (Central Clinical EHR Patient Registry)
  db.exec(`
    CREATE TABLE IF NOT EXISTS patients (
      id TEXT PRIMARY KEY,
      abha_id TEXT,
      name TEXT NOT NULL,
      name_regional TEXT,
      age INTEGER NOT NULL,
      gender TEXT NOT NULL,
      village TEXT NOT NULL,
      contact_number TEXT NOT NULL,
      ration_card_no TEXT,
      blood_group TEXT,
      photo_url TEXT,
      thumbprint_id TEXT,
      emergency_contact_name TEXT,
      emergency_contact_phone TEXT,
      medical_history TEXT,
      allergies TEXT,
      registered_date TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // 6. Queue Tokens Table (Priority Triage Queue Management)
  db.exec(`
    CREATE TABLE IF NOT EXISTS queue_tokens (
      token_id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      patient_name TEXT NOT NULL,
      age INTEGER NOT NULL,
      gender TEXT NOT NULL,
      village TEXT NOT NULL,
      urgency TEXT NOT NULL,
      category TEXT NOT NULL,
      urgency_score INTEGER NOT NULL,
      symptoms_summary TEXT NOT NULL,
      status TEXT NOT NULL,
      assigned_doctor TEXT,
      assigned_room TEXT,
      estimated_wait_minutes INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      called_at TEXT,
      vitals_json TEXT,
      triage_result_id TEXT,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
    );
  `);

  // 7. Visits Table (Clinical Consultation Encounters)
  db.exec(`
    CREATE TABLE IF NOT EXISTS visits (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      patient_name TEXT NOT NULL,
      date TEXT NOT NULL,
      phc_name TEXT NOT NULL,
      symptoms_json TEXT,
      triage_category TEXT,
      vitals_json TEXT,
      doctor_name TEXT NOT NULL,
      doctor_specialty TEXT,
      diagnosis TEXT NOT NULL,
      diagnosis_hindi TEXT,
      clinical_notes TEXT,
      consult_mode TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
    );
  `);

  // 8. Prescriptions Table (Medications, Dosages & Follow-ups)
  db.exec(`
    CREATE TABLE IF NOT EXISTS prescriptions (
      id TEXT PRIMARY KEY,
      visit_id TEXT NOT NULL,
      patient_id TEXT NOT NULL,
      patient_name TEXT NOT NULL,
      doctor_name TEXT NOT NULL,
      diagnosis TEXT NOT NULL,
      diagnosis_hindi TEXT,
      medications_json TEXT NOT NULL,
      advice TEXT,
      follow_up_days INTEGER,
      date TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (visit_id) REFERENCES visits(id) ON DELETE CASCADE,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
    );
  `);

  // 9. Chronic Alerts Table (Non-Communicable Disease & High-Risk Management)
  db.exec(`
    CREATE TABLE IF NOT EXISTS chronic_alerts (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      patient_name TEXT,
      condition_name TEXT NOT NULL,
      condition_name_hindi TEXT,
      category TEXT,
      severity TEXT NOT NULL,
      diagnosed_date TEXT,
      last_checked_date TEXT,
      next_follow_up_date TEXT,
      next_follow_up_days INTEGER,
      primary_metric_json TEXT NOT NULL,
      clinical_alert TEXT NOT NULL,
      clinical_alert_hindi TEXT,
      action_required TEXT,
      action_required_hindi TEXT,
      teleconsult_action_required INTEGER DEFAULT 0,
      recommended_doctor_id TEXT,
      recommended_doctor_name TEXT,
      last_prescribed_medicine TEXT,
      lifestyle_guidance_json TEXT,
      red_flag_warning TEXT,
      active_medications_json TEXT,
      refill_due_days INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
    );
  `);

  // 10. Vitals History Table (Time-Series Vitals Logging)
  db.exec(`
    CREATE TABLE IF NOT EXISTS vitals_history (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      date TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      systolic_bp INTEGER,
      diastolic_bp INTEGER,
      blood_sugar_fasting INTEGER,
      blood_sugar_post_meal INTEGER,
      spo2 INTEGER,
      pulse_rate INTEGER,
      temperature REAL,
      weight_kg REAL,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
    );
  `);

  // 11. Video Call Requests Table (Real-Time Doctor Teleconsult Queue)
  db.exec(`
    CREATE TABLE IF NOT EXISTS video_call_requests (
      id TEXT PRIMARY KEY,
      token_id TEXT,
      patient_id TEXT NOT NULL,
      patient_name TEXT NOT NULL,
      patient_phone TEXT NOT NULL,
      age INTEGER,
      gender TEXT,
      village TEXT,
      symptoms_summary TEXT NOT NULL,
      urgency TEXT NOT NULL,
      vitals_json TEXT,
      status TEXT NOT NULL,
      rejection_reason TEXT,
      requested_at TEXT NOT NULL,
      accepted_by_doctor_json TEXT,
      session_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
    );
  `);

  // 12. Live Call Sessions Table (WebRTC Teleconsult Sessions)
  db.exec(`
    CREATE TABLE IF NOT EXISTS live_call_sessions (
      id TEXT PRIMARY KEY,
      token_id TEXT,
      patient_id TEXT NOT NULL,
      patient_name TEXT NOT NULL,
      patient_phone TEXT,
      doctor_id TEXT NOT NULL,
      doctor_name TEXT NOT NULL,
      doctor_specialty TEXT,
      doctor_hospital TEXT,
      status TEXT NOT NULL,
      started_at INTEGER,
      ended_at INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
    );
  `);

  // Alias call_sessions view/table if queried
  db.exec(`
    CREATE VIEW IF NOT EXISTS call_sessions AS SELECT * FROM live_call_sessions;
  `);

  // 13. PHC Clusters Table (Outbreak Surveillance & Health Trends)
  db.exec(`
    CREATE TABLE IF NOT EXISTS phc_clusters (
      phc_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      district TEXT NOT NULL,
      active_doctors INTEGER NOT NULL,
      current_queue_length INTEGER NOT NULL,
      emergency_count INTEGER NOT NULL,
      outbreak_risk TEXT NOT NULL,
      top_symptom TEXT NOT NULL,
      fever_trend_json TEXT NOT NULL,
      gastro_trend_json TEXT NOT NULL,
      respiratory_trend_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // ----------------------------------------------------
  // Performance Indexes (Fast reads for Queues, Doctors & Patients)
  // ----------------------------------------------------
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
    CREATE INDEX IF NOT EXISTS idx_patient_profiles_patient_id ON patient_profiles(patient_id);
    CREATE INDEX IF NOT EXISTS idx_doctor_profiles_medical_id ON doctor_profiles(medical_id);
    
    CREATE INDEX IF NOT EXISTS idx_patients_contact ON patients(contact_number);
    CREATE INDEX IF NOT EXISTS idx_patients_abha ON patients(abha_id);
    CREATE INDEX IF NOT EXISTS idx_patients_name ON patients(name);

    CREATE INDEX IF NOT EXISTS idx_queue_tokens_status ON queue_tokens(status);
    CREATE INDEX IF NOT EXISTS idx_queue_tokens_urgency ON queue_tokens(urgency);
    CREATE INDEX IF NOT EXISTS idx_queue_tokens_patient_id ON queue_tokens(patient_id);
    CREATE INDEX IF NOT EXISTS idx_queue_tokens_created_at ON queue_tokens(created_at);

    CREATE INDEX IF NOT EXISTS idx_visits_patient_id ON visits(patient_id);
    CREATE INDEX IF NOT EXISTS idx_visits_date ON visits(date);

    CREATE INDEX IF NOT EXISTS idx_prescriptions_patient_id ON prescriptions(patient_id);
    CREATE INDEX IF NOT EXISTS idx_prescriptions_visit_id ON prescriptions(visit_id);
    CREATE INDEX IF NOT EXISTS idx_prescriptions_date ON prescriptions(date);

    CREATE INDEX IF NOT EXISTS idx_chronic_alerts_patient_id ON chronic_alerts(patient_id);
    CREATE INDEX IF NOT EXISTS idx_chronic_alerts_severity ON chronic_alerts(severity);

    CREATE INDEX IF NOT EXISTS idx_vitals_history_patient_id ON vitals_history(patient_id);
    CREATE INDEX IF NOT EXISTS idx_vitals_history_timestamp ON vitals_history(timestamp);

    CREATE INDEX IF NOT EXISTS idx_video_call_requests_status ON video_call_requests(status);
    CREATE INDEX IF NOT EXISTS idx_video_call_requests_token_id ON video_call_requests(token_id);
    CREATE INDEX IF NOT EXISTS idx_video_call_requests_patient_id ON video_call_requests(patient_id);

    CREATE INDEX IF NOT EXISTS idx_live_call_sessions_status ON live_call_sessions(status);
    CREATE INDEX IF NOT EXISTS idx_live_call_sessions_token_id ON live_call_sessions(token_id);
    CREATE INDEX IF NOT EXISTS idx_live_call_sessions_patient_id ON live_call_sessions(patient_id);
    CREATE INDEX IF NOT EXISTS idx_live_call_sessions_doctor_id ON live_call_sessions(doctor_id);
  `);

  // Safe Migration: Add any missing updated_at or auxiliary columns if existing db is older
  ensureSchemaIntegrity();

  // Seed default clinical demo data if forced or if users table is empty
  if (forceSeed) {
    seedInitialDataIfEmpty();
  } else {
    try {
      const userCount = (db.prepare('SELECT COUNT(*) as count FROM users').get() as any)?.count || 0;
      if (userCount === 0) {
        seedInitialDataIfEmpty();
      }
    } catch (_) {
      seedInitialDataIfEmpty();
    }
  }
}

/**
 * Migration helper to ensure newly added columns exist in older database files
 */
function ensureSchemaIntegrity() {
  const addColumnIfNotExists = (tableName: string, colName: string, colDef: string) => {
    try {
      const cols = db.prepare(`PRAGMA table_info(${tableName})`).all() as any[];
      const exists = cols.some(c => c.name === colName);
      if (!exists) {
        db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${colName} ${colDef};`);
      }
    } catch (e) {
      // Ignore migration column check errors
    }
  };

  addColumnIfNotExists('users', 'updated_at', "TEXT NOT NULL DEFAULT (datetime('now'))");
  addColumnIfNotExists('patient_profiles', 'updated_at', "TEXT NOT NULL DEFAULT (datetime('now'))");
  addColumnIfNotExists('doctor_profiles', 'updated_at', "TEXT NOT NULL DEFAULT (datetime('now'))");
  addColumnIfNotExists('patients', 'updated_at', "TEXT NOT NULL DEFAULT (datetime('now'))");
  addColumnIfNotExists('queue_tokens', 'updated_at', "TEXT NOT NULL DEFAULT (datetime('now'))");
  addColumnIfNotExists('visits', 'updated_at', "TEXT NOT NULL DEFAULT (datetime('now'))");
  addColumnIfNotExists('prescriptions', 'updated_at', "TEXT NOT NULL DEFAULT (datetime('now'))");
  addColumnIfNotExists('chronic_alerts', 'patient_name', 'TEXT');
  addColumnIfNotExists('chronic_alerts', 'updated_at', "TEXT NOT NULL DEFAULT (datetime('now'))");
  addColumnIfNotExists('vitals_history', 'updated_at', "TEXT NOT NULL DEFAULT (datetime('now'))");
  addColumnIfNotExists('video_call_requests', 'updated_at', "TEXT NOT NULL DEFAULT (datetime('now'))");
  addColumnIfNotExists('live_call_sessions', 'updated_at', "TEXT NOT NULL DEFAULT (datetime('now'))");

  // Sync / Migrate Pre-Seeded Doctor Records to canonical IDs if necessary
  try {
    db.prepare(`
      UPDATE doctor_profiles 
      SET medical_id = 'MCI-UP-2018-84920' 
      WHERE medical_id = 'MCI-UP-84920' OR user_id = 'doc-suresh'
    `).run();

    db.prepare(`
      UPDATE doctor_profiles 
      SET medical_id = 'MCI-UP-2019-10294' 
      WHERE medical_id = 'MCI-UP-10294' OR user_id = 'doc-anita'
    `).run();

    db.prepare(`
      UPDATE doctor_profiles 
      SET medical_id = 'MCI-UP-2021-55102' 
      WHERE medical_id = 'MCI-UP-55102' OR user_id = 'doc-rajesh'
    `).run();

    // Clean out any legacy mock/dummy patient and token records
    db.exec(`
      DELETE FROM queue_tokens WHERE token_id IN ('EMG-001', 'MOD-014');
      DELETE FROM chronic_alerts WHERE id IN ('CA-01', 'CA-02');
      DELETE FROM vitals_history WHERE id IN ('vh-01', 'vh-02', 'vh-03');
      DELETE FROM prescriptions WHERE visit_id = 'vst-prev-84920';
      DELETE FROM visits WHERE id = 'vst-prev-84920';
      DELETE FROM patient_profiles WHERE patient_id IN ('PHC-UP-10293', 'PHC-UP-84920', 'PHC-UP-33102');
      DELETE FROM patients WHERE id IN ('PHC-UP-10293', 'PHC-UP-84920', 'PHC-UP-33102');
      DELETE FROM users WHERE role = 'patient' AND id IN ('usr-pat-sita-devi', 'usr-pat-phc-up-10293', 'usr-pat-phc-up-84920', 'usr-pat-phc-up-33102');
    `);
  } catch (syncErr) {
    // Non-fatal sync
  }
}

// ----------------------------------------------------
// Automated Database Backup System (Integrity-Verified & Golden Baseline)
// ----------------------------------------------------
export function dbBackup(
  customBackupDir?: string,
  isGolden = false
): { success: boolean; backupPath: string; timestamp: string; sizeBytes: number; error?: string } {
  try {
    // Step 1: Pre-check live database integrity BEFORE attempting any backup
    const liveIntegrity = verifyDatabaseIntegrity(db);
    if (!liveIntegrity.valid) {
      console.error(
        `[MediQ DB Backup ABORTED] Live database failed integrity check (${liveIntegrity.issues.join('; ')}). Backup aborted to prevent corruption propagation.`
      );
      return {
        success: false,
        backupPath: '',
        timestamp: new Date().toISOString(),
        sizeBytes: 0,
        error: `Database failed integrity check: ${liveIntegrity.issues.join(', ')}`
      };
    }

    const targetDir = customBackupDir || BACKUP_DIR;
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const randomSuffix = crypto.randomBytes(4).toString('hex');
    const tempBackupPath = path.join(targetDir, `temp_backup_${timestamp}_${randomSuffix}.db`);
    const finalBackupPath = path.join(targetDir, `mediq_backup_${timestamp}.db`);
    const latestFilePath = path.join(targetDir, 'mediq_backup_latest.db');

    // Remove temp file if already exists
    try {
      if (fs.existsSync(tempBackupPath)) fs.unlinkSync(tempBackupPath);
    } catch (_) {}

    // Step 2: Atomic Online Backup using SQLite VACUUM INTO
    try {
      db.exec('PRAGMA wal_checkpoint(PASSIVE);');
      db.exec(`VACUUM INTO '${tempBackupPath.replace(/'/g, "''")}';`);
    } catch (vacuumErr: any) {
      console.warn('[MediQ DB Backup] VACUUM INTO notice, using locked TRUNCATE checkpoint snapshot:', vacuumErr.message);
      db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
      fs.copyFileSync(DB_PATH, tempBackupPath);
    }

    // Step 3: Verify the newly generated backup file independently
    const tempCheck = verifyFileIntegrity(tempBackupPath);
    if (!tempCheck.valid) {
      try {
        if (fs.existsSync(tempBackupPath)) fs.unlinkSync(tempBackupPath);
      } catch (_) {}
      console.error(`[MediQ DB Backup ABORTED] Generated backup failed post-creation verification: ${tempCheck.issues.join('; ')}`);
      return {
        success: false,
        backupPath: '',
        timestamp: new Date().toISOString(),
        sizeBytes: 0,
        error: 'Newly created backup file failed integrity check'
      };
    }

    // Step 4: Finalize verified backup files
    fs.renameSync(tempBackupPath, finalBackupPath);
    fs.copyFileSync(finalBackupPath, latestFilePath);

    // Save or update permanent verified golden backup
    if (isGolden || !fs.existsSync(GOLDEN_BACKUP_PATH)) {
      fs.copyFileSync(finalBackupPath, GOLDEN_BACKUP_PATH);
      console.log(`[MediQ DB Backup] Verified Golden Baseline Backup secured at: ${GOLDEN_BACKUP_PATH}`);
    }

    const stats = fs.statSync(finalBackupPath);
    console.log(`[MediQ DB Backup] Created verified persistent backup at: ${finalBackupPath} (${stats.size} bytes)`);

    // Maintain max 10 recent timestamped backups (never prunes golden backup)
    pruneOldBackups(targetDir, 10);

    return {
      success: true,
      backupPath: finalBackupPath,
      timestamp,
      sizeBytes: stats.size
    };
  } catch (err: any) {
    console.error('[MediQ DB Backup] Backup creation failed:', err);
    return {
      success: false,
      backupPath: '',
      timestamp: new Date().toISOString(),
      sizeBytes: 0,
      error: err.message
    };
  }
}

function pruneOldBackups(dir: string, keepCount: number) {
  try {
    // Preserve golden backup and latest pointer
    const files = fs.readdirSync(dir)
      .filter(f => f.startsWith('mediq_backup_') && f.endsWith('.db') && f !== 'mediq_backup_latest.db' && f !== GOLDEN_BACKUP_NAME)
      .map(f => ({ name: f, time: fs.statSync(path.join(dir, f)).mtime.getTime() }))
      .sort((a, b) => b.time - a.time);

    if (files.length > keepCount) {
      for (const extra of files.slice(keepCount)) {
        try {
          fs.unlinkSync(path.join(dir, extra.name));
        } catch (_) {}
      }
    }
  } catch (e) {
    console.warn('[MediQ DB Backup] Pruning notice:', e);
  }
}

// Setup periodic automatic backup (runs every 6 hours)
let backupIntervalTimer: NodeJS.Timeout | null = null;
export function startPeriodicBackup(intervalHours = 6) {
  if (backupIntervalTimer) return;

  const ms = intervalHours * 60 * 60 * 1000;
  backupIntervalTimer = setInterval(() => {
    dbBackup();
  }, ms);
}

// ----------------------------------------------------
// Graceful Process Termination & WAL Clean Flush
// ----------------------------------------------------
let isShuttingDown = false;
export function closeDatabaseGracefully(signalName = 'MANUAL') {
  if (isShuttingDown) return;
  isShuttingDown = true;

  try {
    if (backupIntervalTimer) {
      clearInterval(backupIntervalTimer);
      backupIntervalTimer = null;
    }

    console.log(`[SQLite Shutdown] Flushing WAL buffers and optimizing database before exit (Signal: ${signalName})...`);
    try {
      db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
      db.exec('PRAGMA optimize;');
    } catch (_) {}

    try {
      db.close();
    } catch (_) {}

    console.log('[SQLite Shutdown] Database cleanly closed with zero dirty state.');
  } catch (err: any) {
    console.error('[SQLite Shutdown] Error during graceful database close:', err.message);
  }
}

// Attach process signals to prevent abrupt uncommitted WAL corruption
process.on('SIGINT', () => {
  closeDatabaseGracefully('SIGINT');
  process.exit(0);
});

process.on('SIGTERM', () => {
  closeDatabaseGracefully('SIGTERM');
  process.exit(0);
});

process.on('beforeExit', () => {
  closeDatabaseGracefully('beforeExit');
});

// ----------------------------------------------------
// Data Helpers (Ensuring Foreign Key Consistency & Transactions)
// ----------------------------------------------------

// Helper: Ensure Patient Record Exists Before Linked Insertions
export function ensurePatientExists(patient: {
  id: string;
  name?: string;
  phone?: string;
  age?: number;
  gender?: string;
  village?: string;
  abhaId?: string;
}) {
  const existing = db.prepare('SELECT id FROM patients WHERE id = ?').get(patient.id);
  if (!existing) {
    dbInsertPatient({
      id: patient.id,
      abhaId: patient.abhaId || `91-${Math.floor(1000 + Math.random() * 9000)}-${Math.floor(1000 + Math.random() * 9000)}-${Math.floor(1000 + Math.random() * 9000)}`,
      name: patient.name || 'Patient',
      age: patient.age || 35,
      gender: patient.gender || 'Other',
      village: patient.village || 'Rural Sub-Center',
      contactNumber: patient.phone || '+91 9800000000',
      medicalHistory: [],
      allergies: [],
      registeredDate: new Date().toISOString().split('T')[0]
    });
  }
}

// 1. Patients
export function dbGetPatientByIdOrPhone(identifier: string) {
  const clean = identifier.trim();
  const stmt = db.prepare(`
    SELECT * FROM patients
    WHERE id = ? OR abha_id = ? OR contact_number = ? OR contact_number LIKE ?
    LIMIT 1
  `);
  return stmt.get(clean, clean, clean, `%${clean.slice(-10)}%`) as any | undefined;
}

export function dbGetAllPatients() {
  return db.prepare('SELECT * FROM patients ORDER BY registered_date DESC, created_at DESC').all() as any[];
}

export function dbSearchPatients(q: string) {
  const pattern = `%${q.trim()}%`;
  return db.prepare(`
    SELECT * FROM patients
    WHERE name LIKE ? OR name_regional LIKE ? OR contact_number LIKE ? OR id LIKE ? OR abha_id LIKE ? OR village LIKE ?
    LIMIT 25
  `).all(pattern, pattern, pattern, pattern, pattern, pattern) as any[];
}

export function dbInsertPatient(patient: {
  id: string;
  abhaId?: string;
  name: string;
  nameRegional?: string;
  age: number;
  gender: string;
  village: string;
  contactNumber: string;
  rationCardNo?: string;
  bloodGroup?: string;
  photoUrl?: string;
  thumbprintId?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  medicalHistory?: string[];
  allergies?: string[];
  registeredDate: string;
}) {
  return withDbRetry(() => {
    db.prepare(`
      INSERT INTO patients (
        id, abha_id, name, name_regional, age, gender, village, contact_number,
        ration_card_no, blood_group, photo_url, thumbprint_id,
        emergency_contact_name, emergency_contact_phone, medical_history, allergies, registered_date, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        name_regional = excluded.name_regional,
        age = excluded.age,
        gender = excluded.gender,
        village = excluded.village,
        contact_number = excluded.contact_number,
        medical_history = excluded.medical_history,
        allergies = excluded.allergies,
        updated_at = datetime('now')
    `).run(
      patient.id,
      patient.abhaId || null,
      patient.name,
      patient.nameRegional || null,
      patient.age,
      patient.gender,
      patient.village,
      patient.contactNumber,
      patient.rationCardNo || null,
      patient.bloodGroup || null,
      patient.photoUrl || null,
      patient.thumbprintId || null,
      patient.emergencyContactName || null,
      patient.emergencyContactPhone || null,
      patient.medicalHistory ? JSON.stringify(patient.medicalHistory) : '[]',
      patient.allergies ? JSON.stringify(patient.allergies) : '[]',
      patient.registeredDate
    );
  });
}

// 2. Queue Tokens
export function dbGetQueueTokens() {
  return db.prepare('SELECT * FROM queue_tokens ORDER BY created_at DESC').all() as any[];
}

export function dbGetNextSequentialTokenId(urgencyOrPrefix: string): string {
  let prefix = 'MOD';
  const clean = (urgencyOrPrefix || '').toUpperCase();
  if (clean === 'EMERGENCY' || clean === 'EMG') {
    prefix = 'EMG';
  } else if (clean === 'MODERATE' || clean === 'MOD') {
    prefix = 'MOD';
  } else if (clean === 'MINOR' || clean === 'MIN') {
    prefix = 'MIN';
  } else if (/^[A-Z]{3}$/.test(clean)) {
    prefix = clean;
  }

  const existing = db.prepare("SELECT token_id FROM queue_tokens WHERE token_id LIKE ?").all(`${prefix}-%`) as any[];
  let maxNum = 0;
  const regex = new RegExp(`^${prefix}-(\\d+)$`, 'i');

  for (const row of existing) {
    const rawId = row.token_id || '';
    const match = rawId.match(regex);
    if (match && match[1]) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > maxNum) {
        maxNum = num;
      }
    }
  }

  const nextNum = maxNum + 1;
  const numStr = String(nextNum).padStart(3, '0');
  return `${prefix}-${numStr}`;
}

export function dbGetQueueTokenById(tokenId: string) {
  return db.prepare('SELECT * FROM queue_tokens WHERE token_id = ?').get(tokenId) as any | undefined;
}

export function dbInsertQueueToken(token: {
  tokenId: string;
  patientId: string;
  patientName: string;
  age: number;
  gender: string;
  village: string;
  urgency: string;
  category: string;
  urgencyScore: number;
  symptomsSummary: string;
  status: string;
  assignedDoctor?: string;
  assignedRoom?: string;
  estimatedWaitMinutes: number;
  createdAt?: string;
  vitals?: any;
  triageResultId?: string;
}) {
  return dbTransaction(() => {
    // Ensure parent patient exists for FK
    ensurePatientExists({
      id: token.patientId,
      name: token.patientName,
      age: token.age,
      gender: token.gender,
      village: token.village
    });

    db.prepare(`
      INSERT INTO queue_tokens (
        token_id, patient_id, patient_name, age, gender, village, urgency, category,
        urgency_score, symptoms_summary, status, assigned_doctor, assigned_room,
        estimated_wait_minutes, created_at, updated_at, vitals_json, triage_result_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?)
      ON CONFLICT(token_id) DO UPDATE SET
        status = excluded.status,
        assigned_doctor = excluded.assigned_doctor,
        assigned_room = excluded.assigned_room,
        updated_at = datetime('now')
    `).run(
      token.tokenId,
      token.patientId,
      token.patientName,
      token.age,
      token.gender,
      token.village,
      token.urgency,
      token.category,
      token.urgencyScore,
      token.symptomsSummary,
      token.status,
      token.assignedDoctor || null,
      token.assignedRoom || null,
      token.estimatedWaitMinutes,
      token.createdAt || new Date().toISOString(),
      token.vitals ? JSON.stringify(token.vitals) : null,
      token.triageResultId || null
    );
  });
}

export function dbUpdateQueueTokenStatus(tokenId: string, status: string, assignedDoctor?: string, assignedRoom?: string) {
  return withDbRetry(() => {
    if (assignedDoctor || assignedRoom) {
      db.prepare(`
        UPDATE queue_tokens
        SET status = ?, assigned_doctor = COALESCE(?, assigned_doctor), assigned_room = COALESCE(?, assigned_room),
            called_at = datetime('now'), updated_at = datetime('now')
        WHERE token_id = ?
      `).run(status, assignedDoctor || null, assignedRoom || null, tokenId);
    } else {
      db.prepare("UPDATE queue_tokens SET status = ?, updated_at = datetime('now') WHERE token_id = ?").run(status, tokenId);
    }
  });
}

// 3. Visits & Prescriptions
export function dbGetVisitsForPatient(patientId: string | string[]) {
  const ids = Array.isArray(patientId) ? patientId.filter(Boolean) : [patientId].filter(Boolean);
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(',');
  const visits = db.prepare(`SELECT * FROM visits WHERE patient_id IN (${placeholders}) ORDER BY date DESC, created_at DESC`).all(...ids) as any[];
  return visits.map(v => {
    const rx = db.prepare('SELECT * FROM prescriptions WHERE visit_id = ?').get(v.id) as any | undefined;
    return {
      id: v.id,
      patientId: v.patient_id,
      patientName: v.patient_name,
      date: v.date,
      phcName: v.phc_name,
      symptoms: v.symptoms_json ? JSON.parse(v.symptoms_json) : [],
      triageCategory: v.triage_category,
      vitals: v.vitals_json ? JSON.parse(v.vitals_json) : undefined,
      doctorName: v.doctor_name,
      doctorSpecialty: v.doctor_specialty,
      diagnosis: v.diagnosis,
      diagnosisHindi: v.diagnosis_hindi,
      clinicalNotes: v.clinical_notes,
      consultMode: v.consult_mode,
      prescription: rx ? {
        id: rx.id,
        visitId: rx.visit_id,
        patientId: rx.patient_id,
        patientName: rx.patient_name,
        doctorName: rx.doctor_name,
        diagnosis: rx.diagnosis,
        diagnosisHindi: rx.diagnosis_hindi,
        medications: rx.medications_json ? JSON.parse(rx.medications_json) : [],
        advice: rx.advice,
        followUpDays: rx.follow_up_days,
        date: rx.date
      } : undefined
    };
  });
}

export function dbInsertVisit(visit: any) {
  return dbTransaction(() => {
    // Ensure parent patient exists for FK
    ensurePatientExists({
      id: visit.patientId,
      name: visit.patientName
    });

    db.prepare(`
      INSERT INTO visits (
        id, patient_id, patient_name, date, phc_name, symptoms_json,
        triage_category, vitals_json, doctor_name, doctor_specialty,
        diagnosis, diagnosis_hindi, clinical_notes, consult_mode, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        diagnosis = excluded.diagnosis,
        clinical_notes = excluded.clinical_notes,
        updated_at = datetime('now')
    `).run(
      visit.id,
      visit.patientId,
      visit.patientName,
      visit.date,
      visit.phcName || 'Primary Health Centre',
      visit.symptoms ? JSON.stringify(visit.symptoms) : '[]',
      visit.triageCategory || 'GREEN',
      visit.vitals ? JSON.stringify(visit.vitals) : null,
      visit.doctorName,
      visit.doctorSpecialty || null,
      visit.diagnosis,
      visit.diagnosisHindi || null,
      visit.clinicalNotes || null,
      visit.consultMode || 'In-Person'
    );

    if (visit.prescription) {
      db.prepare(`
        INSERT INTO prescriptions (
          id, visit_id, patient_id, patient_name, doctor_name, diagnosis,
          diagnosis_hindi, medications_json, advice, follow_up_days, date, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(id) DO UPDATE SET
          medications_json = excluded.medications_json,
          advice = excluded.advice,
          updated_at = datetime('now')
      `).run(
        visit.prescription.id,
        visit.id,
        visit.prescription.patientId || visit.patientId,
        visit.prescription.patientName || visit.patientName,
        visit.prescription.doctorName || visit.doctorName,
        visit.prescription.diagnosis || visit.diagnosis,
        visit.prescription.diagnosisHindi || null,
        JSON.stringify(visit.prescription.medications || []),
        visit.prescription.advice || null,
        visit.prescription.followUpDays || 7,
        visit.prescription.date || visit.date
      );
    }
  });
}

export function dbGetPrescriptionsForPatient(identifier: string) {
  const clean = identifier.trim();
  const rows = db.prepare(`
    SELECT * FROM prescriptions
    WHERE patient_id = ? OR patient_name LIKE ?
    ORDER BY date DESC, created_at DESC
  `).all(clean, `%${clean}%`) as any[];

  return rows.map(rx => ({
    id: rx.id,
    visitId: rx.visit_id,
    patientId: rx.patient_id,
    patientName: rx.patient_name,
    doctorName: rx.doctor_name,
    diagnosis: rx.diagnosis,
    diagnosisHindi: rx.diagnosis_hindi,
    medications: rx.medications_json ? JSON.parse(rx.medications_json) : [],
    advice: rx.advice,
    followUpDays: rx.follow_up_days,
    date: rx.date
  }));
}

export function dbGetPrescriptionById(rxId: string) {
  const rx = db.prepare('SELECT * FROM prescriptions WHERE id = ?').get(rxId) as any | undefined;
  if (!rx) return null;
  return {
    id: rx.id,
    visitId: rx.visit_id,
    patientId: rx.patient_id,
    patientName: rx.patient_name,
    doctorName: rx.doctor_name,
    diagnosis: rx.diagnosis,
    diagnosisHindi: rx.diagnosis_hindi,
    medications: rx.medications_json ? JSON.parse(rx.medications_json) : [],
    advice: rx.advice,
    followUpDays: rx.follow_up_days,
    date: rx.date
  };
}

// 4. Vitals History
export function dbGetVitalsForPatient(patientId: string) {
  return db.prepare('SELECT * FROM vitals_history WHERE patient_id = ? ORDER BY timestamp DESC').all(patientId) as any[];
}

export function dbInsertVitalLog(log: any) {
  return withDbRetry(() => {
    ensurePatientExists({ id: log.patientId });

    db.prepare(`
      INSERT INTO vitals_history (
        id, patient_id, date, timestamp, systolic_bp, diastolic_bp,
        blood_sugar_fasting, blood_sugar_post_meal, spo2, pulse_rate, temperature, weight_kg, notes, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      log.id,
      log.patientId,
      log.date,
      log.timestamp,
      log.systolicBP || null,
      log.diastolicBP || null,
      log.bloodSugarFasting || null,
      log.bloodSugarPostMeal || null,
      log.spO2 || null,
      log.pulseRate || null,
      log.temperature || null,
      log.weightKg || null,
      log.notes || null
    );
  });
}

// 5. Video Call Requests Persistence
export function dbGetVideoCallRequests() {
  const rows = db.prepare('SELECT * FROM video_call_requests ORDER BY requested_at DESC, created_at DESC').all() as any[];
  return rows.map(r => ({
    id: r.id,
    tokenId: r.token_id,
    patientId: r.patient_id,
    patientName: r.patient_name,
    patientPhone: r.patient_phone,
    age: r.age,
    gender: r.gender,
    village: r.village,
    symptomsSummary: r.symptoms_summary,
    urgency: r.urgency,
    vitals: r.vitals_json ? JSON.parse(r.vitals_json) : undefined,
    status: r.status,
    rejectionReason: r.rejection_reason,
    requestedAt: r.requested_at,
    acceptedByDoctor: r.accepted_by_doctor_json ? JSON.parse(r.accepted_by_doctor_json) : undefined,
    sessionId: r.session_id
  }));
}

export function dbGetVideoCallRequestById(id: string) {
  const r = db.prepare('SELECT * FROM video_call_requests WHERE id = ?').get(id) as any | undefined;
  if (!r) return null;
  return {
    id: r.id,
    tokenId: r.token_id,
    patientId: r.patient_id,
    patientName: r.patient_name,
    patientPhone: r.patient_phone,
    age: r.age,
    gender: r.gender,
    village: r.village,
    symptomsSummary: r.symptoms_summary,
    urgency: r.urgency,
    vitals: r.vitals_json ? JSON.parse(r.vitals_json) : undefined,
    status: r.status,
    rejectionReason: r.rejection_reason,
    requestedAt: r.requested_at,
    acceptedByDoctor: r.accepted_by_doctor_json ? JSON.parse(r.accepted_by_doctor_json) : undefined,
    sessionId: r.session_id
  };
}

export function dbInsertVideoCallRequest(req: any) {
  return withDbRetry(() => {
    ensurePatientExists({
      id: req.patientId,
      name: req.patientName,
      phone: req.patientPhone,
      age: req.age,
      gender: req.gender,
      village: req.village
    });

    db.prepare(`
      INSERT INTO video_call_requests (
        id, token_id, patient_id, patient_name, patient_phone, age, gender,
        village, symptoms_summary, urgency, vitals_json, status, rejection_reason,
        requested_at, accepted_by_doctor_json, session_id, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        rejection_reason = excluded.rejection_reason,
        accepted_by_doctor_json = excluded.accepted_by_doctor_json,
        session_id = excluded.session_id,
        updated_at = datetime('now')
    `).run(
      req.id,
      req.tokenId || null,
      req.patientId,
      req.patientName,
      req.patientPhone,
      req.age || null,
      req.gender || null,
      req.village || null,
      req.symptomsSummary,
      req.urgency,
      req.vitals ? JSON.stringify(req.vitals) : null,
      req.status,
      req.rejectionReason || null,
      req.requestedAt,
      req.acceptedByDoctor ? JSON.stringify(req.acceptedByDoctor) : null,
      req.sessionId || null
    );
  });
}

export function dbUpdateVideoCallRequest(req: any) {
  return withDbRetry(() => {
    db.prepare(`
      UPDATE video_call_requests
      SET status = ?, rejection_reason = ?, accepted_by_doctor_json = ?, session_id = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      req.status,
      req.rejectionReason || null,
      req.acceptedByDoctor ? JSON.stringify(req.acceptedByDoctor) : null,
      req.sessionId || null,
      req.id
    );
  });
}

// 6. Live Call Sessions Persistence
export function dbGetLiveCallSessions() {
  const rows = db.prepare('SELECT * FROM live_call_sessions ORDER BY created_at DESC').all() as any[];
  return rows.map(r => ({
    id: r.id,
    tokenId: r.token_id,
    patientId: r.patient_id,
    patientName: r.patient_name,
    patientPhone: r.patient_phone,
    doctorId: r.doctor_id,
    doctorName: r.doctor_name,
    doctorSpecialty: r.doctor_specialty,
    doctorHospital: r.doctor_hospital,
    status: r.status,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    createdAt: r.created_at
  }));
}

export function dbGetLiveCallSessionById(sessionId: string) {
  const r = db.prepare('SELECT * FROM live_call_sessions WHERE id = ?').get(sessionId) as any | undefined;
  if (!r) return null;
  return {
    id: r.id,
    tokenId: r.token_id,
    patientId: r.patient_id,
    patientName: r.patient_name,
    patientPhone: r.patient_phone,
    doctorId: r.doctor_id,
    doctorName: r.doctor_name,
    doctorSpecialty: r.doctor_specialty,
    doctorHospital: r.doctor_hospital,
    status: r.status,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    createdAt: r.created_at
  };
}

export function dbInsertLiveCallSession(s: any) {
  return withDbRetry(() => {
    ensurePatientExists({
      id: s.patientId,
      name: s.patientName,
      phone: s.patientPhone
    });

    db.prepare(`
      INSERT INTO live_call_sessions (
        id, token_id, patient_id, patient_name, patient_phone,
        doctor_id, doctor_name, doctor_specialty, doctor_hospital,
        status, started_at, ended_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        started_at = excluded.started_at,
        ended_at = excluded.ended_at,
        updated_at = datetime('now')
    `).run(
      s.id,
      s.tokenId || null,
      s.patientId,
      s.patientName,
      s.patientPhone || null,
      s.doctorId,
      s.doctorName,
      s.doctorSpecialty || null,
      s.doctorHospital || null,
      s.status,
      s.startedAt || null,
      s.endedAt || null,
      s.createdAt || new Date().toISOString()
    );
  });
}

export function dbUpdateLiveCallSession(s: any) {
  return withDbRetry(() => {
    db.prepare(`
      UPDATE live_call_sessions
      SET status = ?, started_at = ?, ended_at = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(s.status, s.startedAt || null, s.endedAt || null, s.id);
  });
}

// 7. Doctor Directory
export function dbGetDoctorDirectory(): DoctorProfile[] {
  const doctors = db.prepare(`
    SELECT u.id, u.name, u.name_regional, u.phone,
           d.medical_id, d.specialization, d.location, d.room_number,
           d.available_status, d.consult_fee
    FROM users u
    JOIN doctor_profiles d ON u.id = d.user_id
    WHERE u.role = 'doctor'
  `).all() as any[];

  return doctors.map(d => {
    let specCat: DoctorProfile['doctorSpecialtyCategory'] = 'General Medicine';
    const specLower = (d.specialization || '').toLowerCase();
    if (specLower.includes('emergency') || specLower.includes('trauma')) specCat = 'Emergency Medicine';
    else if (specLower.includes('pediatric') || specLower.includes('child')) specCat = 'Pediatrics';
    else if (specLower.includes('pulmon') || specLower.includes('chest') || specLower.includes('respiratory')) specCat = 'Pulmonology';
    else if (specLower.includes('gastro') || specLower.includes('abdominal')) specCat = 'Gastroenterology';
    else if (specLower.includes('gynec') || specLower.includes('matern') || specLower.includes('obstet')) specCat = 'Gynecology';
    else if (specLower.includes('ortho') || specLower.includes('joint')) specCat = 'Orthopedics';

    const availStatus: DoctorProfile['availableStatus'] = 
      d.available_status === 'In Clinic' ? 'In Clinic' :
      d.available_status === 'On Call' ? 'On Call' : 'Online Now';

    return {
      id: d.id,
      name: d.name,
      nameRegional: d.name_regional || d.name,
      phone: d.phone,
      doctorSpecialty: d.specialization,
      doctorSpecialtyCategory: specCat,
      doctorHospital: d.location,
      locationArea: d.location,
      distanceKm: 0.8,
      availableStatus: availStatus,
      experienceYears: 10,
      rating: 4.9,
      consultationFee: d.consult_fee === 0 ? 'Free (Ayushman Bharat / NHM)' : `₹${d.consult_fee}`,
      roomNumber: d.room_number || 'Teleconsult Booth 1',
      avatarEmoji: '👨‍⚕️'
    };
  });
}

// 8. PHC Clusters
export function dbGetPHCClusters() {
  const rows = db.prepare('SELECT * FROM phc_clusters').all() as any[];
  return rows.map(r => ({
    phcId: r.phc_id,
    name: r.name,
    district: r.district,
    activeDoctors: r.active_doctors,
    currentQueueLength: r.current_queue_length,
    emergencyCount: r.emergency_count,
    outbreakRisk: r.outbreak_risk,
    topSymptom: r.top_symptom,
    feverTrend: r.fever_trend_json ? JSON.parse(r.fever_trend_json) : [],
    gastroTrend: r.gastro_trend_json ? JSON.parse(r.gastro_trend_json) : [],
    respiratoryTrend: r.respiratory_trend_json ? JSON.parse(r.respiratory_trend_json) : []
  }));
}

// 9. Chronic Condition Alerts
export function dbGetChronicAlertsForPatient(patientId?: string) {
  let rows: any[];
  if (patientId) {
    rows = db.prepare('SELECT * FROM chronic_alerts WHERE patient_id = ?').all(patientId) as any[];
    if (rows.length === 0) {
      rows = db.prepare('SELECT * FROM chronic_alerts LIMIT 5').all() as any[];
    }
  } else {
    rows = db.prepare('SELECT * FROM chronic_alerts').all() as any[];
  }

  return rows.map(r => ({
    id: r.id,
    patientId: r.patient_id,
    patientName: r.patient_name || 'Patient',
    conditionName: r.condition_name,
    conditionNameHindi: r.condition_name_hindi,
    severity: r.severity,
    primaryMetric: r.primary_metric_json ? JSON.parse(r.primary_metric_json) : {},
    lastCheckedDate: r.last_checked_date,
    nextFollowUpDays: r.next_follow_up_days,
    clinicalAlert: r.clinical_alert,
    teleconsultActionRequired: Boolean(r.teleconsult_action_required),
    recommendedDoctorId: r.recommended_doctor_id,
    recommendedDoctorName: r.recommended_doctor_name,
    lastPrescribedMedicine: r.last_prescribed_medicine
  }));
}

// ----------------------------------------------------
// Initial Seed Data (Populates default demo records if tables are empty)
// ----------------------------------------------------
function seedInitialDataIfEmpty() {
  dbTransaction(() => {
    // 1. Doctors Seeding
    const doctorCount = (db.prepare('SELECT COUNT(*) as count FROM doctor_profiles').get() as any).count;
    if (doctorCount === 0) {
      console.log('[SQLite] Seeding default clinical doctor profiles...');
      const defaultDoctors = [
        {
          id: 'doc-suresh',
          name: 'Dr. Suresh Verma',
          nameRegional: 'डॉ. सुरेश वर्मा',
          phone: '9876543210',
          password: 'password123',
          medicalId: 'MCI-UP-2018-84920',
          specialization: 'General Medicine & Family Practice',
          location: 'Rampur Primary Health Centre',
          roomNumber: 'Teleconsult Booth 1',
          availableStatus: 'Online Now',
          consultFee: 0
        },
        {
          id: 'doc-anita',
          name: 'Dr. Anita Roy',
          nameRegional: 'डॉ. अनीता रॉय',
          phone: '9876543211',
          password: 'password123',
          medicalId: 'MCI-UP-2019-10294',
          specialization: 'Emergency Medicine & Critical Triage',
          location: 'Sitapur District Hospital Tele-Hub',
          roomNumber: 'Emergency Trauma Bay',
          availableStatus: 'Online Now',
          consultFee: 0
        },
        {
          id: 'doc-rajesh',
          name: 'Dr. Rajesh Khanna',
          nameRegional: 'डॉ. राजेश खन्ना',
          phone: '9876543212',
          password: 'password123',
          medicalId: 'MCI-UP-2021-55102',
          specialization: 'Pediatrics & Child Health',
          location: 'Block Health Centre, Kheri',
          roomNumber: 'Pediatric Teleconsult Room',
          availableStatus: 'Online Now',
          consultFee: 0
        }
      ];

      for (const doc of defaultDoctors) {
        const { hash, salt } = hashPassword(doc.password);
        db.prepare(`
          INSERT OR REPLACE INTO users (id, role, name, name_regional, phone, password_hash, password_salt, created_at)
          VALUES (?, 'doctor', ?, ?, ?, ?, ?, datetime('now'))
        `).run(doc.id, doc.name, doc.nameRegional, doc.phone, hash, salt);

        db.prepare(`
          INSERT OR REPLACE INTO doctor_profiles (user_id, medical_id, specialization, location, contact_number, room_number, available_status, consult_fee)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(doc.id, doc.medicalId, doc.specialization, doc.location, doc.phone, doc.roomNumber, doc.availableStatus, doc.consultFee);
      }
    }

    // 2. PHC Clusters
    const clusterCount = (db.prepare('SELECT COUNT(*) as count FROM phc_clusters').get() as any).count;
    if (clusterCount === 0) {
      const defaultClusters = [
        {
          phcId: 'phc-rampur',
          name: 'Rampur Primary Health Centre',
          district: 'Sitapur District, Uttar Pradesh',
          activeDoctors: 3,
          currentQueueLength: 0,
          emergencyCount: 0,
          outbreakRisk: 'NORMAL',
          topSymptom: 'Routine Consultations',
          feverTrend: [
            { day: 'Mon', cases: 2, baseline: 5 },
            { day: 'Tue', cases: 3, baseline: 5 },
            { day: 'Wed', cases: 4, baseline: 6 },
            { day: 'Thu', cases: 3, baseline: 6 },
            { day: 'Fri', cases: 4, baseline: 7 },
            { day: 'Sat', cases: 5, baseline: 7 },
            { day: 'Sun', cases: 3, baseline: 7 }
          ],
          gastroTrend: [
            { day: 'Mon', cases: 1, baseline: 4 },
            { day: 'Tue', cases: 2, baseline: 4 },
            { day: 'Wed', cases: 1, baseline: 4 },
            { day: 'Thu', cases: 2, baseline: 4 },
            { day: 'Fri', cases: 2, baseline: 4 },
            { day: 'Sat', cases: 3, baseline: 4 },
            { day: 'Sun', cases: 1, baseline: 4 }
          ],
          respiratoryTrend: [
            { day: 'Mon', cases: 2, baseline: 8 },
            { day: 'Tue', cases: 3, baseline: 8 },
            { day: 'Wed', cases: 4, baseline: 9 },
            { day: 'Thu', cases: 3, baseline: 9 },
            { day: 'Fri', cases: 4, baseline: 9 },
            { day: 'Sat', cases: 5, baseline: 10 },
            { day: 'Sun', cases: 4, baseline: 10 }
          ]
        }
      ];

      for (const c of defaultClusters) {
        db.prepare(`
          INSERT INTO phc_clusters (
            phc_id, name, district, active_doctors, current_queue_length, emergency_count,
            outbreak_risk, top_symptom, fever_trend_json, gastro_trend_json, respiratory_trend_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          c.phcId,
          c.name,
          c.district,
          c.activeDoctors,
          c.currentQueueLength,
          c.emergencyCount,
          c.outbreakRisk,
          c.topSymptom,
          JSON.stringify(c.feverTrend),
          JSON.stringify(c.gastroTrend),
          JSON.stringify(c.respiratoryTrend)
        );
      }
    }
  });

  console.log('[SQLite] Initial production dataset seeded successfully (doctors only).');
}

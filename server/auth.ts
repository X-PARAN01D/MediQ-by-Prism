import { db, hashPassword, verifyPassword } from './db';
import crypto from 'node:crypto';
import { Request, Response, NextFunction } from 'express';

// Extend Express Request to carry authenticated user context
declare global {
  namespace Express {
    interface Request {
      user?: UserResponse;
      authToken?: string;
    }
  }
}

export interface UserRow {
  id: string;
  role: 'patient' | 'doctor';
  name: string;
  name_regional?: string;
  phone: string;
  password_hash: string;
  password_salt: string;
  created_at: string;
}

export interface PatientProfileRow {
  user_id: string;
  patient_id: string;
  abha_id?: string;
  age?: number;
  gender?: string;
  village?: string;
  allergies?: string;
  medical_history?: string;
}

export interface DoctorProfileRow {
  user_id: string;
  medical_id: string;
  specialization: string;
  location: string;
  contact_number: string;
  room_number?: string;
  available_status?: string;
  consult_fee?: number;
}

export interface UserResponse {
  id: string;
  name: string;
  nameRegional?: string;
  phone: string;
  role: 'patient' | 'doctor';
  patientId?: string;
  abhaId?: string;
  age?: number;
  gender?: 'Male' | 'Female' | 'Other';
  village?: string;
  medicalId?: string;
  doctorSpecialty?: string;
  doctorHospital?: string;
  contactNumber?: string;
}

// Convert DB rows into clean AppUser response
export function formatUserResponse(userRow: UserRow): UserResponse {
  if (userRow.role === 'patient') {
    const profile = db.prepare('SELECT * FROM patient_profiles WHERE user_id = ?').get(userRow.id) as unknown as PatientProfileRow | undefined;
    return {
      id: userRow.id,
      name: userRow.name,
      nameRegional: userRow.name_regional || undefined,
      phone: userRow.phone,
      role: 'patient',
      patientId: profile?.patient_id || undefined,
      abhaId: profile?.abha_id || undefined,
      age: profile?.age || undefined,
      gender: (profile?.gender as any) || undefined,
      village: profile?.village || undefined
    };
  } else {
    const profile = db.prepare('SELECT * FROM doctor_profiles WHERE user_id = ?').get(userRow.id) as unknown as DoctorProfileRow | undefined;
    return {
      id: userRow.id,
      name: userRow.name,
      nameRegional: userRow.name_regional || undefined,
      phone: userRow.phone,
      role: 'doctor',
      medicalId: profile?.medical_id || undefined,
      doctorSpecialty: profile?.specialization || undefined,
      doctorHospital: profile?.location || undefined,
      contactNumber: profile?.contact_number || userRow.phone
    };
  }
}

// Register Doctor
export function registerDoctor(params: {
  name: string;
  medicalId: string;
  password: string;
  specialization: string;
  location: string;
  contactNumber: string;
}): { user: UserResponse; token: string } {
  const cleanPhone = String(params.contactNumber).replace(/\D/g, '').slice(-10);
  const cleanMedicalId = params.medicalId.trim().toUpperCase();

  // Check if medical ID already registered
  const existingDoc = db.prepare('SELECT * FROM doctor_profiles WHERE medical_id = ?').get(cleanMedicalId);
  if (existingDoc) {
    throw new Error(`A doctor account with Medical ID "${cleanMedicalId}" already exists. Please login.`);
  }

  // Strong password hash with individual random cryptographic salt
  const { hash, salt } = hashPassword(params.password);
  const userId = `usr-doc-${Date.now().toString(36)}-${Math.floor(100 + Math.random() * 900)}`;

  // Insert user
  db.prepare(`
    INSERT INTO users (id, role, name, phone, password_hash, password_salt, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    userId,
    'doctor',
    params.name.trim(),
    cleanPhone || '9988776655',
    hash,
    salt,
    new Date().toISOString()
  );

  // Insert doctor profile
  db.prepare(`
    INSERT INTO doctor_profiles (user_id, medical_id, specialization, location, contact_number, room_number, available_status, consult_fee)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    userId,
    cleanMedicalId,
    params.specialization.trim(),
    params.location.trim(),
    cleanPhone,
    'Teleconsult Booth 1',
    'Online Now',
    0
  );

  const userRow = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as unknown as UserRow;
  const token = createSession(userId);

  return {
    user: formatUserResponse(userRow),
    token
  };
}

// Register Patient
export function registerPatient(params: {
  name: string;
  phone: string;
  password: string;
  age?: number;
  gender?: string;
  village?: string;
  abhaId?: string;
  allergies?: string;
  medicalHistory?: string;
}): { user: UserResponse; token: string } {
  const cleanPhone = String(params.phone).replace(/\D/g, '').slice(-10);
  if (!cleanPhone || cleanPhone.length < 10) {
    throw new Error('Please enter a valid 10-digit mobile phone number.');
  }

  // Check if patient with this phone already exists
  const existingUser = db.prepare("SELECT * FROM users WHERE phone = ? AND role = 'patient'").get(cleanPhone);
  if (existingUser) {
    throw new Error(`A patient account with phone number ${cleanPhone} already exists. Please login.`);
  }

  const { hash, salt } = hashPassword(params.password);
  const userId = `usr-pat-${Date.now().toString(36)}-${Math.floor(100 + Math.random() * 900)}`;
  const patientId = `PHC-UP-${Math.floor(10000 + Math.random() * 90000)}`;
  const abhaId = params.abhaId?.trim() || `84-${Math.floor(1000 + Math.random() * 9000)}-${Math.floor(1000 + Math.random() * 9000)}-${Math.floor(1000 + Math.random() * 9000)}`;

  db.prepare(`
    INSERT INTO users (id, role, name, phone, password_hash, password_salt, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    userId,
    'patient',
    params.name.trim(),
    cleanPhone,
    hash,
    salt,
    new Date().toISOString()
  );

  db.prepare(`
    INSERT INTO patient_profiles (user_id, patient_id, abha_id, age, gender, village, allergies, medical_history)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    userId,
    patientId,
    abhaId,
    Number(params.age) || 30,
    params.gender || 'Other',
    params.village?.trim() || '',
    params.allergies?.trim() || 'None',
    params.medicalHistory?.trim() || 'Self-registered patient'
  );

  const userRow = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as unknown as UserRow;
  const token = createSession(userId);

  return {
    user: formatUserResponse(userRow),
    token
  };
}

// Authenticate / Login User (Patient or Doctor)
export function loginUser(params: {
  identifier: string; // Phone, Medical ID, or ABHA/Patient ID
  password?: string;
  role: 'patient' | 'doctor';
}): { user: UserResponse; token: string } {
  const { identifier, password, role } = params;
  if (!identifier || !identifier.trim()) {
    throw new Error('Please enter your credentials (Phone Number or Medical Registration ID).');
  }

  const rawInput = identifier.trim();
  let userRow: UserRow | undefined;

  if (role === 'doctor') {
    const cleanId = rawInput.toUpperCase();
    const cleanPhone = rawInput.replace(/\D/g, '').slice(-10);
    const alphaNumericOnly = cleanId.replace(/[^A-Z0-9]/g, '');

    // 1. Try exact medical_id match (case-insensitive)
    let docProfile = db.prepare('SELECT * FROM doctor_profiles WHERE UPPER(medical_id) = ?').get(cleanId) as unknown as DoctorProfileRow | undefined;

    // 2. Try variations (strip prefixes like NMC/, MCI/, hyphens, or match suffix registration numbers)
    if (!docProfile) {
      const allDoctorProfiles = db.prepare('SELECT * FROM doctor_profiles').all() as unknown as DoctorProfileRow[];
      const inputNumbers = rawInput.replace(/\D/g, '');
      
      docProfile = allDoctorProfiles.find(d => {
        const storedUpper = d.medical_id.toUpperCase();
        const storedAlpha = storedUpper.replace(/[^A-Z0-9]/g, '');
        const storedNumbers = storedUpper.replace(/\D/g, '');
        
        // Check exact alphanumeric or substring matches
        if (
          storedUpper === cleanId ||
          storedAlpha === alphaNumericOnly ||
          storedUpper.includes(cleanId) ||
          cleanId.includes(storedUpper) ||
          (alphaNumericOnly.length >= 4 && storedAlpha.includes(alphaNumericOnly)) ||
          (storedAlpha.length >= 4 && alphaNumericOnly.includes(storedAlpha))
        ) {
          return true;
        }

        // Check if numeric registration number suffix matches (e.g. 84920 in MCI-UP-2018-84920 and MCI-UP-84920)
        if (inputNumbers.length >= 4 && storedNumbers.length >= 4) {
          if (storedNumbers.endsWith(inputNumbers) || inputNumbers.endsWith(storedNumbers)) {
            return true;
          }
        }

        return false;
      });
    }

    if (docProfile) {
      userRow = db.prepare('SELECT * FROM users WHERE id = ?').get(docProfile.user_id) as unknown as UserRow | undefined;
    }

    // 3. If not found by medical ID, try phone
    if (!userRow && cleanPhone && cleanPhone.length >= 10) {
      userRow = db.prepare("SELECT * FROM users WHERE phone = ? AND role = 'doctor'").get(cleanPhone) as unknown as UserRow | undefined;
    }

    // 4. Try doctor's user ID or name
    if (!userRow) {
      userRow = db.prepare(`
        SELECT * FROM users 
        WHERE role = 'doctor' AND (UPPER(id) = ? OR UPPER(name) = ? OR UPPER(name) LIKE ?)
      `).get(cleanId.toLowerCase(), cleanId, `%${cleanId}%`) as unknown as UserRow | undefined;
    }
  } else {
    // Patient: match by phone, patient_id, abha_id, or name
    const cleanPhone = rawInput.replace(/\D/g, '').slice(-10);
    const cleanId = rawInput.toUpperCase();

    if (cleanPhone.length >= 10) {
      userRow = db.prepare("SELECT * FROM users WHERE phone = ? AND role = 'patient'").get(cleanPhone) as unknown as UserRow | undefined;
    }

    // Match by Patient ID or ABHA ID
    if (!userRow) {
      const patProfile = db.prepare(`
        SELECT p.*, u.id as u_id 
        FROM patient_profiles p
        JOIN users u ON p.user_id = u.id
        WHERE UPPER(p.patient_id) = ? 
           OR UPPER(REPLACE(p.abha_id, '-', '')) = ?
           OR UPPER(p.abha_id) = ?
      `).get(cleanId, cleanId.replace(/[^A-Z0-9]/g, ''), cleanId) as any;

      if (patProfile) {
        userRow = db.prepare("SELECT * FROM users WHERE id = ?").get(patProfile.u_id) as unknown as UserRow | undefined;
      }
    }

    // Match by name if phone was not provided
    if (!userRow && rawInput.length >= 3) {
      userRow = db.prepare("SELECT * FROM users WHERE role = 'patient' AND UPPER(name) = ?").get(cleanId) as unknown as UserRow | undefined;
    }
  }

  if (!userRow) {
    throw new Error(`No ${role} account found matching "${identifier}". Please check your details or create a new account.`);
  }

  // Verify scrypt cryptographic hash
  if (password) {
    const isValid = verifyPassword(password, userRow.password_hash, userRow.password_salt);
    if (!isValid) {
      throw new Error('Incorrect password. Please try again.');
    }
  }

  const token = createSession(userRow.id);

  return {
    user: formatUserResponse(userRow),
    token
  };
}

// Session Helpers
export function createSession(userId: string): string {
  // Cryptographically random 256-bit token (32 random bytes in hex)
  const token = `sess_${crypto.randomBytes(32).toString('hex')}`;
  // 7-day expiration for clinical sessions
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const createdAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO auth_sessions (token, user_id, expires_at, created_at)
    VALUES (?, ?, ?, ?)
  `).run(token, userId, expiresAt, createdAt);

  return token;
}

export function validateSession(token: string): UserResponse | null {
  if (!token || typeof token !== 'string') return null;

  const session = db.prepare('SELECT * FROM auth_sessions WHERE token = ?').get(token) as unknown as { user_id: string; expires_at: string } | undefined;
  if (!session) return null;

  if (new Date(session.expires_at).getTime() < Date.now()) {
    // Purge expired session from SQLite
    db.prepare('DELETE FROM auth_sessions WHERE token = ?').run(token);
    return null;
  }

  const userRow = db.prepare('SELECT * FROM users WHERE id = ?').get(session.user_id) as unknown as UserRow | undefined;
  if (!userRow) return null;

  return formatUserResponse(userRow);
}

export function destroySession(token: string): boolean {
  if (!token) return false;
  const info = db.prepare('DELETE FROM auth_sessions WHERE token = ?').run(token);
  return info.changes > 0;
}

// ----------------------------------------------------
// Authentication & Role-Based Access Control (RBAC) Middlewares
// ----------------------------------------------------

/**
 * Extracts and validates auth session token from request headers or cookies.
 * Attaches req.user and req.authToken if valid.
 */
export function extractAuth(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  let token: string | undefined;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (req.headers['x-auth-token']) {
    token = String(req.headers['x-auth-token']).trim();
  } else if (req.query.token) {
    token = String(req.query.token).trim();
  }

  if (token) {
    const user = validateSession(token);
    if (user) {
      req.user = user;
      req.authToken = token;
    }
  }

  next();
}

/**
 * Middleware: Requires any authenticated session (doctor or patient)
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication is required to access this resource. Please provide a valid session token.'
    });
  }
  next();
}

/**
 * Reusable Role-Based Access Control Middleware.
 * Enforces that only users with the specific role(s) can proceed.
 * Rejects requests with 401 Unauthorized if not logged in, or 403 Forbidden if wrong role.
 */
export function requireRole(...allowedRoles: ('doctor' | 'patient')[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: `Authentication required. You must be signed in as ${allowedRoles.join(' or ')} to perform this action.`
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `Access denied. This endpoint is restricted to [${allowedRoles.join(', ')}] accounts only. Your current role is "${req.user.role}".`
      });
    }

    next();
  };
}

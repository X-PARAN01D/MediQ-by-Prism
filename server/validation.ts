import { Request, Response, NextFunction } from 'express';

// ----------------------------------------------------
// String & Data Sanitization (XSS & Injection Protection)
// ----------------------------------------------------

/**
 * Sanitizes arbitrary string input by trimming, stripping dangerous control chars,
 * and removing hazardous HTML/script tags while preserving standalone mathematical
 * and clinical comparison operators (<, >, <=, >=, e.g. "SpO2 < 90", "Fever > 101").
 */
export function sanitizeString(input: unknown): string {
  if (typeof input !== 'string') return '';
  
  return input
    .trim()
    // Strip HTML comments (e.g. <!-- comment -->)
    .replace(/<!--[\s\S]*?-->/g, '')
    // Strip complete HTML/XML tags (e.g. <script>, </script>, <img src=...>, <div class=...>)
    // Matches tags starting with a letter, slash, or exclamation mark followed by a tag name
    .replace(/<\/?[a-zA-Z][^>]*>/g, '')
    // Strip unclosed HTML tags starting with <letter or </letter at end of string
    .replace(/<\/?[a-zA-Z][^<]*$/g, '')
    // Strip dangerous null bytes and hidden control characters
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

/**
 * Recursively sanitizes strings within an object or array payload.
 */
export function sanitizePayload<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') return sanitizeString(obj) as unknown as T;
  if (typeof obj === 'number' || typeof obj === 'boolean') return obj;

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizePayload(item)) as unknown as T;
  }

  if (typeof obj === 'object') {
    const cleaned: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      // Don't sanitize passwords or token keys with HTML escaping as that alters raw characters
      if (key.toLowerCase().includes('password') || key.toLowerCase().includes('token') || key.toLowerCase().includes('sdp')) {
        cleaned[key] = value;
      } else {
        cleaned[key] = sanitizePayload(value);
      }
    }
    return cleaned as T;
  }

  return obj;
}

// ----------------------------------------------------
// Validation Schemas and Field Checkers
// ----------------------------------------------------

export interface ValidationError {
  field: string;
  message: string;
}

/**
 * Validates mobile phone numbers (supports Indian 10-digit, international, or local test numbers)
 */
export function isValidPhone(phone: unknown): boolean {
  if (typeof phone !== 'string' && typeof phone !== 'number') return false;
  const digits = String(phone).replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15;
}

/**
 * Validates Indian ABHA ID (14 digits with hyphens, e.g. 91-1234-5678-9012 or standard formats)
 */
export function isValidAbha(abha: unknown): boolean {
  if (typeof abha !== 'string') return false;
  const clean = abha.trim();
  return clean.length >= 6 && /^[0-9A-Za-z-]+$/.test(clean);
}

/**
 * Middleware: Global Payload Sanitizer
 */
export function globalSanitizer(req: Request, _res: Response, next: NextFunction) {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizePayload(req.body);
  }
  if (req.query && typeof req.query === 'object') {
    req.query = sanitizePayload(req.query);
  }
  next();
}

/**
 * Validator Middleware for Patient Registration (/api/auth/register/patient)
 */
export function validatePatientRegistration(req: Request, res: Response, next: NextFunction) {
  const errors: ValidationError[] = [];
  const { name, phone, password, age, gender } = req.body || {};

  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    errors.push({ field: 'name', message: 'Patient full name is required (minimum 2 characters).' });
  }

  if (!isValidPhone(phone)) {
    errors.push({ field: 'phone', message: 'A valid contact phone number is required.' });
  }

  if (!password || typeof password !== 'string' || password.length < 4) {
    errors.push({ field: 'password', message: 'Password is required and must be at least 4 characters.' });
  }

  if (age !== undefined && age !== null && (isNaN(Number(age)) || Number(age) < 0 || Number(age) > 130)) {
    errors.push({ field: 'age', message: 'Age must be a valid number between 0 and 130.' });
  }

  if (gender && !['Male', 'Female', 'Other'].includes(gender)) {
    errors.push({ field: 'gender', message: 'Gender must be Male, Female, or Other.' });
  }

  if (errors.length > 0) {
    const errorSummary = errors.map(e => e.message).join(' • ');
    return res.status(400).json({
      error: errorSummary,
      message: errorSummary,
      errors
    });
  }

  next();
}

/**
 * Validator Middleware for Doctor Registration (/api/auth/register/doctor)
 */
export function validateDoctorRegistration(req: Request, res: Response, next: NextFunction) {
  const errors: ValidationError[] = [];
  const { name, medicalId, password, specialization, location, contactNumber } = req.body || {};

  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    errors.push({ field: 'name', message: 'Doctor name is required.' });
  }

  if (!medicalId || typeof medicalId !== 'string' || medicalId.trim().length < 2) {
    errors.push({ field: 'medicalId', message: 'Medical Registration / Council ID is required (e.g. MCI-UP-2018-84920).' });
  }

  if (!password || typeof password !== 'string' || password.length < 4) {
    errors.push({ field: 'password', message: 'Password is required and must be at least 4 characters.' });
  }

  if (!specialization || typeof specialization !== 'string' || specialization.trim().length < 2) {
    errors.push({ field: 'specialization', message: 'Doctor clinical specialty is required.' });
  }

  if (!location || typeof location !== 'string' || location.trim().length < 2) {
    errors.push({ field: 'location', message: 'PHC or Hospital facility location is required.' });
  }

  if (!isValidPhone(contactNumber)) {
    errors.push({ field: 'contactNumber', message: 'Valid doctor contact phone is required.' });
  }

  if (errors.length > 0) {
    const errorSummary = errors.map(e => e.message).join(' • ');
    return res.status(400).json({
      error: errorSummary,
      message: errorSummary,
      errors
    });
  }

  next();
}

/**
 * Validator Middleware for User Login (/api/auth/login)
 */
export function validateLogin(req: Request, res: Response, next: NextFunction) {
  const errors: ValidationError[] = [];
  const { identifier, role, password } = req.body || {};

  if (!identifier || typeof identifier !== 'string' || identifier.trim().length < 1) {
    errors.push({ field: 'identifier', message: 'Please provide your registered phone number or Medical Council ID.' });
  }

  if (!role || !['patient', 'doctor'].includes(role)) {
    errors.push({ field: 'role', message: 'User role must be specified as "patient" or "doctor".' });
  }

  if (password !== undefined && typeof password !== 'string') {
    errors.push({ field: 'password', message: 'Password must be a valid text string.' });
  }

  if (errors.length > 0) {
    const errorSummary = errors.map(e => e.message).join(' • ');
    return res.status(400).json({
      error: errorSummary,
      message: errorSummary,
      errors
    });
  }

  next();
}

/**
 * Validator Middleware for Clinical Triage (/api/triage)
 */
export function validateTriage(req: Request, res: Response, next: NextFunction) {
  const errors: ValidationError[] = [];
  const { patientName, symptoms, symptomsText, selectedSymptomTags, age, gender, contactNumber } = req.body || {};

  if (!patientName || typeof patientName !== 'string' || patientName.trim().length < 2) {
    errors.push({ field: 'patientName', message: 'Patient name is required for clinical triage intake.' });
  }

  const hasSymptomsText = typeof symptomsText === 'string' && symptomsText.trim().length > 0;
  const hasSelectedTags = Array.isArray(selectedSymptomTags) && selectedSymptomTags.some((t: any) => typeof t === 'string' && t.trim().length > 0);
  const symptomsList = Array.isArray(symptoms) ? symptoms : (typeof symptoms === 'string' ? [symptoms] : []);
  const hasSymptomsList = symptomsList.some((s: string) => typeof s === 'string' && s.trim().length > 0);

  if (!hasSymptomsText && !hasSelectedTags && !hasSymptomsList) {
    errors.push({ field: 'symptoms', message: 'At least one primary symptom description is required.' });
  }

  if (age !== undefined && age !== null && (isNaN(Number(age)) || Number(age) < 0 || Number(age) > 130)) {
    errors.push({ field: 'age', message: 'Age must be between 0 and 130 years.' });
  }

  if (contactNumber && !isValidPhone(contactNumber)) {
    errors.push({ field: 'contactNumber', message: 'Patient contact number must be a valid 10-digit phone.' });
  }

  if (errors.length > 0) {
    const errorSummary = errors.map(e => e.message).join(' • ');
    return res.status(400).json({
      error: errorSummary,
      message: errorSummary,
      errors
    });
  }

  next();
}

/**
 * Validator Middleware for Chatbot Diagnostics (/api/chatbot/diagnose-and-recommend)
 */
export function validateChatbot(req: Request, res: Response, next: NextFunction) {
  const errors: ValidationError[] = [];
  const { message, messages, conversationHistory, symptomsText, symptoms, selectedSymptomTags } = req.body || {};

  const userQuery = 
    (typeof message === 'string' && message.trim()) ||
    (typeof symptomsText === 'string' && symptomsText.trim()) ||
    (typeof symptoms === 'string' && symptoms.trim()) ||
    (Array.isArray(selectedSymptomTags) && selectedSymptomTags.length > 0 && selectedSymptomTags.join(', ').trim()) ||
    (Array.isArray(messages) && (messages[messages.length - 1]?.text || messages[messages.length - 1]?.content)) ||
    (Array.isArray(conversationHistory) && (conversationHistory[conversationHistory.length - 1]?.text || conversationHistory[conversationHistory.length - 1]?.content));

  if (!userQuery || typeof userQuery !== 'string' || userQuery.trim().length === 0) {
    errors.push({ field: 'message', message: 'Patient medical question or symptom query text is required.' });
  } else if (userQuery.trim().length > 3000) {
    errors.push({ field: 'message', message: 'Query exceeds maximum allowed length of 3000 characters.' });
  }

  if (errors.length > 0) {
    const errorSummary = errors.map(e => e.message).join(' • ');
    return res.status(400).json({
      error: errorSummary,
      message: errorSummary,
      errors
    });
  }

  next();
}

/**
 * Validator Middleware for Doctor Prescription Generation (/api/consult/prescription)
 */
export function validatePrescription(req: Request, res: Response, next: NextFunction) {
  const errors: ValidationError[] = [];
  const { doctorName, diagnosis, medications, patientName, patientId } = req.body || {};

  if (!doctorName || typeof doctorName !== 'string' || doctorName.trim().length < 2) {
    errors.push({ field: 'doctorName', message: 'Prescribing doctor name is required.' });
  }

  if (!diagnosis || typeof diagnosis !== 'string' || diagnosis.trim().length < 2) {
    errors.push({ field: 'diagnosis', message: 'Clinical diagnosis is required to generate a prescription.' });
  }

  if (!patientName && !patientId) {
    errors.push({ field: 'patient', message: 'Either patientName or patientId must be provided.' });
  }

  if (medications && !Array.isArray(medications)) {
    errors.push({ field: 'medications', message: 'Medications must be provided as an array of medicine objects.' });
  }

  if (errors.length > 0) {
    const errorSummary = errors.map(e => e.message).join(' • ');
    return res.status(400).json({
      error: errorSummary,
      message: errorSummary,
      errors
    });
  }

  next();
}

/**
 * Validator Middleware for Video Call Request (/api/teleconsult/request)
 */
export function validateVideoCallRequest(req: Request, res: Response, next: NextFunction) {
  const errors: ValidationError[] = [];
  const { patientName, patientPhone, urgency } = req.body || {};

  if (!patientName || typeof patientName !== 'string' || patientName.trim().length < 2) {
    errors.push({ field: 'patientName', message: 'Patient name is required.' });
  }

  if (!isValidPhone(patientPhone)) {
    errors.push({ field: 'patientPhone', message: 'A valid contact phone number is required to receive doctor callback.' });
  }

  if (urgency && !['Emergency', 'Moderate', 'Minor'].includes(urgency)) {
    errors.push({ field: 'urgency', message: 'Urgency must be Emergency, Moderate, or Minor.' });
  }

  if (errors.length > 0) {
    const errorSummary = errors.map(e => e.message).join(' • ');
    return res.status(400).json({
      error: errorSummary,
      message: errorSummary,
      errors
    });
  }

  next();
}

/**
 * Validator Middleware for Adding Patient Visit / Symptoms Record (/api/patient/add-visit)
 */
export function validateAddVisit(req: Request, res: Response, next: NextFunction) {
  const errors: ValidationError[] = [];
  const { diagnosis, symptoms } = req.body || {};

  const hasDiagnosis = typeof diagnosis === 'string' && diagnosis.trim().length > 0;
  const hasSymptoms = 
    (typeof symptoms === 'string' && symptoms.trim().length > 0) ||
    (Array.isArray(symptoms) && symptoms.length > 0);

  if (!hasDiagnosis && !hasSymptoms) {
    errors.push({
      field: 'diagnosis_or_symptoms',
      message: 'At least a clinical diagnosis or symptom description is required to record a visit.'
    });
  }

  if (errors.length > 0) {
    const errorSummary = errors.map(e => e.message).join(' • ');
    return res.status(400).json({
      error: errorSummary,
      message: errorSummary,
      errors
    });
  }

  next();
}

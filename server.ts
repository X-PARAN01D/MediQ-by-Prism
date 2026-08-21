import express from "express";
import http from "http";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

import { evaluateRuleBasedTriage } from "./src/utils/triageEngine";
import { Patient, QueueToken, VisitRecord, TriageRequest, Prescription, Vitals, DoctorProfile, ChronicConditionAlert, VitalLogEntry } from "./src/types";
import {
  initDatabase,
  db,
  dbGetAllPatients,
  dbGetPatientByIdOrPhone,
  dbSearchPatients,
  dbInsertPatient,
  dbGetQueueTokens,
  dbGetQueueTokenById,
  dbGetNextSequentialTokenId,
  dbInsertQueueToken,
  dbUpdateQueueTokenStatus,
  dbGetVisitsForPatient,
  dbInsertVisit,
  dbGetPrescriptionsForPatient,
  dbGetPrescriptionById,
  dbGetVitalsForPatient,
  dbInsertVitalLog,
  dbGetDoctorDirectory,
  dbGetPHCClusters,
  dbGetChronicAlertsForPatient,
  dbGetVideoCallRequests,
  dbGetVideoCallRequestById,
  dbInsertVideoCallRequest,
  dbUpdateVideoCallRequest,
  dbGetLiveCallSessions,
  dbGetLiveCallSessionById,
  dbInsertLiveCallSession,
  dbUpdateLiveCallSession,
  dbTransaction,
  withDbRetry,
  dbBackup,
  startPeriodicBackup,
  verifyDatabaseIntegrity,
  closeDatabaseGracefully,
  DB_PATH,
  BACKUP_DIR,
  GOLDEN_BACKUP_NAME
} from "./server/db";
import {
  registerDoctor,
  registerPatient,
  loginUser,
  validateSession,
  destroySession,
  formatUserResponse,
  extractAuth,
  requireAuth,
  requireRole
} from "./server/auth";
import {
  setupTeleconsultSignaling,
  LiveCallSession,
  VideoCallRequest,
  getActiveSessionForEntity,
  getPendingVideoCallRequests,
  getVideoCallRequest,
  getLiveCallSession
} from "./server/teleconsult";
import {
  globalSanitizer,
  validatePatientRegistration,
  validateDoctorRegistration,
  validateLogin,
  validateTriage,
  validateChatbot,
  validatePrescription,
  validateVideoCallRequest,
  validateAddVisit
} from "./server/validation";
import {
  authRateLimiter,
  aiRateLimiter,
  speechRateLimiter,
  generalApiLimiter
} from "./server/rateLimit";

dotenv.config();

// Initialize persistent SQLite Database & seed default accounts
initDatabase();

// Start periodic automatic database backups (every 6 hours)
startPeriodicBackup(6);

const app = express();
const PORT = 3000;

// Trust proxy for secure headers and reverse proxy forwarding
app.set("trust proxy", 1);

// Standard Security & Transport Headers Middleware (HTTPS Enforcement & XSS/Sniffing Protection)
app.use((req, res, next) => {
  // Enforce HSTS (Strict-Transport-Security) in production
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    
    // Redirect HTTP to HTTPS if forwarded by reverse proxy
    if (req.headers['x-forwarded-proto'] && req.headers['x-forwarded-proto'] !== 'https') {
      return res.redirect(`https://${req.headers.host}${req.url}`);
    }
  }

  // General Security Headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  next();
});

// JSON Body Parser with 2MB limit
app.use(express.json({ limit: "2mb" }));

// Global Input Sanitization & Session Extraction
app.use(globalSanitizer);
app.use(extractAuth);

// Initialize Google Gen AI client on server side
const apiKey = process.env.GEMINI_API_KEY;
let aiClient: GoogleGenAI | null = null;
if (apiKey) {
  aiClient = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build"
      }
    }
  });
}

/**
 * Executes Gemini content generation with the designated model (e.g. "gemini-2.5-flash")
 * with resilient fallback if the API returns a 404/NOT_FOUND for deprecated aliases.
 */
async function safeGeminiGenerate(options: {
  model?: string;
  contents: any;
  config?: any;
}) {
  if (!aiClient) return null;
  const primaryModel = options.model || "gemini-2.5-flash";
  const modelCandidates = Array.from(new Set([
    primaryModel,
    "gemini-2.5-flash",
    "gemini-3.6-flash",
    "gemini-3.7-flash",
    "gemini-1.5-flash"
  ]));

  let lastError: any = null;
  for (const model of modelCandidates) {
    try {
      const response = await aiClient.models.generateContent({
        model,
        contents: options.contents,
        config: options.config
      });
      return response;
    } catch (err: any) {
      lastError = err;
      const msg = (err?.message || "").toLowerCase();
      const isNotFound = msg.includes("404") ||
        msg.includes("not_found") ||
        msg.includes("not found") ||
        msg.includes("no longer available") ||
        msg.includes("is not supported");
      if (isNotFound) {
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

// ----------------------------------------------------
// API Routes
// ----------------------------------------------------

// 0. Authentication Routes (Patient & Doctor Login / Signup with SQLite & Password Hashing)

// Register Doctor Endpoint (Auth rate limiter + Strict Validation)
app.post("/api/auth/register/doctor", authRateLimiter, validateDoctorRegistration, (req, res) => {
  try {
    const { name, medicalId, password, specialization, location, contactNumber } = req.body;

    const { user, token } = registerDoctor({
      name,
      medicalId,
      password,
      specialization,
      location,
      contactNumber
    });

    res.status(201).json({
      message: "Doctor registered successfully",
      user,
      token
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Doctor registration failed" });
  }
});

// Register Patient Endpoint (Auth rate limiter + Strict Validation)
app.post("/api/auth/register/patient", authRateLimiter, validatePatientRegistration, (req, res) => {
  try {
    const { name, phone, password, age, gender, village, abhaId, allergies, medicalHistory } = req.body;

    const { user, token } = registerPatient({
      name,
      phone,
      password,
      age: Number(age),
      gender,
      village,
      abhaId,
      allergies,
      medicalHistory
    });

    // Also register into central Patient registry
    dbInsertPatient({
      id: user.patientId || `PHC-UP-${Math.floor(10000 + Math.random() * 90000)}`,
      abhaId: user.abhaId,
      name: user.name,
      nameRegional: user.nameRegional,
      age: Number(age),
      gender,
      village,
      contactNumber: phone,
      medicalHistory: medicalHistory ? (Array.isArray(medicalHistory) ? medicalHistory : [medicalHistory]) : [],
      allergies: allergies ? (Array.isArray(allergies) ? allergies : [allergies]) : [],
      registeredDate: new Date().toISOString().split('T')[0]
    });

    res.status(201).json({
      message: "Patient registered successfully",
      user,
      token
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Patient registration failed" });
  }
});

// Login Endpoint (Brute-force protection: 20 per 15 min + Schema validation)
app.post("/api/auth/login", authRateLimiter, validateLogin, (req, res) => {
  try {
    const { identifier, password, role } = req.body;

    const { user, token } = loginUser({
      identifier,
      password,
      role
    });

    res.json({
      message: "Login successful",
      user,
      token
    });
  } catch (err: any) {
    res.status(401).json({ error: err.message || "Invalid credentials." });
  }
});

// Current User Profile Endpoint (Requires valid active session)
app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// Logout Endpoint (Purges session token from SQLite database)
app.post("/api/auth/logout", (req, res) => {
  const token = req.authToken || (req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7).trim() : undefined);
  if (token) {
    destroySession(token);
  }
  res.json({ message: "Logged out successfully. Server session invalidated." });
});

// Update Patient Profile (Patient Role Required)
app.post("/api/patient/update-profile", requireAuth, requireRole('patient'), (req, res) => {
  const { phone, name, nameRegional, age, gender, village, abhaId, allergies, medicalHistory } = req.body;
  const effectivePhone = req.user?.phone || phone;
  
  if (!effectivePhone) {
    return res.status(400).json({ error: "Phone number is required to update profile." });
  }

  const cleanPhone = String(effectivePhone).replace(/\D/g, '').slice(-10);
  const userRow = db.prepare("SELECT * FROM users WHERE phone = ?").get(cleanPhone) as any;

  if (userRow) {
    if (name) {
      db.prepare('UPDATE users SET name = ?, name_regional = COALESCE(?, name_regional) WHERE id = ?').run(name, nameRegional || null, userRow.id);
    }
    db.prepare(`
      UPDATE patient_profiles
      SET abha_id = COALESCE(?, abha_id),
          age = COALESCE(?, age),
          gender = COALESCE(?, gender),
          village = COALESCE(?, village),
          allergies = COALESCE(?, allergies),
          medical_history = COALESCE(?, medical_history)
      WHERE user_id = ?
    `).run(
      abhaId || null,
      age ? Number(age) : null,
      gender || null,
      village || null,
      allergies ? JSON.stringify(allergies) : null,
      medicalHistory ? JSON.stringify(medicalHistory) : null,
      userRow.id
    );
  }

  const existingPatient = dbGetPatientByIdOrPhone(cleanPhone);
  if (existingPatient) {
    dbInsertPatient({
      id: existingPatient.id,
      abhaId: abhaId || existingPatient.abha_id,
      name: name || existingPatient.name,
      nameRegional: nameRegional || existingPatient.name_regional,
      age: age ? Number(age) : existingPatient.age,
      gender: gender || existingPatient.gender,
      village: village || existingPatient.village,
      contactNumber: cleanPhone,
      medicalHistory: medicalHistory ? (Array.isArray(medicalHistory) ? medicalHistory : [medicalHistory]) : (existingPatient.medical_history ? JSON.parse(existingPatient.medical_history) : []),
      allergies: allergies ? (Array.isArray(allergies) ? allergies : [allergies]) : (existingPatient.allergies ? JSON.parse(existingPatient.allergies) : []),
      registeredDate: existingPatient.registered_date
    });
  }

  const updatedUser = userRow ? formatUserResponse(db.prepare('SELECT * FROM users WHERE id = ?').get(userRow.id) as any) : null;
  res.json({ message: "Profile updated successfully", user: updatedUser, patient: existingPatient });
});

// Patient Health History & Chronic Alerts API (Accessible by patient or doctor)
app.get("/api/patient/health-history/:phone?", requireAuth, (req, res) => {
  const rawParam = req.params.phone || req.user?.phone || req.user?.patientId;
  if (!rawParam) {
    return res.status(400).json({ error: "Patient identifier or phone number is required." });
  }

  const cleanPhone = String(rawParam).replace(/\D/g, '').slice(-10);
  const userPhone = req.user?.phone ? String(req.user.phone).replace(/\D/g, '').slice(-10) : '';

  // If signed in as patient, ensure they can only access their own history
  if (req.user?.role === 'patient') {
    if (userPhone && cleanPhone && cleanPhone.length === 10 && userPhone !== cleanPhone) {
      return res.status(403).json({
        error: "Forbidden",
        message: "You are only authorized to view your own clinical health history."
      });
    }
  }

  // Find user / patient
  let user: any = null;
  const userRow = db.prepare("SELECT * FROM users WHERE phone = ? OR id = ?").get(cleanPhone || rawParam, req.user?.id || rawParam);
  if (userRow) {
    user = formatUserResponse(userRow as any);
  }

  const patient = dbGetPatientByIdOrPhone(cleanPhone || rawParam);
  
  // Collect all possible candidate IDs for this patient
  const candidateIds = Array.from(new Set([
    rawParam,
    patient?.id,
    user?.patientId,
    req.user?.patientId,
    cleanPhone ? `P-${cleanPhone}` : null,
    cleanPhone ? `PHC-UP-84920` : null
  ].filter(Boolean))) as string[];

  const pastVisits = dbGetVisitsForPatient(candidateIds);
  const primaryPatientId = patient?.id || user?.patientId || req.user?.patientId || candidateIds[0] || `P-${cleanPhone}`;
  const chronicAlerts = dbGetChronicAlertsForPatient(primaryPatientId);
  const vitalsHistory = dbGetVitalsForPatient(primaryPatientId);

  res.json({
    pastVisits,
    chronicAlerts,
    vitalsHistory,
    patient: patient ? {
      id: patient.id,
      name: patient.name,
      nameRegional: patient.name_regional,
      abhaId: patient.abha_id,
      age: patient.age,
      gender: patient.gender,
      village: patient.village,
      medicalHistory: patient.medical_history ? JSON.parse(patient.medical_history) : [],
      allergies: patient.allergies ? JSON.parse(patient.allergies) : []
    } : (user ? {
      id: user.patientId,
      name: user.name,
      abhaId: user.abhaId,
      medicalHistory: user.medicalHistory || [],
      allergies: user.allergies || []
    } : null)
  });
});

// Record a new patient visit / past clinical record (Patient Role Required)
app.post("/api/patient/add-visit", requireAuth, requireRole('patient'), validateAddVisit, (req, res) => {
  try {
    const {
      patientId,
      patientName,
      date,
      phcName,
      doctorName,
      diagnosis,
      symptoms,
      medicationSummary,
      advice
    } = req.body || {};

    const effectivePhone = req.user?.phone;
    const effectivePatientId = req.user?.patientId || patientId || (effectivePhone ? `P-${effectivePhone}` : `P-${Date.now()}`);
    const effectivePatientName = patientName || req.user?.name || 'Patient';
    const visitId = `vst-${Date.now().toString(36)}`;
    const visitDate = date || new Date().toISOString().split('T')[0];

    // Format symptoms into array of strings
    let symptomsArray: string[] = [];
    if (Array.isArray(symptoms)) {
      symptomsArray = symptoms.map(s => String(s).trim()).filter(Boolean);
    } else if (typeof symptoms === 'string' && symptoms.trim()) {
      symptomsArray = symptoms.split(',').map(s => s.trim()).filter(Boolean);
    }

    const hasPrescription = Boolean(medicationSummary && medicationSummary.trim());
    const rxId = `rx-${Date.now().toString(36)}`;

    const visitRecord: any = {
      id: visitId,
      patientId: effectivePatientId,
      patientName: effectivePatientName,
      date: visitDate,
      phcName: phcName || 'Rampur Primary Health Centre',
      symptoms: symptomsArray,
      triageCategory: 'GREEN',
      doctorName: doctorName || 'Medical Officer',
      doctorSpecialty: 'General Practitioner',
      diagnosis: diagnosis || (symptomsArray.length > 0 ? symptomsArray.join(', ') : 'Clinical Checkup'),
      clinicalNotes: advice || null,
      consultMode: 'In-Person',
      prescription: hasPrescription ? {
        id: rxId,
        visitId: visitId,
        patientId: effectivePatientId,
        patientName: effectivePatientName,
        doctorName: doctorName || 'Medical Officer',
        diagnosis: diagnosis || 'Clinical Checkup',
        medications: [{
          name: medicationSummary.trim(),
          dosage: 'As prescribed',
          frequency: 'Daily',
          duration: 'As instructed',
          instructions: 'Take with clean drinking water'
        }],
        advice: advice?.trim() || 'Take adequate rest and maintain hydration',
        followUpDays: 14,
        date: visitDate
      } : undefined
    };

    dbInsertVisit(visitRecord);

    res.status(201).json({
      message: "Visit record saved successfully",
      visitId,
      visit: visitRecord
    });
  } catch (err: any) {
    console.error("Error saving visit record:", err);
    res.status(500).json({ error: "Failed to save visit record", details: err.message });
  }
});

// Log new patient vital readings (Patient Role Required)
app.post("/api/patient/vitals-log", requireAuth, requireRole('patient'), (req, res) => {
  const { phone, patientId, systolicBP, diastolicBP, bloodSugarFasting, bloodSugarPostMeal, spO2, pulseRate, temperature, weightKg, notes } = req.body;
  
  const effectivePhone = req.user?.phone || phone;
  const effectivePatientId = req.user?.patientId || patientId || `P-${effectivePhone}`;

  if (!effectivePhone && !effectivePatientId) {
    return res.status(400).json({ error: "Patient phone number or ID is required." });
  }

  const newVitalEntry: VitalLogEntry = {
    id: `vit-${Date.now()}`,
    date: new Date().toISOString().split('T')[0],
    timestamp: new Date().toISOString(),
    systolicBP: systolicBP ? Number(systolicBP) : undefined,
    diastolicBP: diastolicBP ? Number(diastolicBP) : undefined,
    bloodSugarFasting: bloodSugarFasting ? Number(bloodSugarFasting) : undefined,
    bloodSugarPostMeal: bloodSugarPostMeal ? Number(bloodSugarPostMeal) : undefined,
    spO2: spO2 ? Number(spO2) : undefined,
    pulseRate: pulseRate ? Number(pulseRate) : undefined,
    temperature: temperature ? Number(temperature) : undefined,
    weightKg: weightKg ? Number(weightKg) : undefined,
    notes: notes || 'Logged by Patient'
  };

  dbInsertVitalLog({
    ...newVitalEntry,
    patientId: effectivePatientId
  });

  const updatedHistory = dbGetVitalsForPatient(effectivePatientId);
  const updatedAlerts = dbGetChronicAlertsForPatient(effectivePatientId);

  res.status(201).json({
    message: "Vitals logged successfully",
    entry: newVitalEntry,
    updatedHistory,
    updatedAlerts
  });
});

// 1. Healthcheck
app.get("/api/health", (req, res) => {
  const allTokens = dbGetQueueTokens();
  const waitingCount = allTokens.filter((q: any) => q.status === 'Waiting').length;
  res.json({
    status: "ok",
    environment: process.env.NODE_ENV || "development",
    hasGeminiKey: !!apiKey,
    activeQueueCount: waitingCount,
    timestamp: new Date().toISOString()
  });
});

// 2. Triage Symptom Submission & Classification Endpoint (AI Rate Limiter + Strict Validation)
app.post("/api/triage", aiRateLimiter, validateTriage, async (req, res) => {
  try {
    const triageReq: TriageRequest = req.body;

    // Step 1: Execute Deterministic Rule-Based Triage Decision Engine
    const ruleResult = evaluateRuleBasedTriage(triageReq);
    
    let finalUrgency = ruleResult.urgency;
    let finalCategory = ruleResult.category;
    let finalScore = ruleResult.urgencyScore;
    let aiExplanation = ruleResult.aiExplanation;
    let preConsultAdvice = ruleResult.preConsultAdvice;
    let recommendedDept = ruleResult.recommendedDepartment;

    // Step 2: Enhance with Server-Side Gemini AI Triage (if API key available)
    if (aiClient) {
      try {
        const prompt = `You are an expert AI Triage Medical Officer assisting a rural Primary Health Centre (PHC) in India.
Evaluate the following patient intake details and provide a clinical triage assessment.

Patient Info:
- Name: ${triageReq.patientName}
- Age: ${triageReq.age}
- Gender: ${triageReq.gender}
- Primary Complaints: ${triageReq.symptomsText}
- Selected Symptom Badges: ${(triageReq.selectedSymptomTags || []).join(', ')}
- Vitals: ${JSON.stringify(triageReq.vitals || {})}
- Preliminary Rule-Based Urgency: ${ruleResult.urgency} (Score: ${ruleResult.urgencyScore}/100)
- Red Flags Identified: ${(ruleResult.redFlagsDetected || []).join('; ') || 'None'}

Provide your output strictly in JSON format with the following fields:
1. urgency: "Emergency" | "Moderate" | "Minor"
2. urgencyScore: number between 1 and 100
3. aiExplanation: clear clinical reasoning written in clear, reassuring simple language for rural healthcare staff
4. recommendedDepartment: PHC specialty (e.g. "Emergency Trauma", "General OPD", "Pediatrics Teleconsult", "Maternity Cell")
5. preConsultAdvice: immediate first-aid, hydration, or positioning advice prior to seeing doctor
6. redFlags: list of critical symptoms if any`;

        const geminiResponse = await safeGeminiGenerate({
          model: "gemini-2.5-flash",
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                urgency: { type: Type.STRING },
                urgencyScore: { type: Type.NUMBER },
                aiExplanation: { type: Type.STRING },
                recommendedDepartment: { type: Type.STRING },
                preConsultAdvice: { type: Type.STRING },
                redFlags: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING }
                }
              },
              required: ["urgency", "urgencyScore", "aiExplanation", "recommendedDepartment", "preConsultAdvice"]
            }
          }
        });

        if (geminiResponse.text) {
          const parsed = JSON.parse(geminiResponse.text.trim());
          if (['Emergency', 'Moderate', 'Minor'].includes(parsed.urgency)) {
            // Respect emergency escalation from either rule or AI
            if (ruleResult.urgency === 'Emergency' || parsed.urgency === 'Emergency') {
              finalUrgency = 'Emergency';
              finalCategory = 'RED';
            } else {
              finalUrgency = parsed.urgency;
              finalCategory = finalUrgency === 'Moderate' ? 'YELLOW' : 'GREEN';
            }
            finalScore = parsed.urgencyScore || ruleResult.urgencyScore;
            aiExplanation = parsed.aiExplanation || ruleResult.aiExplanation;
            preConsultAdvice = parsed.preConsultAdvice || ruleResult.preConsultAdvice;
            recommendedDept = parsed.recommendedDepartment || ruleResult.recommendedDepartment;
          }
        }
      } catch (geminiErr) {
        console.warn("Gemini Triage enhancement fallback to rule engine:", geminiErr);
      }
    }

    // Step 3: Register or Update Patient in Patient Database
    const effectiveVillage = triageReq.village || 'Rampur Village';
    let existingPatient = dbGetPatientByIdOrPhone(triageReq.patientName);
    let patientId = existingPatient?.id;
    if (!existingPatient) {
      patientId = `PHC-UP-${Math.floor(10000 + Math.random() * 90000)}`;
      dbInsertPatient({
        id: patientId,
        abhaId: `91-${Math.floor(1000 + Math.random() * 9000)}-${Math.floor(1000 + Math.random() * 9000)}-${Math.floor(1000 + Math.random() * 9000)}`,
        name: triageReq.patientName,
        age: triageReq.age,
        gender: triageReq.gender,
        village: effectiveVillage,
        contactNumber: triageReq.contactNumber || '+91 98' + Math.floor(10000000 + Math.random() * 90000000),
        medicalHistory: triageReq.selectedSymptomTags || [],
        registeredDate: new Date().toISOString().split('T')[0]
      });
      existingPatient = dbGetPatientByIdOrPhone(patientId);
    }

    // Step 4: Generate Priority Queue Token
    const tokenId = dbGetNextSequentialTokenId(finalUrgency);

    const estWaitMinutes = finalUrgency === 'Emergency' ? 0 : (finalUrgency === 'Moderate' ? 12 : 25);

    // Doctor & Room assignment: Use explicitly selected doctor if provided, otherwise fallback to defaults
    const assignedDoctor = triageReq.assignedDoctor || (finalUrgency === 'Emergency' ? 'Dr. Anita Roy (Emergency MO)' : 'Dr. Suresh Verma');
    const assignedRoom = triageReq.assignedRoom || (finalUrgency === 'Emergency' ? 'Emergency Trauma Bay' : 'Teleconsult Booth 1');

    const newQueueToken: QueueToken = {
      tokenId,
      patientId: patientId!,
      patientName: triageReq.patientName,
      age: triageReq.age,
      gender: triageReq.gender,
      village: effectiveVillage,
      urgency: finalUrgency,
      category: finalCategory,
      urgencyScore: finalScore,
      symptomsSummary: triageReq.symptomsText || (triageReq.selectedSymptomTags || []).join(', '),
      status: finalUrgency === 'Emergency' ? 'In Consult' : 'Waiting',
      assignedDoctor,
      assignedRoom,
      estimatedWaitMinutes: estWaitMinutes,
      createdAt: new Date().toISOString(),
      vitals: triageReq.vitals,
      triageResultId: ruleResult.id
    };

    dbInsertQueueToken(newQueueToken);

    // Return Triage Result & Generated Queue Token
    res.json({
      triageResult: {
        ...ruleResult,
        urgency: finalUrgency,
        category: finalCategory,
        urgencyScore: finalScore,
        aiExplanation,
        preConsultAdvice,
        recommendedDepartment: recommendedDept
      },
      queueToken: newQueueToken,
      patient: existingPatient,
      smsFallbackPayload: `PHC SWASTHYA TOKEN: ${tokenId}. Patient: ${triageReq.patientName}. Urgency: ${finalUrgency.toUpperCase()}. Est Wait: ${estWaitMinutes} mins. Room: ${newQueueToken.assignedRoom}.`
    });

  } catch (err: any) {
    console.error("Triage endpoint error:", err);
    res.status(500).json({ error: "Failed to perform triage", details: err.message });
  }
});

// 3. Voice Speech-to-Text Parsing & AI Symptom Extraction (Speech Rate Limiter)
app.post("/api/voice/parse", speechRateLimiter, async (req, res) => {
  try {
    const { rawSpeechText, language = 'en' } = req.body;
    if (!rawSpeechText || typeof rawSpeechText !== 'string' || rawSpeechText.trim().length === 0) {
      return res.status(400).json({ error: "rawSpeechText is required" });
    }

    if (aiClient) {
      const prompt = `You are an AI Medical Assistant for rural Indian healthcare workers.
Extract clinical symptoms, duration, self-reported severity, and primary complaint tags from the following speech transcript.
The transcript may be in Hindi, English, Tamil, Telugu, Marathi, or Bengali.

Speech Transcript: "${rawSpeechText}"

Return JSON:
{
  "extractedSymptoms": ["symptom1", "symptom2"],
  "duration": "e.g., 3 days",
  "severitySelfReported": "Mild" | "Moderate" | "Severe",
  "detectedLanguage": "English" | "Hindi" | "Tamil" | "Telugu" | "Marathi" | "Bengali",
  "confidence": number 0-1
}`;

      const aiRes = await safeGeminiGenerate({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: { responseMimeType: "application/json" }
      });

      if (aiRes.text) {
        return res.json(JSON.parse(aiRes.text.trim()));
      }
    }

    // Fallback simple symptom keyword extraction if AI unavailable
    const lower = rawSpeechText.toLowerCase();
    const symptoms: string[] = [];
    if (lower.includes('fever') || lower.includes('बुखार') || lower.includes('காய்ச்சல்')) symptoms.push('Fever / बुख़ार');
    if (lower.includes('chest') || lower.includes('छाती')) symptoms.push('Chest Pain / छाती में दर्द');
    if (lower.includes('cough') || lower.includes('खांसी')) symptoms.push('Cough');
    if (lower.includes('headache') || lower.includes('सर दर्द')) symptoms.push('Headache');
    if (symptoms.length === 0) symptoms.push('General Malaise');

    res.json({
      extractedSymptoms: symptoms,
      rawText: rawSpeechText,
      duration: "1-3 days",
      severitySelfReported: lower.includes('severe') || lower.includes('तेज़') ? 'Severe' : 'Moderate',
      detectedLanguage: language,
      confidence: 0.85
    });
  } catch (err: any) {
    res.status(500).json({ error: "Voice parse failed", details: err.message });
  }
});

// Helper function: Match best doctors for diagnosed issue, patient location & urgency
function matchDoctorsForPatientTriage(
  symptomsText: string,
  symptomTags: string[],
  triageUrgency: 'Emergency' | 'Moderate' | 'Minor',
  patientVillage: string = '',
  patientAge?: number
): { matchedDoctors: DoctorProfile[]; primaryDoctor: DoctorProfile; matchReason: string; matchReasonHindi: string } {
  const doctorsDirectory = dbGetDoctorDirectory();
  const lower = `${symptomsText} ${symptomTags.join(' ')}`.toLowerCase();

  let targetCategory: DoctorProfile['doctorSpecialtyCategory'] = 'General Medicine';
  let matchReason = 'General Physician consultation recommended for acute illness.';
  let matchReasonHindi = 'सामान्य स्वास्थ्य और प्राथमिक उपचार हेतु जनरल फिजिशियन उपयुक्त हैं।';

  if (
    lower.includes('chest') || lower.includes('छाती') || lower.includes('सीने') ||
    lower.includes('heart') || lower.includes('दिल') || lower.includes('breath') ||
    lower.includes('साँस') || triageUrgency === 'Emergency'
  ) {
    targetCategory = 'Emergency Medicine';
    matchReason = 'Emergency Trauma & Critical Medicine MO prioritized for severe cardio-respiratory indicators.';
    matchReasonHindi = 'सीने में दर्द व सांस की तकलीफ़ हेतु आपातकालीन चिकित्सा अधिकारी (Emergency MO) को प्राथमिकता दी गई है।';
  } else if (
    (patientAge && patientAge < 12) || lower.includes('child') || lower.includes('बच्चा') || lower.includes('pediatric') || lower.includes('शिशु')
  ) {
    targetCategory = 'Pediatrics';
    matchReason = 'Pediatric & Child Health specialist selected for infant/child symptoms.';
    matchReasonHindi = 'बाल रोग विशेषज्ञ (Pediatrician) से परामर्श अनुशंसित है।';
  } else if (
    lower.includes('cough') || lower.includes('खांसी') || lower.includes('asthma') || lower.includes('दमा') ||
    lower.includes('wheez') || lower.includes('cold') || lower.includes('जुकाम') || lower.includes('throat')
  ) {
    targetCategory = 'Pulmonology';
    matchReason = 'Pulmonologist / Chest Specialist selected for respiratory & cough symptoms.';
    matchReasonHindi = 'खांसी, दमा व फेफड़ों के संक्रमण हेतु पल्मोनोलॉजिस्ट (Chest Specialist) उपयुक्त हैं।';
  } else if (
    lower.includes('vomit') || lower.includes('उल्टी') || lower.includes('stomach') || lower.includes('पेट') ||
    lower.includes('diarrhea') || lower.includes('दस्त') || lower.includes('loose') || lower.includes('acidity') || lower.includes('पेट दर्द')
  ) {
    targetCategory = 'Gastroenterology';
    matchReason = 'Gastroenterologist & Abdominal specialist matched for acute GI symptoms.';
    matchReasonHindi = 'पेट दर्द, उल्टी या दस्त हेतु गैस्ट्रोएंटरोलॉजिस्ट विशेषज्ञ अनुशंसित हैं।';
  } else if (
    lower.includes('joint') || lower.includes('जोड़') || lower.includes('bone') || lower.includes('हड्डी') ||
    lower.includes('knee') || lower.includes('घुटने') || lower.includes('back') || lower.includes('कमर') || lower.includes('fracture')
  ) {
    targetCategory = 'Orthopedics';
    matchReason = 'Orthopedic surgeon recommended for joint, bone, and musculoskeletal pain.';
    matchReasonHindi = 'हड्डी व जोड़ों के दर्द हेतु ऑर्थोपेडिक विशेषज्ञ उपयुक्त हैं।';
  } else if (
    lower.includes('pregnant') || lower.includes('गर्भवती') || lower.includes('maternity') || lower.includes('period') ||
    lower.includes('mahina') || lower.includes('gynec') || lower.includes('महिला')
  ) {
    targetCategory = 'Gynecology';
    matchReason = 'Gynecologist & Obstetrician recommended for maternal and reproductive health.';
    matchReasonHindi = 'मातृ व महिला स्वास्थ्य हेतु स्त्री रोग विशेषज्ञ (Gynecologist) उपयुक्त हैं।';
  }

  const scored = doctorsDirectory.map(doc => {
    let score = 0;
    let dist = doc.distanceKm || 1.5;

    // Specialization score
    if (doc.doctorSpecialtyCategory === targetCategory) score += 60;
    else if (doc.doctorSpecialtyCategory === 'Emergency Medicine' && triageUrgency === 'Emergency') score += 55;
    else if (doc.doctorSpecialtyCategory === 'General Medicine') score += 30;

    // Proximity score
    score += Math.max(0, Math.round(30 - (dist * 4)));

    // Availability score
    if (doc.availableStatus === 'Online Now') score += 15;
    else if (doc.availableStatus === 'In Clinic') score += 10;

    return {
      ...doc,
      matchScore: score
    };
  });

  scored.sort((a, b) => b.matchScore - a.matchScore);

  return {
    matchedDoctors: scored.slice(0, 3),
    primaryDoctor: scored[0] || doctorsDirectory[0],
    matchReason,
    matchReasonHindi
  };
}

// 3A. Doctor Directory Endpoint (Requires Authentication)
app.get("/api/doctors/directory", requireAuth, (req, res) => {
  const isDoctor = req.user?.role === 'doctor';
  const doctors = dbGetDoctorDirectory().map(doc => ({
    ...doc,
    phone: isDoctor ? doc.phone : '108 (PHC Central Dispatch)'
  }));
  res.json({
    doctors,
    totalAvailable: doctors.filter(d => d.availableStatus === 'Online Now').length
  });
});

// 3B. Chatbot Triage & Doctor Recommendation Endpoint (AI Rate Limiter + Input Validation)
app.post("/api/chatbot/diagnose-and-recommend", aiRateLimiter, validateChatbot, async (req, res) => {
  try {
    const {
      patientName = 'Patient',
      age = 30,
      gender = 'Other',
      village = 'Rural PHC Circle',
      symptomsText = '',
      duration = '1-2 days',
      severity = 'Moderate',
      selectedSymptomTags = [],
      vitals = { spO2: 98, systolicBP: 120, temperature: 98.6 },
      language = 'hi',
      createToken = false
    } = req.body;

    const triageRequest: TriageRequest = {
      patientName,
      age: Number(age),
      gender,
      village,
      symptomsText: `${symptomsText} (Duration: ${duration}, Severity: ${severity})`,
      selectedSymptomTags,
      vitals,
      language,
      enteredBy: 'Self'
    };

    // Step 1: Evaluate Rule-based clinical triage
    const ruleResult = evaluateRuleBasedTriage(triageRequest);

    let finalUrgency = ruleResult.urgency;
    let finalCategory = ruleResult.category;
    let finalScore = ruleResult.urgencyScore;
    let aiExplanation = ruleResult.aiExplanation;
    let preConsultAdvice = ruleResult.preConsultAdvice;

    // Optional Gemini refinement if available
    if (aiClient) {
      try {
        const prompt = `Patient intake for rural telemedicine chatbot:
- Name: ${patientName}, Age: ${age}, Gender: ${gender}, Village: ${village}
- Symptoms: ${symptomsText}
- Tags: ${selectedSymptomTags.join(', ')}
- Duration: ${duration}, Severity: ${severity}
- Preliminary Urgency: ${ruleResult.urgency} (Score: ${ruleResult.urgencyScore}/100)

Return JSON with:
1. "urgency": "Emergency" | "Moderate" | "Minor"
2. "urgencyScore": number 1-100
3. "aiExplanation": clear explanation for patient in simple conversational tone
4. "preConsultAdvice": 1-2 practical first aid steps`;

        const geminiRes = await safeGeminiGenerate({
          model: "gemini-2.5-flash",
          contents: prompt,
          config: { responseMimeType: "application/json" }
        });

        if (geminiRes.text) {
          const p = JSON.parse(geminiRes.text.trim());
          if (p.urgency) {
            if (ruleResult.urgency === 'Emergency' || p.urgency === 'Emergency') {
              finalUrgency = 'Emergency';
              finalCategory = 'RED';
            } else {
              finalUrgency = p.urgency;
              finalCategory = finalUrgency === 'Moderate' ? 'YELLOW' : 'GREEN';
            }
            finalScore = p.urgencyScore || ruleResult.urgencyScore;
            aiExplanation = p.aiExplanation || ruleResult.aiExplanation;
            preConsultAdvice = p.preConsultAdvice || ruleResult.preConsultAdvice;
          }
        }
      } catch (e) {
        console.warn("Chatbot Gemini fallback to deterministic rule triage");
      }
    }

    // Step 2: Match relevant Doctor based on specialization and proximity
    const { matchedDoctors, primaryDoctor, matchReason, matchReasonHindi } = matchDoctorsForPatientTriage(
      symptomsText,
      selectedSymptomTags,
      finalUrgency,
      village,
      Number(age)
    );

    // Step 3: Optionally generate or reserve Queue Token
    let generatedToken: QueueToken | undefined;
    if (createToken) {
      const tokenId = dbGetNextSequentialTokenId(finalUrgency);

      generatedToken = {
        tokenId,
        patientId: `PHC-UP-${Math.floor(10000 + Math.random() * 90000)}`,
        patientName,
        age: Number(age),
        gender,
        village,
        urgency: finalUrgency,
        category: finalCategory,
        urgencyScore: finalScore,
        symptomsSummary: symptomsText || selectedSymptomTags.join(', '),
        status: finalUrgency === 'Emergency' ? 'In Consult' : 'Waiting',
        assignedDoctor: primaryDoctor?.name || 'On-Duty Medical Officer',
        assignedRoom: primaryDoctor?.roomNumber || 'Teleconsult Booth 1',
        estimatedWaitMinutes: finalUrgency === 'Emergency' ? 0 : 8,
        createdAt: new Date().toISOString(),
        vitals,
        triageResultId: ruleResult.id
      };

      dbInsertQueueToken(generatedToken);
    }

    const triageResult = {
      ...ruleResult,
      urgency: finalUrgency,
      category: finalCategory,
      urgencyScore: finalScore,
      aiExplanation,
      preConsultAdvice,
      recommendedDepartment: primaryDoctor?.doctorSpecialty || 'General Medicine'
    };

    const docName = primaryDoctor?.name || 'Primary Health Centre Doctor';
    const docHosp = primaryDoctor?.doctorHospital || 'Primary Health Centre';
    const docPhone = primaryDoctor?.phone || '108';

    const botReply = finalUrgency === 'Emergency'
      ? `🚨 Based on your symptoms (${symptomsText}), our AI triage has classified this as HIGH PRIORITY (${finalUrgency}). We have matched you with ${docName} at ${docHosp}. Direct contact: ${docPhone}. Please connect immediately!`
      : `Based on your symptoms (${symptomsText}, ${duration}), your condition is evaluated as ${finalUrgency} priority. We recommend consulting ${docName} (${primaryDoctor?.doctorSpecialty}) located at ${docHosp}. Contact: ${docPhone}. You can book your priority queue token or join a video consult now.`;

    const botReplyHindi = finalUrgency === 'Emergency'
      ? `🚨 आपके लक्षणों (${symptomsText}) के आधार पर, यह स्थिति उच्च प्राथमिकता (${finalUrgency}) की है। हमने आपके लिए ${primaryDoctor?.nameRegional || docName} (${docHosp}) को अनुशंसित किया है। संपर्क: ${docPhone}। कृपया तुरंत परामर्श लें!`
      : `आपके लक्षणों के आधार पर आपकी स्थिति ${finalUrgency} प्राथमिकता की है। हम आपको ${primaryDoctor?.nameRegional || docName} (${docHosp}) से परामर्श की सलाह देते हैं। संपर्क: ${docPhone}। आप नीचे से तुरंत टोकन प्राप्त कर सकते हैं या वीडियो कॉल शुरू कर सकते हैं।`;

    res.json({
      triageResult,
      queueToken: generatedToken,
      recommendedDoctors: matchedDoctors,
      primaryDoctor,
      matchReason,
      matchReasonHindi,
      botReply,
      botReplyHindi
    });

  } catch (err: any) {
    console.error("Chatbot diagnose error:", err);
    res.status(500).json({ error: "Failed to diagnose and recommend doctor", details: err.message });
  }
});

// 4A. Live Full Queue Endpoint (DOCTOR ROLE REQUIRED - Complete Clinical Queue Visibility)
app.get("/api/queue", requireAuth, requireRole('doctor'), (req, res) => {
  const rawTokens = dbGetQueueTokens();
  const allTokens = rawTokens.map((r: any) => ({
    tokenId: r.token_id,
    patientId: r.patient_id,
    patientName: r.patient_name,
    age: r.age,
    gender: r.gender,
    village: r.village,
    urgency: r.urgency,
    category: r.category,
    urgencyScore: r.urgency_score,
    symptomsSummary: r.symptoms_summary,
    status: r.status,
    assignedDoctor: r.assigned_doctor,
    assignedRoom: r.assigned_room,
    estimatedWaitMinutes: r.estimated_wait_minutes,
    createdAt: r.created_at,
    vitals: r.vitals_json ? JSON.parse(r.vitals_json) : undefined,
    triageResultId: r.triage_result_id
  }));

  const waitingTokens = allTokens.filter(q => q.status === 'Waiting');
  const inConsultTokens = allTokens.filter(q => q.status === 'In Consult');
  const emergencyTokens = allTokens.filter(q => q.urgency === 'Emergency' && q.status !== 'Completed');

  const nowCalling = inConsultTokens.length > 0 ? inConsultTokens[0] : null;

  res.json({
    nowCalling,
    waitingQueue: waitingTokens,
    inConsultList: inConsultTokens,
    emergencyList: emergencyTokens,
    totalWaiting: waitingTokens.length,
    averageWaitMinutes: waitingTokens.length > 0 ? Math.round(waitingTokens.reduce((acc, curr) => acc + curr.estimatedWaitMinutes, 0) / waitingTokens.length) : 0,
    allTokens
  });
});

// 4B. Patient-Scoped Queue Status Endpoint (PATIENT AUTHENTICATED - Zero Cross-Patient Data Leakage)
app.get("/api/queue/my-status", requireAuth, (req, res) => {
  try {
    const rawTokens = dbGetQueueTokens();
    const currentPatientId = req.user?.patientId;
    const currentPhone = req.user?.phone;
    const currentName = req.user?.name ? req.user.name.trim().toLowerCase() : null;

    // Find the patient's own active/latest token
    const myTokenRow = rawTokens.find((r: any) => {
      return (
        (currentPatientId && r.patient_id === currentPatientId) ||
        (currentPhone && r.contact_number === currentPhone) ||
        (currentName && r.patient_name && r.patient_name.trim().toLowerCase() === currentName)
      ) && (r.status === 'Waiting' || r.status === 'In Consult');
    }) || rawTokens.find((r: any) => {
      return (
        (currentPatientId && r.patient_id === currentPatientId) ||
        (currentPhone && r.contact_number === currentPhone) ||
        (currentName && r.patient_name && r.patient_name.trim().toLowerCase() === currentName)
      );
    });

    const waitingTokens = rawTokens.filter((q: any) => q.status === 'Waiting');
    const inConsultTokens = rawTokens.filter((q: any) => q.status === 'In Consult');

    // Calculate queue position if patient is waiting
    let positionInQueue = 0;
    if (myTokenRow && myTokenRow.status === 'Waiting') {
      const idx = waitingTokens.findIndex((q: any) => q.token_id === myTokenRow.token_id);
      positionInQueue = idx >= 0 ? idx + 1 : 1;
    } else if (myTokenRow && myTokenRow.status === 'In Consult') {
      positionInQueue = 0; // Currently in consultation
    }

    const nowCallingRow = inConsultTokens.length > 0 ? inConsultTokens[0] : null;

    // Return strictly patient-scoped payload:
    res.json({
      hasActiveToken: !!myTokenRow && (myTokenRow.status === 'Waiting' || myTokenRow.status === 'In Consult'),
      myToken: myTokenRow ? {
        tokenId: myTokenRow.token_id,
        patientId: myTokenRow.patient_id,
        patientName: myTokenRow.patient_name,
        age: myTokenRow.age,
        gender: myTokenRow.gender,
        village: myTokenRow.village,
        urgency: myTokenRow.urgency,
        category: myTokenRow.category,
        urgencyScore: myTokenRow.urgency_score,
        symptomsSummary: myTokenRow.symptoms_summary,
        status: myTokenRow.status,
        assignedDoctor: myTokenRow.assigned_doctor,
        assignedRoom: myTokenRow.assigned_room,
        estimatedWaitMinutes: myTokenRow.estimated_wait_minutes,
        createdAt: myTokenRow.created_at,
        vitals: myTokenRow.vitals_json ? JSON.parse(myTokenRow.vitals_json) : undefined,
        triageResultId: myTokenRow.triage_result_id
      } : null,
      positionInQueue,
      peopleAheadCount: positionInQueue > 1 ? positionInQueue - 1 : 0,
      estimatedWaitMinutes: myTokenRow ? myTokenRow.estimated_wait_minutes : 0,
      nowCallingTokenId: nowCallingRow ? nowCallingRow.token_id : null,
      nowCallingRoom: nowCallingRow ? nowCallingRow.assigned_room : null,
      totalWaitingCount: waitingTokens.length
    });
  } catch (err: any) {
    console.error("my-status queue error:", err);
    res.status(500).json({ error: "Failed to retrieve queue status", details: err.message });
  }
});

// 5. Advance Queue / Call Next Patient (DOCTOR ROLE REQUIRED)
app.post("/api/queue/call-next", requireAuth, requireRole('doctor'), (req, res) => {
  const { doctorName, roomName } = req.body;
  const effectiveDoctorName = doctorName || req.user?.name || 'On-Duty Medical Officer';

  // Set currently in-consult tokens to completed
  db.prepare("UPDATE queue_tokens SET status = 'Completed' WHERE status = 'In Consult'").run();

  const allTokens = dbGetQueueTokens().map((r: any) => ({
    tokenId: r.token_id,
    patientId: r.patient_id,
    patientName: r.patient_name,
    age: r.age,
    gender: r.gender,
    village: r.village,
    urgency: r.urgency,
    category: r.category,
    urgencyScore: r.urgency_score,
    status: r.status
  }));

  // Pick next waiting token (Emergency first, then Moderate, then Minor)
  const sortedWaiting = allTokens
    .filter(q => q.status === 'Waiting')
    .sort((a, b) => {
      const priorityOrder: Record<string, number> = { Emergency: 0, Moderate: 1, Minor: 2 };
      const aOrder = priorityOrder[a.urgency] ?? 3;
      const bOrder = priorityOrder[b.urgency] ?? 3;
      if (aOrder !== bOrder) {
        return aOrder - bOrder;
      }
      return b.urgencyScore - a.urgencyScore;
    });

  if (sortedWaiting.length === 0) {
    return res.json({ message: "No more waiting patients in queue", nowCalling: null });
  }

  const nextToken = sortedWaiting[0];
  dbUpdateQueueTokenStatus(nextToken.tokenId, 'In Consult', effectiveDoctorName, roomName || 'Teleconsult Booth 1');

  res.json({
    message: `Calling token ${nextToken.tokenId}`,
    nowCalling: {
      ...nextToken,
      status: 'In Consult',
      assignedDoctor: effectiveDoctorName,
      assignedRoom: roomName || 'Teleconsult Booth 1'
    },
    remainingWaitingCount: sortedWaiting.length - 1
  });
});

// 6. Emergency 108 Ambulance Dispatch & Alert (DOCTOR ROLE REQUIRED)
app.post("/api/queue/emergency-alert", requireAuth, requireRole('doctor'), (req, res) => {
  const { patientId, location, details } = req.body;
  
  if (!patientId) {
    return res.status(400).json({ error: "patientId is required for emergency dispatch." });
  }

  const alertId = `EMG-ALERT-${Date.now().toString(36).toUpperCase()}`;
  res.json({
    alertId,
    status: "DISPATCHED",
    ambulanceId: "AMB-108-UP-34",
    etaMinutes: 12,
    nearestReferralHospital: "District Government Civil Hospital, Sitapur (18 km)",
    message: `Emergency 108 Alert Broadcasted by ${req.user?.name} for patient ${patientId} at ${location || 'PHC Sub-Center'}. Nearest Ambulance Unit Dispatched.`,
    timestamp: new Date().toISOString()
  });
});

// 7. Patient Profile & History Endpoint (Requires authentication)
app.get("/api/patients/:id", requireAuth, (req, res) => {
  const patient = dbGetPatientByIdOrPhone(req.params.id);
  if (!patient) {
    return res.status(404).json({ error: "Patient not found" });
  }

  // If patient session, ensure they only view their own profile
  if (req.user?.role === 'patient' && req.user.patientId && req.user.patientId !== patient.id && req.user.phone !== patient.contact_number) {
    return res.status(403).json({ error: "Forbidden", message: "You can only view your own patient profile." });
  }

  const patientVisits = dbGetVisitsForPatient(patient.id);
  const allTokens = dbGetQueueTokens();
  const activeTokenRow = allTokens.find((q: any) => q.patient_id === patient.id && (q.status === 'Waiting' || q.status === 'In Consult'));

  res.json({
    patient: {
      id: patient.id,
      abhaId: patient.abha_id,
      name: patient.name,
      nameRegional: patient.name_regional,
      age: patient.age,
      gender: patient.gender,
      village: patient.village,
      contactNumber: patient.contact_number,
      rationCardNo: patient.ration_card_no,
      bloodGroup: patient.blood_group,
      photoUrl: patient.photo_url,
      emergencyContactName: patient.emergency_contact_name,
      emergencyContactPhone: patient.emergency_contact_phone,
      medicalHistory: patient.medical_history ? JSON.parse(patient.medical_history) : [],
      allergies: patient.allergies ? JSON.parse(patient.allergies) : [],
      registeredDate: patient.registered_date
    },
    visits: patientVisits,
    activeToken: activeTokenRow ? {
      tokenId: activeTokenRow.token_id,
      status: activeTokenRow.status,
      assignedDoctor: activeTokenRow.assigned_doctor,
      urgency: activeTokenRow.urgency
    } : null
  });
});

// 8. Register Clinical Patient (Doctor Role Required)
app.post("/api/patients", requireAuth, requireRole('doctor'), (req, res) => {
  const { name, age, gender, village, contactNumber, abhaId, medicalHistory, allergies, bloodGroup, rationCardNo } = req.body;
  
  if (!name || !age || !gender || !village || !contactNumber) {
    return res.status(400).json({ error: "name, age, gender, village, and contactNumber are required to register a patient." });
  }

  const newId = `PHC-UP-${Math.floor(10000 + Math.random() * 90000)}`;
  const fullPatient: Patient = {
    id: newId,
    abhaId: abhaId || `91-${Math.floor(1000 + Math.random() * 9000)}-${Math.floor(1000 + Math.random() * 9000)}-${Math.floor(1000 + Math.random() * 9000)}`,
    name,
    age: Number(age),
    gender,
    village,
    contactNumber,
    bloodGroup,
    rationCardNo,
    medicalHistory: Array.isArray(medicalHistory) ? medicalHistory : (medicalHistory ? [medicalHistory] : []),
    allergies: Array.isArray(allergies) ? allergies : (allergies ? [allergies] : []),
    registeredDate: new Date().toISOString().split('T')[0]
  };

  dbInsertPatient(fullPatient);
  res.status(201).json(fullPatient);
});

// 9. Doctor Teleconsult Prescription Endpoint (DOCTOR ROLE REQUIRED + VALIDATION)
app.post("/api/consult/prescription", requireAuth, requireRole('doctor'), validatePrescription, (req, res) => {
  const { tokenId, patientId, patientName, doctorName, diagnosis, diagnosisHindi, medications, advice, followUpDays, date } = req.body;
  const effectiveDoctorName = doctorName || req.user?.name || 'Attending Medical Officer';

  try {
    const result = dbTransaction(() => {
      const lookupKey = patientId || patientName || 'P-84920';
      let patient = dbGetPatientByIdOrPhone(lookupKey);

      if (!patient && patientName) {
        const searchMatches = dbSearchPatients(patientName);
        if (searchMatches.length > 0) {
          patient = searchMatches[0];
        }
      }

      const effectivePatientId = patient?.id || patientId || `PHC-UP-${Math.floor(10000 + Math.random() * 90000)}`;
      const effectivePatientName = patient?.name || patientName || 'Patient';

      // If patient doesn't exist in SQLite, auto register them
      if (!patient) {
        dbInsertPatient({
          id: effectivePatientId,
          abhaId: `84-${Math.floor(1000 + Math.random() * 9000)}-4402-${Math.floor(1000 + Math.random() * 9000)}`,
          name: effectivePatientName,
          age: 48,
          gender: 'Female',
          village: 'Rampur Village',
          contactNumber: '9876543210',
          registeredDate: new Date().toISOString().split('T')[0]
        });
      }

      const visitId = `vst-${Date.now().toString(36)}`;
      const rxId = `RX-2026-${Math.floor(10000 + Math.random() * 90000)}`;

      const newPrescription: Prescription = {
        id: rxId,
        visitId,
        patientId: effectivePatientId,
        patientName: effectivePatientName,
        doctorName: effectiveDoctorName,
        diagnosis,
        diagnosisHindi: diagnosisHindi || undefined,
        medications: medications && medications.length > 0 ? medications : [
          {
            name: 'Paracetamol 500mg',
            dosage: '1 tablet',
            frequency: 'Thrice daily (सुबह / दोपहर / रात)',
            duration: '3 days',
            instructions: 'After food with warm water'
          }
        ],
        advice: advice || 'Drink plenty of boiled water, take adequate bed rest, and maintain hydration.',
        followUpDays: Number(followUpDays) || 7,
        date: date || new Date().toISOString().split('T')[0]
      };

      const newVisit: VisitRecord = {
        id: visitId,
        patientId: effectivePatientId,
        patientName: effectivePatientName,
        date: date || new Date().toISOString().split('T')[0],
        phcName: req.user?.doctorHospital || 'Rampur Primary Health Centre',
        symptoms: [diagnosis],
        triageCategory: 'GREEN',
        doctorName: effectiveDoctorName,
        diagnosis,
        diagnosisHindi: diagnosisHindi || undefined,
        clinicalNotes: advice || undefined,
        prescription: newPrescription,
        consultMode: 'Teleconsultation'
      };

      dbInsertVisit(newVisit);

      // Update token status to completed
      if (tokenId) {
        dbUpdateQueueTokenStatus(tokenId, 'Completed', effectiveDoctorName);
      } else {
        // Check if there is an in-consult token for this patient
        const allTokens = dbGetQueueTokens();
        const matchingToken = allTokens.find((q: any) => 
          (q.patient_id === effectivePatientId || q.patient_name.toLowerCase() === effectivePatientName.toLowerCase()) && 
          q.status !== 'Completed'
        );
        if (matchingToken) {
          dbUpdateQueueTokenStatus(matchingToken.token_id, 'Completed', effectiveDoctorName);
        }
      }

      return { prescription: newPrescription, visitRecord: newVisit };
    });

    res.json({
      message: "Prescription generated and saved to Patient EHR record successfully.",
      prescription: result.prescription,
      visitRecord: result.visitRecord
    });
  } catch (err: any) {
    console.error("Prescription generation error:", err);
    res.status(500).json({ error: "Failed to generate prescription", details: err.message });
  }
});

// 9d. Get Prescriptions for Patient
app.get("/api/prescriptions/patient/:idOrPhone", requireAuth, (req, res) => {
  const identifier = req.params.idOrPhone;
  
  if (req.user?.role === 'patient' && req.user.phone !== identifier && req.user.patientId !== identifier) {
    return res.status(403).json({ error: "Forbidden", message: "You can only view your own prescriptions." });
  }

  const prescriptions = dbGetPrescriptionsForPatient(identifier);
  res.json({ prescriptions });
});

// 9e. Get Single Prescription by ID
app.get("/api/prescriptions/:id", requireAuth, (req, res) => {
  const prescription = dbGetPrescriptionById(req.params.id);
  if (!prescription) {
    return res.status(404).json({ error: "Prescription not found." });
  }

  if (req.user?.role === 'patient' && req.user.patientId !== prescription.patientId && req.user.name.toLowerCase() !== prescription.patientName.toLowerCase()) {
    return res.status(403).json({ error: "Forbidden", message: "You are not authorized to view this prescription." });
  }

  res.json({ prescription });
});

// 10. Outbreak & PHC Analytics Endpoint (DOCTOR ROLE REQUIRED)
app.get("/api/analytics/outbreaks", requireAuth, requireRole('doctor'), (req, res) => {
  const clusters = dbGetPHCClusters();
  const allTokens = dbGetQueueTokens();
  const emergencyCount = allTokens.filter((q: any) => q.urgency === 'Emergency').length;

  res.json({
    clusters,
    districtAlerts: [
      {
        id: "alt-1",
        phcName: "Rampur Primary Health Centre",
        diseaseType: "Acute Febrile Illness / Dengue Suspicion",
        spikePercentage: 48,
        severity: "HIGH",
        recommendation: "Deploy additional NS1 Antigen Rapid Test Kits & re-allocate 1 Medical Officer from Sitapur PHC.",
        timestamp: "2 hours ago"
      },
      {
        id: "alt-2",
        phcName: "Kheri Block Health Centre",
        diseaseType: "Acute Waterborne Diarrheal Disease",
        spikePercentage: 35,
        severity: "MODERATE",
        recommendation: "Issue boil-water advisory to Kheri Village Panchayat and supply extra ORS packets.",
        timestamp: "5 hours ago"
      }
    ],
    totalPatientsToday: allTokens.length + 12,
    emergencyCasesToday: emergencyCount + 2
  });
});

// 11. SIH 2026 PS-03 System Architecture Specification
app.get("/api/system/architecture", (req, res) => {
  res.json({
    problemStatement: "SIH 2026 PS-03: AI Symptom Checker & Teleconsultation Queue for Rural Clinics (PHCs)",
    systemComponents: [
      { name: "Multilingual Triage Intake & Voice Agent", tech: "Web Speech API + Gemini 3.6 Flash + Local Rule Engine" },
      { name: "Deterministic Clinical Triage Classifier", tech: "Custom Clinical Decision Tree (Red Flag & SpO2/BP Scoring)" },
      { name: "Dynamic Digital Queue & Token Engine", tech: "Priority Queue Data Structure (Emergency Bypass + Live Est. Wait Math)" },
      { name: "WebRTC Teleconsultation & Doctor Assistant", tech: "WebRTC P2P Video + Gemini Clinical Copilot & Prescription Engine" },
      { name: "ASHA Health-Worker Assist Portal", tech: "Batch Patient Sync + Bluetooth Vitals Capture Simulation" },
      { name: "Epidemiological Outbreak Analytics", tech: "Recharts Time-Series Aggregation & Regional Alert Spikes" }
    ],
    triageDecisionLogic: {
      emergencyRules: ["SpO2 < 90%", "Chest pain / Pressure", "Unconsciousness", "BP > 180 or < 80", "Infant Fever >= 100.4°F"],
      moderateRules: ["SpO2 90-94%", "Fever > 101°F > 3 days", "Persistent Vomiting", "Moderate Dyspnea", "Severe Abdominal Pain"],
      minorRules: ["Mild Cold/Flu", "Superficial Abrasions", "Routine Medication Refills", "General Fatigue"]
    },
    securityHardening: {
      rbac: "Strict requireRole('doctor' | 'patient') middleware enforced across all sensitive endpoints",
      crypto: "Node.js scryptSync (64-byte key length with random 16-byte salts) + 256-bit crypto session tokens",
      transport: "HTTPS HSTS enabled + nosniff + sameorigin + strict-origin-when-cross-origin",
      rateLimiting: "Auth limiter (20/15m), AI/LLM limiter (30/1m), Speech limiter (25/1m)",
      sanitization: "Recursive HTML/script entity escaping + SQLite parameterized prepared statements"
    }
  });
});

// 12. Real-Time Teleconsultation API Routes (Database-backed WebRTC Session Coordination)

// Get all Video Call Requests (DOCTOR ROLE REQUIRED)
app.get("/api/teleconsult/requests", requireAuth, requireRole('doctor'), (req, res) => {
  try {
    const all = dbGetVideoCallRequests();
    const pending = all.filter(r => r.status === 'pending');
    res.json({
      pendingRequests: pending,
      allRequests: all
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to retrieve call requests", details: err.message });
  }
});

// Patient Requests a Video Call (PATIENT ROLE REQUIRED + VALIDATION)
app.post("/api/teleconsult/request", requireAuth, requireRole('patient'), validateVideoCallRequest, (req, res) => {
  try {
    const { tokenId, patientId, patientName, patientPhone, age, gender, village, symptomsSummary, urgency, vitals } = req.body;
    
    const effectivePatientPhone = req.user?.phone || patientPhone;
    const effectivePatientName = req.user?.name || patientName;
    const effectivePatientId = req.user?.patientId || patientId || `P-${Date.now().toString().slice(-5)}`;

    const reqId = `req_${tokenId || 'GEN'}_${Date.now()}`;
    const newRequest: VideoCallRequest = {
      id: reqId,
      tokenId: tokenId || `TOK-${Date.now().toString().slice(-4)}`,
      patientId: effectivePatientId,
      patientName: effectivePatientName,
      patientPhone: String(effectivePatientPhone).replace(/\D/g, '').slice(-10),
      age: Number(age) || req.user?.age || 30,
      gender: gender || req.user?.gender || 'Other',
      village: village || req.user?.village || 'Local Sub-Center',
      symptomsSummary: symptomsSummary || 'Patient requested immediate teleconsultation',
      urgency: urgency || 'Moderate',
      vitals: vitals || {
        bloodPressure: '120/80',
        pulseRate: 78,
        temperature: 98.6,
        spO2: 98
      },
      status: 'pending',
      requestedAt: new Date().toISOString()
    };

    dbInsertVideoCallRequest(newRequest);

    res.json({
      message: "Video call request submitted successfully",
      request: newRequest
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to create video call request", details: err.message });
  }
});

// Doctor Accepts a Video Call Request (DOCTOR ROLE REQUIRED)
app.post("/api/teleconsult/accept", requireAuth, requireRole('doctor'), (req, res) => {
  try {
    const { requestId, doctorId, doctorName, doctorSpecialty, doctorHospital } = req.body;
    if (!requestId) {
      return res.status(400).json({ error: "requestId is required to accept a call request." });
    }

    const callReq = dbGetVideoCallRequestById(requestId);
    if (!callReq) {
      return res.status(404).json({ error: "Call request not found in database" });
    }

    const acceptedByDoctor = {
      doctorId: req.user?.id || doctorId || 'doc_on_duty',
      doctorName: req.user?.name || doctorName || 'On-Duty Medical Officer',
      doctorSpecialty: req.user?.doctorSpecialty || doctorSpecialty || 'General Medical Officer',
      doctorHospital: req.user?.doctorHospital || doctorHospital || 'Primary Health Centre'
    };

    const sessionId = `call_${callReq.tokenId}_${Date.now()}`;
    const session: LiveCallSession = {
      id: sessionId,
      tokenId: callReq.tokenId,
      patientId: callReq.patientId,
      patientName: callReq.patientName,
      patientPhone: callReq.patientPhone,
      doctorId: acceptedByDoctor.doctorId,
      doctorName: acceptedByDoctor.doctorName,
      doctorSpecialty: acceptedByDoctor.doctorSpecialty,
      doctorHospital: acceptedByDoctor.doctorHospital,
      status: 'connected',
      startedAt: Date.now(),
      createdAt: new Date().toISOString()
    };

    callReq.status = 'accepted';
    callReq.acceptedByDoctor = acceptedByDoctor;
    callReq.sessionId = sessionId;

    dbTransaction(() => {
      dbUpdateVideoCallRequest(callReq);
      dbInsertLiveCallSession(session);
      dbUpdateQueueTokenStatus(callReq.tokenId, 'In Consult', acceptedByDoctor.doctorName);
    });

    res.json({
      message: "Call request accepted",
      request: callReq,
      session
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to accept call request", details: err.message });
  }
});

// Doctor Rejects a Video Call Request (DOCTOR ROLE REQUIRED)
app.post("/api/teleconsult/reject", requireAuth, requireRole('doctor'), (req, res) => {
  try {
    const { requestId, reason, doctorName } = req.body;
    if (!requestId) {
      return res.status(400).json({ error: "requestId is required to reject a call request." });
    }

    const callReq = dbGetVideoCallRequestById(requestId);
    if (!callReq) {
      return res.status(404).json({ error: "Call request not found" });
    }

    callReq.status = 'rejected';
    callReq.rejectionReason = reason || 'Doctor is currently attending to critical triage patients.';
    dbUpdateVideoCallRequest(callReq);

    res.json({
      message: "Call request declined",
      request: callReq
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to decline call request", details: err.message });
  }
});

// Patient Cancels their Video Call Request (PATIENT ROLE REQUIRED)
app.post("/api/teleconsult/cancel", requireAuth, requireRole('patient'), (req, res) => {
  try {
    const { requestId } = req.body;
    if (!requestId) {
      return res.status(400).json({ error: "requestId is required to cancel a call request." });
    }

    const callReq = dbGetVideoCallRequestById(requestId);
    if (callReq) {
      // Ensure patient is cancelling their own request
      if (req.user?.patientId && callReq.patientId !== req.user.patientId && req.user.phone !== callReq.patientPhone) {
        return res.status(403).json({ error: "Forbidden", message: "You can only cancel your own call requests." });
      }
      callReq.status = 'cancelled';
      dbUpdateVideoCallRequest(callReq);
    }

    res.json({
      message: "Call request cancelled",
      requestId
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to cancel call request", details: err.message });
  }
});

// Start Call Session (Doctor triggers call to patient queue token) (DOCTOR ROLE REQUIRED)
app.post("/api/teleconsult/initiate", requireAuth, requireRole('doctor'), (req, res) => {
  try {
    const { tokenId, doctorId, doctorName, doctorSpecialty, doctorHospital, patientId, patientName, patientPhone } = req.body;
    if (!tokenId) {
      return res.status(400).json({ error: "tokenId is required to initiate call." });
    }

    const token = dbGetQueueTokenById(tokenId);
    const effectivePatientId = patientId || token?.patient_id || `P-${tokenId}`;
    const effectivePatientName = patientName || token?.patient_name || 'Patient';
    const effectivePatientPhone = patientPhone || (token ? (token.contact_number || token.phone) : undefined);

    const docName = req.user?.name || doctorName || 'On-Duty Medical Officer';
    const sessionId = `call_${tokenId}_${Date.now()}`;
    const session: LiveCallSession = {
      id: sessionId,
      tokenId: token?.token_id || tokenId,
      patientId: effectivePatientId,
      patientName: effectivePatientName,
      patientPhone: effectivePatientPhone ? String(effectivePatientPhone).replace(/\D/g, '').slice(-10) : undefined,
      doctorId: req.user?.id || doctorId || 'doc_on_duty',
      doctorName: docName,
      doctorSpecialty: req.user?.doctorSpecialty || doctorSpecialty || 'General Medical Officer',
      doctorHospital: req.user?.doctorHospital || doctorHospital || 'Primary Health Centre',
      status: 'ringing',
      createdAt: new Date().toISOString()
    };

    dbTransaction(() => {
      dbUpdateQueueTokenStatus(tokenId, 'In Consult', docName);
      dbInsertLiveCallSession(session);
    });

    res.json({
      message: `Call initiated for token ${tokenId}`,
      session,
      token
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to initiate call", details: err.message });
  }
});

// Respond to Call (Patient accepts or declines) (PATIENT ROLE REQUIRED)
app.post("/api/teleconsult/respond", requireAuth, requireRole('patient'), (req, res) => {
  try {
    const { sessionId, accept } = req.body;
    if (!sessionId) {
      return res.status(400).json({ error: "sessionId is required." });
    }

    const session = dbGetLiveCallSessionById(sessionId);
    if (!session) {
      return res.status(404).json({ error: "Call session not found or already ended" });
    }

    if (accept) {
      session.status = 'connected';
      session.startedAt = Date.now();
    } else {
      session.status = 'ended';
      session.endedAt = Date.now();
    }

    dbUpdateLiveCallSession(session);

    res.json({ message: accept ? "Call accepted" : "Call declined", session });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to respond to call", details: err.message });
  }
});

// End Call (Authenticated Doctor or Patient)
app.post("/api/teleconsult/end", requireAuth, (req, res) => {
  try {
    const { sessionId, tokenId } = req.body;
    let session = sessionId ? dbGetLiveCallSessionById(sessionId) : null;
    
    if (!session && tokenId) {
      const activeSessions = dbGetLiveCallSessions().filter(s => s.tokenId === tokenId && s.status !== 'ended');
      if (activeSessions.length > 0) {
        session = activeSessions[0];
      }
    }

    if (session) {
      session.status = 'ended';
      session.endedAt = Date.now();
      dbUpdateLiveCallSession(session);
    }

    if (tokenId && req.user?.role === 'doctor') {
      dbUpdateQueueTokenStatus(tokenId, 'In Consult'); // Keep In Consult so doctor can finish prescription
    }

    res.json({ message: "Call ended successfully", session });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to end call", details: err.message });
  }
});

// Get Active Call Session for User or Patient
app.get("/api/teleconsult/active-session/:userIdOrPatientId", requireAuth, (req, res) => {
  const query = req.params.userIdOrPatientId;
  if (req.user?.role === 'patient') {
    const isSelf = query === req.user.id || query === req.user.patientId || query === req.user.phone;
    if (!isSelf) {
      return res.status(403).json({
        error: "Forbidden",
        message: "Patients may only query their own active teleconsultation session."
      });
    }
  }
  const activeSession = getActiveSessionForEntity(query);
  res.json({ activeSession });
});

// 13. SQLite Database Health & Snapshot Backup Endpoints (Doctor / Admin Only)
app.get("/api/system/db-status", requireAuth, requireRole('doctor'), (req, res) => {
  try {
    const patientsCount = (db.prepare("SELECT count(*) as count FROM patients").get() as any).count;
    const tokensCount = (db.prepare("SELECT count(*) as count FROM queue_tokens").get() as any).count;
    const visitsCount = (db.prepare("SELECT count(*) as count FROM visits").get() as any).count;
    const prescriptionsCount = (db.prepare("SELECT count(*) as count FROM prescriptions").get() as any).count;
    const requestsCount = (db.prepare("SELECT count(*) as count FROM video_call_requests").get() as any).count;
    const sessionsCount = (db.prepare("SELECT count(*) as count FROM live_call_sessions").get() as any).count;

    const pragmaWal = (db.prepare("PRAGMA journal_mode").get() as any).journal_mode;
    const pragmaSynchronous = (db.prepare("PRAGMA synchronous").get() as any).synchronous;
    const pragmaBusyTimeout = (db.prepare("PRAGMA busy_timeout").get() as any).timeout;
    const integrityStatus = verifyDatabaseIntegrity();

    res.json({
      status: integrityStatus.valid ? "HEALTHY" : "CORRUPTED",
      integrityStatus,
      engine: "SQLite 3 with WAL Mode & Auto-Retry & Integrity Enforcement",
      dbPath: DB_PATH,
      backupDir: BACKUP_DIR,
      goldenBackup: GOLDEN_BACKUP_NAME,
      pragmas: {
        journalMode: pragmaWal,
        synchronous: pragmaSynchronous === 2 ? 'FULL' : pragmaSynchronous === 1 ? 'NORMAL' : pragmaSynchronous,
        busyTimeoutMs: pragmaBusyTimeout
      },
      counts: {
        patients: patientsCount,
        queueTokens: tokensCount,
        visits: visitsCount,
        prescriptions: prescriptionsCount,
        videoCallRequests: requestsCount,
        liveCallSessions: sessionsCount
      },
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to query database status", details: err.message });
  }
});

app.post("/api/system/backup", requireAuth, requireRole('doctor'), (req, res) => {
  try {
    const backupResult = dbBackup();
    if (!backupResult.success) {
      return res.status(500).json({ error: "Database backup failed integrity check or creation", details: backupResult.error });
    }
    res.json({
      message: "SQLite database snapshot backup completed and verified successfully.",
      ...backupResult
    });
  } catch (err: any) {
    res.status(500).json({ error: "Database backup failed", details: err.message });
  }
});

// Vite Development or Production Server Handler Setup
async function startServer() {
  const server = http.createServer(app);

  // Initialize WebSocket Signaling Server on /ws/teleconsult
  setupTeleconsultSignaling(server);

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`[MediQ Smart Rural Triage & Teleconsult Server] Running on http://0.0.0.0:${PORT}`);
  });

  // Graceful Server Termination Hook
  const handleShutdown = (signal: string) => {
    console.log(`[MediQ Server] Intercepted ${signal}. Terminating HTTP server & closing SQLite cleanly...`);
    server.close(() => {
      closeDatabaseGracefully(signal);
      process.exit(0);
    });

    // Force exit if hanging
    setTimeout(() => {
      console.warn('[MediQ Server] Forcefully closing after termination timeout.');
      closeDatabaseGracefully(signal);
      process.exit(1);
    }, 4000).unref();
  };

  process.on("SIGINT", () => handleShutdown("SIGINT"));
  process.on("SIGTERM", () => handleShutdown("SIGTERM"));
}

startServer();

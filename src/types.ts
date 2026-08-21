export type TriageUrgency = 'Emergency' | 'Moderate' | 'Minor';
export type TriageCategory = 'RED' | 'YELLOW' | 'GREEN';
export type AppLanguage = 'en' | 'hi' | 'ta' | 'te' | 'mr' | 'bn';
export type UserRole = 'patient' | 'doctor';
export type UserRoleMode = 'patient' | 'doctor' | 'asha' | 'queue' | 'analytics';

export interface AppUser {
  id: string;
  name: string;
  nameRegional?: string;
  phone: string;
  role: UserRole;
  patientId?: string;
  abhaId?: string;
  age?: number;
  gender?: 'Male' | 'Female' | 'Other';
  village?: string;
  doctorSpecialty?: string;
  doctorHospital?: string;
  token?: string;
}

export interface Vitals {
  spO2?: number; // %
  systolicBP?: number; // mmHg
  diastolicBP?: number; // mmHg
  temperature?: number; // °F
  pulseRate?: number; // bpm
  respiratoryRate?: number; // breaths/min
}

export interface Patient {
  id: string; // e.g. PHC-UP-84920
  abhaId?: string; // ABHA Health ID e.g. 84-9201-4402-9182
  name: string;
  nameRegional?: string;
  age: number;
  gender: 'Male' | 'Female' | 'Other';
  village: string;
  contactNumber: string;
  rationCardNo?: string;
  bloodGroup?: string;
  photoUrl?: string;
  thumbprintId?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  medicalHistory: string[];
  allergies?: string[];
  registeredDate: string;
}

export interface RedFlagRule {
  id: string;
  symptom: string;
  description: string;
  severity: TriageUrgency;
}

export interface TriageRequest {
  patientId?: string;
  patientName: string;
  age: number;
  gender: string;
  village?: string;
  contactNumber?: string;
  abhaId?: string;
  symptomsText: string;
  symptoms?: string[];
  selectedSymptomTags: string[];
  vitals?: Vitals;
  language?: AppLanguage;
  enteredBy: 'Self' | 'ASHA Worker' | 'Clinic Desk';
  offlineCached?: boolean;
  assignedDoctor?: string;
  assignedRoom?: string;
  doctorId?: string;
  doctorSpecialty?: string;
}

export interface TriageResult {
  id: string;
  urgency: TriageUrgency;
  category: TriageCategory;
  urgencyScore: number; // 1-100
  redFlagsDetected: string[];
  summary: string;
  summaryHindi?: string;
  aiExplanation: string;
  recommendedDepartment: string;
  recommendedDepartmentHindi?: string;
  preConsultAdvice: string;
  preConsultAdviceHindi?: string;
  audioPromptText?: string;
  language: AppLanguage;
  timestamp: string;
}

export interface QueueToken {
  tokenId: string; // e.g. EMG-001, MOD-014, MIN-028
  patientId: string;
  patientName: string;
  age: number;
  gender: string;
  village: string;
  urgency: TriageUrgency;
  category: TriageCategory;
  urgencyScore: number;
  symptomsSummary: string;
  status: 'Waiting' | 'In Consult' | 'Completed' | 'Escalated' | 'Cancelled';
  assignedDoctor: string;
  assignedRoom: string;
  estimatedWaitMinutes: number;
  createdAt: string;
  calledAt?: string;
  vitals?: Vitals;
  triageResultId: string;
  smsSent?: boolean;
  offlineCreated?: boolean;
}

export interface OfflineSyncItem {
  id: string;
  timestamp: string;
  type: 'triage' | 'registration' | 'vitals';
  patientName: string;
  village: string;
  tokenId?: string;
  data: any;
  status: 'pending' | 'synced' | 'failed';
}

export interface Prescription {
  id: string;
  visitId: string;
  patientId: string;
  patientName: string;
  doctorName: string;
  diagnosis: string;
  diagnosisHindi?: string;
  medications: Array<{
    name: string;
    dosage: string;
    frequency: string;
    frequencyVisual?: string; // e.g. ☀️ 1 / 🌙 1
    duration: string;
    instructions: string;
  }>;
  advice: string;
  followUpDays: number;
  date: string;
}

export interface ChronicConditionAlert {
  id: string;
  conditionName: string;
  conditionNameHindi?: string;
  category: 'Cardiovascular' | 'Metabolic' | 'Respiratory' | 'Renal' | 'Hematology' | 'General';
  severity: 'Critical' | 'Warning' | 'Routine' | 'Good';
  diagnosedDate: string;
  lastCheckedDate: string;
  nextFollowUpDate: string;
  primaryMetric: {
    label: string;
    lastValue: string;
    targetRange: string;
    status: 'Optimal' | 'Borderline' | 'Elevated' | 'High';
  };
  clinicalAlert: string;
  clinicalAlertHindi?: string;
  actionRequired: string;
  actionRequiredHindi?: string;
  lifestyleGuidance: string[];
  redFlagWarning: string;
  activeMedications: string[];
  refillDueDays?: number;
}

export interface VitalLogEntry {
  id: string;
  date: string;
  timestamp: string;
  systolicBP?: number;
  diastolicBP?: number;
  bloodSugarFasting?: number;
  bloodSugarPostMeal?: number;
  spO2?: number;
  pulseRate?: number;
  temperature?: number;
  weightKg?: number;
  notes?: string;
}

export interface VisitRecord {
  id: string;
  patientId: string;
  patientName: string;
  date: string;
  phcName: string;
  symptoms: string[];
  triageCategory: TriageCategory;
  vitals?: Vitals;
  doctorName: string;
  doctorSpecialty?: string;
  diagnosis?: string;
  diagnosisHindi?: string;
  clinicalNotes?: string;
  prescription?: Prescription;
  consultMode: 'In-Person' | 'Teleconsultation' | 'Emergency Referral';
}

export interface PHCClusterData {
  phcId: string;
  name: string;
  district: string;
  activeDoctors: number;
  currentQueueLength: number;
  emergencyCount: number;
  outbreakRisk: 'Low' | 'Moderate' | 'High' | 'Severe';
  topSymptom: string;
  feverTrend: number[]; // 7-day trend
  gastroTrend: number[];
  respiratoryTrend: number[];
}

export interface VoiceParseResponse {
  extractedSymptoms: string[];
  rawText: string;
  duration?: string;
  severitySelfReported?: string;
  detectedLanguage: string;
  confidence: number;
}

export interface SymptomIconDefinition {
  id: string;
  icon: string;
  labelEn: string;
  labelHi: string;
  labelRegional?: string;
  audioPromptEn: string;
  audioPromptHi: string;
  bodyZone: 'head' | 'chest' | 'abdomen' | 'limbs' | 'general';
  tags: string[];
  severityDefault: 'Low' | 'Medium' | 'High';
  color: string;
}

export interface DoctorProfile {
  id: string;
  name: string;
  nameRegional?: string;
  phone: string;
  doctorSpecialty: string;
  doctorSpecialtyCategory: 'Cardiology' | 'Pulmonology' | 'General Medicine' | 'Gastroenterology' | 'Orthopedics' | 'Pediatrics' | 'Gynecology' | 'ENT' | 'Emergency Medicine';
  doctorHospital: string;
  locationArea: string;
  distanceKm?: number;
  availableStatus: 'Online Now' | 'In Clinic' | 'On Call';
  experienceYears: number;
  rating: number;
  consultationFee: string;
  roomNumber: string;
  avatarEmoji?: string;
}

export interface ChatbotMessage {
  id: string;
  sender: 'bot' | 'user' | 'system';
  text: string;
  textHindi?: string;
  options?: Array<{ label: string; value: string; isRedFlag?: boolean }>;
  triageResult?: TriageResult;
  recommendedDoctors?: DoctorProfile[];
  timestamp: string;
  stage?: 'greeting' | 'symptoms' | 'duration' | 'severity' | 'vitals' | 'completed';
}

export interface ChatbotRecommendationResponse {
  triageResult: TriageResult;
  queueToken?: QueueToken;
  recommendedDoctors: DoctorProfile[];
  primaryDoctor: DoctorProfile;
  botReply: string;
  botReplyHindi?: string;
}

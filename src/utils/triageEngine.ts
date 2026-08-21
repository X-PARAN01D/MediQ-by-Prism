import { TriageRequest, TriageResult, TriageUrgency, TriageCategory, Vitals } from '../types';

export const RED_FLAG_SYMPTOMS = [
  'chest pain',
  'severe shortness of breath',
  'breathing difficulty',
  'unconscious',
  'unresponsive',
  'severe bleeding',
  'head trauma',
  'stroke symptoms',
  'slurred speech',
  'facial drooping',
  'stiff neck with high fever',
  'anaphylaxis',
  'severe allergic reaction',
  'cyanosis',
  'bluish lips',
  'seizure',
  'convulsion',
  'spo2 < 90',
  'high fever in infant',
  'poisoning'
];

export const MODERATE_SYMPTOMS = [
  'high fever',
  'persistent cough',
  'moderate abdominal pain',
  'frequent vomiting',
  'diarrhea',
  'dehydration',
  'suspected fracture',
  'deep laceration',
  'spo2 90-94',
  'burning micturition',
  'flank pain',
  'severe headache',
  'dizziness',
  'ear pain with discharge'
];

/**
 * Decodes HTML entities and normalizes clinical comparison symbols and whitespace
 */
export function normalizeClinicalText(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';
  return raw
    // Decode HTML entity encodings
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&le;/gi, '<=')
    .replace(/&ge;/gi, '>=')
    .replace(/&#60;/g, '<')
    .replace(/&#62;/g, '>')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    // Standardize comparison operators spacing (e.g. "spo2<90" -> "spo2 < 90")
    .replace(/([a-zA-Z0-9%])\s*<=\s*([0-9])/g, '$1 <= $2')
    .replace(/([a-zA-Z0-9%])\s*>=\s*([0-9])/g, '$1 >= $2')
    .replace(/([a-zA-Z0-9%])\s*<\s*([0-9])/g, '$1 < $2')
    .replace(/([a-zA-Z0-9%])\s*>\s*([0-9])/g, '$1 > $2')
    // Normalize multiple spaces
    .replace(/\s+/g, ' ')
    .trim();
}

export function evaluateRuleBasedTriage(request: TriageRequest): TriageResult {
  const rawTags = request.selectedSymptomTags || [];
  const rawText = request.symptomsText || (request.symptoms ? request.symptoms.join(' ') : '') || '';
  
  // Normalize text to decode entities (&lt; -> <) and uniform spacing
  const normalizedText = normalizeClinicalText(rawText);
  const normalizedTags = rawTags.map(t => normalizeClinicalText(t));
  
  const textLower = (normalizedText + ' ' + normalizedTags.join(' ')).toLowerCase();
  // Also create a space-normalized comparison string
  const textNormalizedLower = textLower
    .replace(/\s*<\s*/g, ' < ')
    .replace(/\s*>\s*/g, ' > ')
    .replace(/\s+/g, ' ');

  const vitals: Vitals = request.vitals || {};

  const redFlags: string[] = [];
  let score = 20; // baseline

  // Check explicit red flag symptom keywords
  RED_FLAG_SYMPTOMS.forEach(rf => {
    const rfLower = rf.toLowerCase();
    if (textLower.includes(rfLower) || textNormalizedLower.includes(rfLower)) {
      redFlags.push(`Critical Symptom: ${rf.toUpperCase()}`);
      score += 45;
    }
  });

  // Dynamic clinical pattern detection in free-text (e.g. "Patient SpO2 < 90", "SpO2 <= 88%", "Oxygen 85%")
  if (!redFlags.some(rf => rf.toLowerCase().includes('spo2'))) {
    const spo2TextMatch = textNormalizedLower.match(/(?:spo2|o2|oxygen|saturation)[^\d<>=]*([<>]|<=|>=)?\s*(\d{1,2})%?/i);
    if (spo2TextMatch) {
      const op = spo2TextMatch[1];
      const val = parseInt(spo2TextMatch[2], 10);
      if (!isNaN(val)) {
        if ((op === '<' || op === '<=') && val <= 90) {
          redFlags.push(`Critical Symptom: LOW SPO2 (<90%)`);
          score += 45;
        } else if (!op && val < 90) {
          redFlags.push(`Critical Symptom: LOW SPO2 (${val}%)`);
          score += 45;
        }
      }
    }
  }

  // Check Vitals for Emergency Red Flags
  if (vitals.spO2 !== undefined && vitals.spO2 > 0) {
    if (vitals.spO2 < 90) {
      redFlags.push(`Critical Vitals: Low SpO2 (${vitals.spO2}%) < 90%`);
      score += 50;
    } else if (vitals.spO2 < 94) {
      score += 25;
    }
  }

  if (vitals.systolicBP !== undefined && vitals.systolicBP > 0) {
    if (vitals.systolicBP > 180 || vitals.systolicBP < 80) {
      redFlags.push(`Critical Vitals: Abnormal Systolic BP (${vitals.systolicBP} mmHg)`);
      score += 40;
    } else if (vitals.systolicBP > 140 || vitals.systolicBP < 90) {
      score += 15;
    }
  }

  if (vitals.temperature !== undefined && vitals.temperature > 0) {
    if (vitals.temperature >= 104) {
      redFlags.push(`Critical Vitals: Very High Fever (${vitals.temperature}°F)`);
      score += 35;
    } else if (vitals.temperature >= 101) {
      score += 20;
    }
  }

  // Infant high fever check
  if (request.age < 2 && vitals.temperature && vitals.temperature >= 100.4) {
    redFlags.push(`High Risk Age: Infant (<2 yrs) with fever (${vitals.temperature}°F)`);
    score += 40;
  }

  // Check Moderate Symptoms
  let moderateMatchesCount = 0;
  MODERATE_SYMPTOMS.forEach(ms => {
    if (textLower.includes(ms)) {
      moderateMatchesCount++;
    }
  });
  score += moderateMatchesCount * 15;

  // Determine final Urgency and Category
  let urgency: TriageUrgency = 'Minor';
  let category: TriageCategory = 'GREEN';
  let dept = 'General Outpatient (OPD)';
  let advice = 'Rest, stay hydrated, and monitor symptoms. A PHC doctor will review your case shortly.';

  if (redFlags.length > 0 || score >= 75) {
    urgency = 'Emergency';
    category = 'RED';
    score = Math.min(100, Math.max(85, score));
    dept = 'Emergency Trauma & Resuscitation Unit';
    advice = 'CRITICAL ALERT: Emergency case! Immediate doctor attention required. Ambulance 108 notified if transfer is required. Do not delay!';
  } else if (score >= 40 || moderateMatchesCount > 0) {
    urgency = 'Moderate';
    category = 'YELLOW';
    score = Math.min(84, Math.max(45, score));
    dept = 'Teleconsultation / Primary Care Clinic';
    advice = 'Priority Queue assigned. Please remain near the waiting room or keep phone nearby for video consult notification.';
  } else {
    urgency = 'Minor';
    category = 'GREEN';
    score = Math.min(44, Math.max(10, score));
    dept = 'General OPD / Pharmacy Guidance';
    advice = 'Standard Queue token generated. Estimated wait time under 30 minutes.';
  }

  return {
    id: 'trg_' + Date.now().toString(36),
    urgency,
    category,
    urgencyScore: score,
    redFlagsDetected: redFlags,
    summary: `${urgency} priority triage for ${request.patientName} (${request.age}y/${request.gender}). Primary complaints: ${normalizedTags.join(', ') || normalizedText.slice(0, 60)}.`,
    aiExplanation: redFlags.length > 0
      ? `Rule-Based Triage Engine flagged ${redFlags.length} RED-FLAG danger sign(s): ${redFlags.join('; ')}.`
      : `Symptom and vital sign evaluation indicates ${urgency.toLowerCase()} urgency requiring standard clinical consultation.`,
    recommendedDepartment: dept,
    preConsultAdvice: advice,
    language: request.language || 'en',
    timestamp: new Date().toISOString()
  };
}

/**
 * Calculates the next sequential token ID (e.g. EMG-001, MOD-002, MIN-003)
 * by finding the highest existing numeric ID for that specific prefix and adding 1.
 */
export function getNextSequentialTokenId(
  urgencyOrPrefix: string,
  existingTokens: Array<{ tokenId?: string; token_id?: string; urgency?: string }> = []
): string {
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

  let maxNum = 0;
  const regex = new RegExp(`^${prefix}-(\\d+)$`, 'i');

  for (const t of existingTokens) {
    const rawId = t.tokenId || t.token_id || '';
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


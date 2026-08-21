import { Patient, QueueToken, VisitRecord, PHCClusterData, ChronicConditionAlert, VitalLogEntry, DoctorProfile, OfflineSyncItem, SymptomIconDefinition } from '../types';

// Empty schema definitions (All data is loaded from and persisted to SQLite Database)
export const INITIAL_PATIENTS: Patient[] = [];
export const INITIAL_QUEUE_TOKENS: QueueToken[] = [];
export const INITIAL_VISITS: VisitRecord[] = [];
export const INITIAL_CHRONIC_ALERTS: ChronicConditionAlert[] = [];
export const INITIAL_VITALS_HISTORY: VitalLogEntry[] = [];
export const PHC_CLUSTERS: PHCClusterData[] = [];
export const DOCTOR_DIRECTORY: DoctorProfile[] = [];
export const INITIAL_OFFLINE_SYNC_ITEMS: OfflineSyncItem[] = [];

// Low-literacy UI symptom icons
export const LOW_LITERACY_SYMPTOM_ICONS: SymptomIconDefinition[] = [
  {
    id: 'fever',
    icon: '🌡️',
    labelEn: 'Fever / Chills',
    labelHi: 'तेज़ बुख़ार / ठंड',
    labelRegional: 'காய்ச்சல் / జ్వరం',
    audioPromptEn: 'High fever, hot forehead, shivering, or feeling cold.',
    audioPromptHi: 'तेज़ बुख़ार, माथा गर्म होना, शरीर कांपना या ठंड लगना।',
    bodyZone: 'general',
    tags: ['high fever', 'chills', 'fever > 101'],
    severityDefault: 'Medium',
    color: 'bg-red-50 text-red-800 border-red-200 hover:border-red-400'
  },
  {
    id: 'chest_pain',
    icon: '🫀',
    labelEn: 'Chest Pain / Heart',
    labelHi: 'छाती में दर्द / दिल',
    labelRegional: 'நெஞ்சு வலி / ఛాతీ నొప్పి',
    audioPromptEn: 'Severe pressure or pain in chest, left arm, or sudden sweating.',
    audioPromptHi: 'छाती में भारीपन, बायीं बांह में दर्द या अचानक ठंडा पसीना।',
    bodyZone: 'chest',
    tags: ['chest pain', 'severe shortness of breath', 'sweating'],
    severityDefault: 'High',
    color: 'bg-rose-100 text-rose-900 border-rose-400 font-bold hover:border-rose-600 ring-1 ring-rose-300'
  },
  {
    id: 'breathing',
    icon: '🫁',
    labelEn: 'Breathing Trouble',
    labelHi: 'सांस फूलना / खांसी',
    labelRegional: 'மூச்சுத்திணறல் / శ్వాస ఇబ్బంది',
    audioPromptEn: 'Difficulty catching breath, fast breathing, or continuous coughing.',
    audioPromptHi: 'सांस लेने में भारी तकलीफ़, तेज़ सांस चलना या लगातार खांसी।',
    bodyZone: 'chest',
    tags: ['breathing difficulty', 'severe shortness of breath', 'wheezing'],
    severityDefault: 'High',
    color: 'bg-amber-50 text-amber-900 border-amber-300 hover:border-amber-500'
  },
  {
    id: 'stomach',
    icon: '🩺',
    labelEn: 'Stomach Pain',
    labelHi: 'पेट में तेज़ दर्द',
    labelRegional: 'வயிற்று வலி / కడుపు నొప్పి',
    audioPromptEn: 'Sharp stomach cramps, burning sensation, or bloated belly.',
    audioPromptHi: 'पेट में मरोड़, तेज दर्द, जलन या पेट फूलना।',
    bodyZone: 'abdomen',
    tags: ['abdominal pain', 'moderate abdominal pain', 'cramps'],
    severityDefault: 'Medium',
    color: 'bg-yellow-50 text-yellow-900 border-yellow-300 hover:border-yellow-500'
  },
  {
    id: 'diarrhea',
    icon: '🤢',
    labelEn: 'Vomiting / Loose Motion',
    labelHi: 'उल्टी / दस्त / निर्जलीकरण',
    labelRegional: 'வாந்தி / அதிசாரம்',
    audioPromptEn: 'Frequent watery stools, repeated vomiting, dry mouth or weakness.',
    audioPromptHi: 'बार-बार पानी जैसे दस्त, उल्टी आना, मुंह सूखना या चक्कर आना।',
    bodyZone: 'abdomen',
    tags: ['diarrhea', 'dehydration', 'frequent vomiting'],
    severityDefault: 'Medium',
    color: 'bg-orange-50 text-orange-900 border-orange-300 hover:border-orange-500'
  },
  {
    id: 'headache',
    icon: '🤕',
    labelEn: 'Severe Headache / Dizzy',
    labelHi: 'सिरदर्द / चक्कर आना',
    labelRegional: 'தலைவலி / திலதிరుగుట',
    audioPromptEn: 'Pounding head pain, dizziness, blurred vision, or fainting.',
    audioPromptHi: 'सिर में असहनीय दर्द, चक्कर आना या आंखों के आगे अंधेरा छाना।',
    bodyZone: 'head',
    tags: ['severe headache', 'dizziness', 'fainting'],
    severityDefault: 'Medium',
    color: 'bg-blue-50 text-blue-900 border-blue-300 hover:border-blue-500'
  },
  {
    id: 'injury',
    icon: '🩸',
    labelEn: 'Injury / Heavy Bleeding',
    labelHi: 'गंभीर चोट / ख़ून बहना',
    labelRegional: 'காயம் / రక్తస్రావం',
    audioPromptEn: 'Deep wound, cut with bleeding, road accident, or head hit.',
    audioPromptHi: 'गहरा घाव, कटने से ख़ून बहना, दुर्घटना या सिर में चोट।',
    bodyZone: 'limbs',
    tags: ['severe bleeding', 'deep laceration', 'head trauma'],
    severityDefault: 'High',
    color: 'bg-red-100 text-red-900 border-red-400 font-bold hover:border-red-600'
  },
  {
    id: 'bone',
    icon: '🦴',
    labelEn: 'Bone Fracture / Joint Pain',
    labelHi: 'हड्डी टूटना / जोड़ों का दर्द',
    labelRegional: 'எலும்பு முறிவு / కీళ్ల నొప్పులు',
    audioPromptEn: 'Inability to walk or move arm, severe swelling after fall.',
    audioPromptHi: 'पैर या हाथ न हिला पाना, गिरने के बाद सूजन या फ्रैक्चर का शक।',
    bodyZone: 'limbs',
    tags: ['suspected fracture', 'joint pain', 'swelling'],
    severityDefault: 'Medium',
    color: 'bg-slate-100 text-slate-900 border-slate-300 hover:border-slate-500'
  },
  {
    id: 'rash',
    icon: '🩹',
    labelEn: 'Skin Rash / Itching / Bite',
    labelHi: 'खाज-ख़ुजली / फोड़े / कीड़ा काटना',
    labelRegional: 'தோல் அரிப்பு / చర్మ సమస్య',
    audioPromptEn: 'Red itchy patches, boils, allergic reaction, or snake/insect bite.',
    audioPromptHi: 'शरीर पर लाल दाने, खुजली, फोड़े-फुंसी या कीड़े का काटना।',
    bodyZone: 'limbs',
    tags: ['skin rash', 'itching', 'allergic reaction'],
    severityDefault: 'Low',
    color: 'bg-purple-50 text-purple-900 border-purple-300 hover:border-purple-500'
  },
  {
    id: 'pregnancy',
    icon: '🤰',
    labelEn: 'Maternity / Pregnancy Check',
    labelHi: 'गर्भावस्था / प्रसव जांच',
    labelRegional: 'கர்ப்ப பரிசோதனை / గర్భధారణ',
    audioPromptEn: 'ANC checkup, pregnancy pain, fetal movement, or labor.',
    audioPromptHi: 'गर्भावस्था की नियमित जांच, पेट में दर्द, या प्रसव पीड़ा।',
    bodyZone: 'abdomen',
    tags: ['pregnancy check', 'routine checkup', 'maternity'],
    severityDefault: 'Low',
    color: 'bg-pink-50 text-pink-900 border-pink-300 hover:border-pink-500'
  },
  {
    id: 'child_sick',
    icon: '👶',
    labelEn: 'Child / Infant Sick',
    labelHi: 'बच्चा / शिशु बीमार',
    labelRegional: 'குழந்தை உடல்நலக்குறைவு / పిల్లల అనారోగ్యం',
    audioPromptEn: 'Baby crying continuously, refusing milk, or lethargic.',
    audioPromptHi: 'शिशु का लगातार रोना, दूध न पीना, या सुस्त पड़ जाना।',
    bodyZone: 'general',
    tags: ['high fever in infant', 'child illness', 'refusing feeds'],
    severityDefault: 'High',
    color: 'bg-teal-50 text-teal-900 border-teal-300 hover:border-teal-500'
  },
  {
    id: 'refill',
    icon: '💊',
    labelEn: 'Medicine Refill (BP/Sugar)',
    labelHi: 'दवा ख़त्म / बीपी-शुगर पर्ची',
    labelRegional: 'மருந்து மறுவிற்பனை / మందుల రీఫిల్',
    audioPromptEn: 'Routine refill of blood pressure, diabetes, or asthma medicines.',
    audioPromptHi: 'ब्लड प्रेशर, शुगर या पुरानी बीमारी की नियमित दवाइयां दोबारा लेना।',
    bodyZone: 'general',
    tags: ['routine refill', 'hypertension', 'diabetes'],
    severityDefault: 'Low',
    color: 'bg-emerald-50 text-emerald-900 border-emerald-300 hover:border-emerald-500'
  }
];

export const UI_TRANSLATIONS: Record<string, Record<string, string>> = {
  en: {
    appTitle: 'MediQ',
    appSubtitle: 'AI Symptom Triage & Rural Teleconsultation',
    patientTab: '1. Patient Triage Intake',
    queueTab: '2. Live Queue & Display',
    videoTab: '3. Video Teleconsult',
    ashaTab: '4. ASHA Assist Mode',
    analyticsTab: '5. Outbreak Analytics',
    archTab: '6. Architecture & Overview',
    emergencyBanner: 'EMERGENCY HOTLINE 108: For severe chest pain, unconsciousness, or trauma, press Emergency Alert!',
    emergencyBtn: 'EMERGENCY 108 ALERT',
    offlineStatus: 'Connected to Cloud',
    offlineLocal: 'Offline Mode (Local Cache Active)'
  },
  hi: {
    appTitle: 'प्राथमिक स्वास्थ्य केंद्र स्वास्थ सेवा',
    appSubtitle: 'एआई लक्षण जांच एवं टेली-परामर्श कतार',
    patientTab: '१. रोगी लक्षण जांच',
    queueTab: '२. लाइव कतार एवं टोकन',
    videoTab: '३. वीडियो परामर्श रूम',
    ashaTab: '४. आशा वर्कर मोड',
    analyticsTab: '५. महामारी चेतावनी एवं मैप',
    archTab: '६. आर्किटेक्चर दस्तावेज़',
    emergencyBanner: 'आपातकालीन हेल्पलाइन १०८: छाती में दर्द या सांस लेने में बहुत तकलीफ़ होने पर तुरंत लाल बटन दबाएं!',
    emergencyBtn: '१०८ एम्बुलेंस अलर्ट',
    offlineStatus: 'क्लाउड से जुड़ा हुआ',
    offlineLocal: 'ऑफलाइन मोड (स्थानीय सेविंग)'
  },
  ta: {
    appTitle: 'கிராமப்புற ஆரம்ப சுகாதார நிலையம்',
    appSubtitle: 'AI அறிகுறிகள் சோதனை & வரிசை மேலாண்மை',
    patientTab: '1. நோயாளி பரிசோதனை',
    queueTab: '2. நேரலை வரிசை பலகை',
    videoTab: '3. வீடியோ ஆலோசனை',
    ashaTab: '4. ஆஷா உதவியாளர்',
    analyticsTab: '5. நோய் பரவல் கண்காணிப்பு',
    archTab: '6. கட்டிடக்கலை ஆவணம்',
    emergencyBanner: 'அவசர உதவி 108: மாரடைப்பு அல்லது மூச்சுத்திணறல் ஏற்பட்டால் உடனே எச்சரிக்கை பொத்தானை அழுத்தவும்!',
    emergencyBtn: '108 அவசர அழைப்பு',
    offlineStatus: 'இணைக்கப்பட்டது',
    offlineLocal: 'ஆஃப்லைன் முறை'
  },
  te: {
    appTitle: 'గ్రామీణ ప్రాథమిక ఆరోగ్య కేంద్రం',
    appSubtitle: 'AI లక్షణాల గుర్తింపు & టెలికన్సల్టేషన్ క్యూ',
    patientTab: '1. పేషెంట్ లక్షణాల నమోదు',
    queueTab: '2. లైవ్ క్యూ బోర్డ్',
    videoTab: '3. వీడియో కన్సల్టేషన్',
    ashaTab: '4. ఆశా వర్కర్ మోడ్',
    analyticsTab: '5. వ్యాధుల ముందస్తు గుర్తింపు',
    archTab: '6. సిస్టమ్ ఆర్కిటెక్చర్',
    emergencyBanner: 'అత్యవసర 108: గుండెనొప్పి లేదా తీవ్ర శ్వాస ఇబ్బంది ఉన్నప్పుడు వెంటనే అలెర్ట్ క్లిక్ చేయండి!',
    emergencyBtn: '108 అంబులెన్స్ అలెర్ట్',
    offlineStatus: 'కనెక్ట్ అయ్యింది',
    offlineLocal: 'ఆఫ్‌లైన్ మోడ్'
  },
  mr: {
    appTitle: 'ग्रामीण प्राथमिक आरोग्य केंद्र',
    appSubtitle: 'एआय लक्षण तपासणी आणि टेली-सल्ला रांग',
    patientTab: '१. रुग्ण लक्षण तपासणी',
    queueTab: '२. थेट रांग आणि टोकन',
    videoTab: '३. व्हिडिओ डॉक्टर कॉल',
    ashaTab: '४. आशा सेविका मदत',
    analyticsTab: '५. आजार उद्रेक विश्लेषण',
    archTab: '६. सिस्टीम आर्किटेक्चर',
    emergencyBanner: 'आणीबाणी १०८: छातीत दुखणे किंवा गंभीर श्वास घेण्यास त्रास असल्यास लाल बटण दाबा!',
    emergencyBtn: '१०८ रुग्णवाहिका अलर्ट',
    offlineStatus: 'ऑनलाईन जोडलेले',
    offlineLocal: 'ऑफलाईन मोड'
  },
  bn: {
    appTitle: 'গ্রামীণ প্রাথমিক স্বাস্থ্য কেন্দ্র',
    appSubtitle: 'এআই উপসর্গ পরীক্ষা ও টেলিকনসালটেশন লাইন',
    patientTab: '১. রোগী উপসর্গ পরীক্ষা',
    queueTab: '২. লাইভ টোকেন লাইন',
    videoTab: '৩. ভিডিও ডাক্তার পরামর্শ',
    ashaTab: '৪. আশা কর্মী মোড',
    analyticsTab: '৫. রোগ প্রাদুর্ভাব ট্র্যাকার',
    archTab: '৬. সিস্টেম আর্কিটেকচার',
    emergencyBanner: 'জরুরি ১০৮: বুকে তীব্র ব্যথা বা শ্বাসকষ্টের জন্য এখনই লাল বাটন চাপুন!',
    emergencyBtn: '১০৮ অ্যাম্বুলেন্স অ্যালার্ট',
    offlineStatus: 'সংযুক্ত',
    offlineLocal: 'অফলাইন মোড'
  }
};

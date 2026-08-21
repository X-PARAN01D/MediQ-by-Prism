import React, { useState } from 'react';
import { 
  TriageRequest, 
  TriageResult, 
  QueueToken, 
  AppLanguage, 
  Vitals, 
  Patient, 
  SymptomIconDefinition 
} from '../types';
import { LOW_LITERACY_SYMPTOM_ICONS, INITIAL_PATIENTS } from '../data/mockData';
import { evaluateRuleBasedTriage, getNextSequentialTokenId } from '../utils/triageEngine';
import { teleconsultService } from '../services/teleconsultService';
import { VoiceInputWidget } from './VoiceInputWidget';
import { PatientLookupModal } from './PatientLookupModal';
import { SmsUssdModal } from './SmsUssdModal';
import { 
  Mic, 
  Send, 
  Sparkles, 
  AlertOctagon, 
  Clock, 
  Building2, 
  Thermometer, 
  Heart, 
  Activity, 
  FileText, 
  CheckCircle, 
  User, 
  MessageSquare,
  Volume2,
  RefreshCw,
  QrCode,
  Fingerprint,
  Phone,
  Smartphone,
  CheckCircle2,
  Sliders,
  WifiOff,
  Radio
} from 'lucide-react';

interface PatientTriageViewProps {
  language: AppLanguage;
  onTriageComplete: (result: TriageResult, token: QueueToken) => void;
  isOnline: boolean;
  onQueueSyncAdd?: (item: any) => void;
  existingTokens?: QueueToken[];
}

export const PatientTriageView: React.FC<PatientTriageViewProps> = ({
  language,
  onTriageComplete,
  isOnline,
  onQueueSyncAdd,
  existingTokens = []
}) => {
  // Current Patient State
  const [selectedPatient, setSelectedPatient] = useState<Patient>(INITIAL_PATIENTS[0]);
  const [isLookupModalOpen, setIsLookupModalOpen] = useState(false);
  const [isSmsModalOpen, setIsSmsModalOpen] = useState(false);

  // Symptoms & Tags
  const [symptomsText, setSymptomsText] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [activeZoneFilter, setActiveZoneFilter] = useState<'all' | 'chest' | 'abdomen' | 'head' | 'limbs' | 'general'>('all');

  // Vitals State
  const [spO2, setSpO2] = useState<string>('97');
  const [sysBP, setSysBP] = useState<string>('124');
  const [diaBP, setDiaBP] = useState<string>('82');
  const [temp, setTemp] = useState<string>('98.6');
  const [pulse, setPulse] = useState<string>('76');
  const [isBtPairing, setIsBtPairing] = useState(false);

  // Output & Loading State
  const [isLoading, setIsLoading] = useState(false);
  const [triageOutput, setTriageOutput] = useState<{
    result: TriageResult;
    token: QueueToken;
    smsPayload?: string;
  } | null>(null);

  // Audio Playback
  const handleSpeakText = (text: string) => {
    if (!('speechSynthesis' in window)) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = language === 'hi' ? 'hi-IN' : 'en-IN';
    utterance.rate = 0.9;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  const handleSpeakSymptomItem = (item: SymptomIconDefinition, e: React.MouseEvent) => {
    e.stopPropagation();
    const prompt = language === 'hi' ? item.audioPromptHi : item.audioPromptEn;
    handleSpeakText(prompt);
  };

  // 1-Tap Toggle of Symptom Badge
  const handleToggleSymptom = (item: SymptomIconDefinition) => {
    if (selectedTags.includes(item.id)) {
      setSelectedTags(selectedTags.filter(t => t !== item.id));
    } else {
      setSelectedTags([...selectedTags, item.id, ...item.tags]);
      // Optional speech confirmation
      handleSpeakText(language === 'hi' ? `${item.labelHi} चुना गया` : `${item.labelEn} selected`);
    }
  };

  // Voice transcript handler from VoiceInputWidget
  const handleVoiceTranscriptChange = (transcript: string, autoTags: string[]) => {
    setSymptomsText(transcript);
    if (autoTags.length > 0) {
      setSelectedTags(prev => Array.from(new Set([...prev, ...autoTags])));
    }
  };

  // Simulate 1-Tap Bluetooth Vitals Sensor Reader
  const handleSimulateBtVitals = () => {
    setIsBtPairing(true);
    setTimeout(() => {
      setIsBtPairing(false);
      setSpO2('95');
      setTemp('101.4');
      setSysBP('130');
      setDiaBP('85');
      setPulse('92');
      handleSpeakText(language === 'hi' ? 'ब्लूटूथ सेंसर से नाड़ी, ऑक्सीजन और तापमान दर्ज कर लिया गया है।' : 'Vitals captured via Bluetooth sensors.');
    }, 1200);
  };

  // Form Submit / Triage Evaluation (Dual-Engine: Offline Deterministic + Online Gemini)
  const handleSubmitTriage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!symptomsText && selectedTags.length === 0) {
      alert(language === 'hi' ? "कृपया कम से कम एक लक्षण का चिह्न चुनें या बोलकर बताएं।" : "Please select at least one symptom icon or speak your complaint.");
      return;
    }

    setIsLoading(true);

    const vitalsObj: Vitals = {};
    if (spO2) vitalsObj.spO2 = Number(spO2);
    if (sysBP) vitalsObj.systolicBP = Number(sysBP);
    if (diaBP) vitalsObj.diastolicBP = Number(diaBP);
    if (temp) vitalsObj.temperature = Number(temp);
    if (pulse) vitalsObj.pulseRate = Number(pulse);

    const triageReq: TriageRequest = {
      patientId: selectedPatient.id,
      patientName: selectedPatient.nameRegional || selectedPatient.name,
      age: selectedPatient.age,
      gender: selectedPatient.gender,
      village: selectedPatient.village,
      symptomsText,
      selectedSymptomTags: selectedTags,
      vitals: vitalsObj,
      language,
      enteredBy: 'Self',
      offlineCached: !isOnline
    };

    // If Offline: execute deterministic rule engine locally in browser
    if (!isOnline) {
      setTimeout(() => {
        const localRule = evaluateRuleBasedTriage(triageReq);
        const tokenId = getNextSequentialTokenId(localRule.urgency, existingTokens);

        const generatedToken: QueueToken = {
          tokenId,
          patientId: selectedPatient.id,
          patientName: selectedPatient.nameRegional || selectedPatient.name,
          age: selectedPatient.age,
          gender: selectedPatient.gender,
          village: selectedPatient.village,
          urgency: localRule.urgency,
          category: localRule.category,
          urgencyScore: localRule.urgencyScore,
          symptomsSummary: symptomsText || selectedTags.join(', '),
          status: localRule.urgency === 'Emergency' ? 'In Consult' : 'Waiting',
          assignedDoctor: localRule.urgency === 'Emergency' ? 'Dr. Anita Roy (Emergency MO)' : 'Dr. Suresh Verma',
          assignedRoom: localRule.recommendedDepartment,
          estimatedWaitMinutes: localRule.urgency === 'Emergency' ? 0 : localRule.urgency === 'Moderate' ? 10 : 25,
          createdAt: new Date().toISOString(),
          vitals: vitalsObj,
          triageResultId: localRule.id,
          smsSent: true,
          offlineCreated: true
        };

        const out = {
          result: localRule,
          token: generatedToken,
          smsPayload: `[SMS OFFLINE]: ${generatedToken.tokenId} assigned to ${generatedToken.patientName}. Wait: ~${generatedToken.estimatedWaitMinutes}m. Room: ${generatedToken.assignedRoom}`
        };

        setTriageOutput(out);
        onTriageComplete(localRule, generatedToken);
        teleconsultService.notifyQueueUpdate();
        if (onQueueSyncAdd) {
          onQueueSyncAdd({
            id: `sync-${Date.now()}`,
            timestamp: new Date().toLocaleTimeString(),
            type: 'triage',
            patientName: selectedPatient.name,
            village: selectedPatient.village,
            tokenId: generatedToken.tokenId,
            data: out,
            status: 'pending'
          });
        }

        // Voice announcement
        const announcement = language === 'hi'
          ? `आपका टोकन नंबर ${generatedToken.tokenId} जारी हो गया है। प्राथमिकता श्रेणी ${localRule.urgency} है। कमरा नंबर ${generatedToken.assignedRoom} में जाएं।`
          : `Your token ${generatedToken.tokenId} is issued. Priority: ${localRule.urgency}. Proceed to ${generatedToken.assignedRoom}.`;
        handleSpeakText(announcement);

        setIsLoading(false);
      }, 600);
      return;
    }

    // Online: Call Server Backend with Gemini AI Enhancement
    try {
      const storedToken = localStorage.getItem('mediq_token');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (storedToken) {
        headers['Authorization'] = `Bearer ${storedToken}`;
      }

      const res = await fetch('/api/triage', {
        method: 'POST',
        headers,
        body: JSON.stringify(triageReq)
      });

      const data = await res.json();
      if (res.ok) {
        setTriageOutput({
          result: data.triageResult,
          token: data.queueToken,
          smsPayload: data.smsFallbackPayload
        });
        onTriageComplete(data.triageResult, data.queueToken);
        teleconsultService.notifyQueueUpdate();

        // Voice announcement
        const announcement = language === 'hi'
          ? `आपका टोकन नंबर ${data.queueToken.tokenId} तैयार है। कृपया कमरा ${data.queueToken.assignedRoom} में प्रतीक्षा करें।`
          : `Your token is ${data.queueToken.tokenId}. Please proceed to ${data.queueToken.assignedRoom}.`;
        handleSpeakText(announcement);
      } else {
        alert("Triage error: " + (data.error || "Failed to process symptoms"));
      }
    } catch (err) {
      // Automatic fallback to local engine if fetch fails
      const localRule = evaluateRuleBasedTriage(triageReq);
      const tokenId = getNextSequentialTokenId(localRule.urgency, existingTokens);
      const generatedToken: QueueToken = {
        tokenId,
        patientId: selectedPatient.id,
        patientName: selectedPatient.name,
        age: selectedPatient.age,
        gender: selectedPatient.gender,
        village: selectedPatient.village,
        urgency: localRule.urgency,
        category: localRule.category,
        urgencyScore: localRule.urgencyScore,
        symptomsSummary: symptomsText || selectedTags.join(', '),
        status: localRule.urgency === 'Emergency' ? 'In Consult' : 'Waiting',
        assignedDoctor: localRule.urgency === 'Emergency' ? 'Dr. Anita Roy (Emergency MO)' : 'Dr. Suresh Verma',
        assignedRoom: localRule.recommendedDepartment,
        estimatedWaitMinutes: localRule.urgency === 'Emergency' ? 0 : localRule.urgency === 'Moderate' ? 12 : 25,
        createdAt: new Date().toISOString(),
        vitals: vitalsObj,
        triageResultId: localRule.id,
        offlineCreated: true
      };
      setTriageOutput({ result: localRule, token: generatedToken });
      onTriageComplete(localRule, generatedToken);
      teleconsultService.notifyQueueUpdate();
    } finally {
      setIsLoading(false);
    }
  };

  const filteredIcons = activeZoneFilter === 'all' 
    ? LOW_LITERACY_SYMPTOM_ICONS 
    : LOW_LITERACY_SYMPTOM_ICONS.filter(i => i.bodyZone === activeZoneFilter);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      
      {/* Top Banner with Low-Literacy & Offline Guidance */}
      <div className="bg-gradient-to-r from-slate-900 via-teal-950 to-slate-900 border border-teal-800/40 rounded-3xl p-5 sm:p-6 text-white shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="bg-teal-500/20 text-teal-300 text-xs px-3 py-1 rounded-full border border-teal-400/40 font-bold flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              Rural Low-Literacy Triage
            </span>
            <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold border ${
              isOnline ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800' : 'bg-amber-950/80 text-amber-300 border-amber-600'
            }`}>
              {isOnline ? 'Cloud AI Active' : 'Offline Local Cache Engine'}
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black tracking-tight text-slate-100">
            {language === 'hi' ? 'रोगी लक्षण जांच एवं टोकन प्रणाली' : 'AI Symptom Checker & Rural Token System'}
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-2xl">
            {language === 'hi' 
              ? 'बटन दबाकर बोलें या बीमारी के चित्र चुनें। सिस्टम तुरंत डॉक्टर के कमरे का टोकन देगा।' 
              : 'Tap visual icons or press the giant microphone button to speak symptoms. Deterministic rules + Gemini AI issue instant priority tokens.'}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button 
            type="button"
            onClick={() => setIsSmsModalOpen(true)}
            className="bg-amber-600/30 hover:bg-amber-600/50 text-amber-300 px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 border border-amber-500/50 cursor-pointer transition-all"
          >
            <Smartphone className="w-4 h-4" />
            <span>2G SMS / USSD Mode</span>
          </button>
          
          <button 
            type="button"
            onClick={() => {
              setTriageOutput(null);
              setSymptomsText('');
              setSelectedTags([]);
            }}
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 border border-slate-700 cursor-pointer transition-all"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>New Patient (नया रोगी)</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: 3-Step Wizard Form */}
        <div className="lg:col-span-7 space-y-6">
          <form onSubmit={handleSubmitTriage} className="space-y-6">
            
            {/* STEP 1: PATIENT IDENTIFIER & 1-TAP LOOKUP */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 sm:p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-teal-100 text-teal-800 font-black flex items-center justify-center text-sm">
                    1
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">Patient Identification / रोगी की पहचान</h3>
                    <p className="text-xs text-slate-500">QR कार्ड स्कैन, अंगूठा बायोमेट्रिक या फोन नंबर से पहचानें</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsLookupModalOpen(true)}
                  className="bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-300 font-bold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer transition-all shadow-sm"
                >
                  <QrCode className="w-4 h-4" />
                  <span>Scan QR / Thumbprint</span>
                </button>
              </div>

              {/* Active Selected Patient Pill */}
              <div className="bg-gradient-to-r from-teal-50 to-slate-50 border border-teal-200 rounded-2xl p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-teal-700 text-white flex items-center justify-center font-bold text-lg shadow-md border-2 border-white overflow-hidden">
                    {selectedPatient.photoUrl ? (
                      <img src={selectedPatient.photoUrl} alt={selectedPatient.name} className="w-full h-full object-cover" />
                    ) : (
                      <span>{selectedPatient.name.charAt(0)}</span>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-sm text-slate-900">
                        {selectedPatient.nameRegional || selectedPatient.name}
                      </span>
                      <span className="text-xs text-slate-500 font-normal">({selectedPatient.name})</span>
                      <span className="bg-teal-100 text-teal-800 font-bold text-[10px] px-2 py-0.5 rounded-md">
                        {selectedPatient.bloodGroup || 'B+'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600">
                      {selectedPatient.age} Y • {selectedPatient.gender} • {selectedPatient.village}
                    </p>
                    <p className="text-[11px] text-teal-700 font-mono">
                      ABHA: {selectedPatient.abhaId || '84-9201-4402-9182'}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsLookupModalOpen(true)}
                  className="text-xs font-bold text-teal-700 hover:text-teal-900 underline cursor-pointer"
                >
                  बदलें (Change)
                </button>
              </div>
            </div>

            {/* STEP 2: WHAT HURTS? (ICON-BASED SYMPTOM SELECTION + VOICE INPUT) */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 sm:p-6 space-y-5">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-teal-100 text-teal-800 font-black flex items-center justify-center text-sm">
                    2
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">
                      Select Symptoms / बीमारी के चित्र चुनें
                    </h3>
                    <p className="text-xs text-slate-500">चित्र पर टैप करें या स्पीकर दबाकर आवाज सुनें</p>
                  </div>
                </div>

                {/* Body Zone Filter Tabs */}
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-semibold overflow-x-auto">
                  <button
                    type="button"
                    onClick={() => setActiveZoneFilter('all')}
                    className={`px-2.5 py-1 rounded-lg cursor-pointer transition-all ${
                      activeZoneFilter === 'all' ? 'bg-white text-teal-800 font-bold shadow-sm' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    सभी (All)
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveZoneFilter('chest')}
                    className={`px-2.5 py-1 rounded-lg cursor-pointer transition-all ${
                      activeZoneFilter === 'chest' ? 'bg-white text-teal-800 font-bold shadow-sm' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    सीना/सांस (Chest)
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveZoneFilter('abdomen')}
                    className={`px-2.5 py-1 rounded-lg cursor-pointer transition-all ${
                      activeZoneFilter === 'abdomen' ? 'bg-white text-teal-800 font-bold shadow-sm' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    पेट/उल्टी (Stomach)
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveZoneFilter('head')}
                    className={`px-2.5 py-1 rounded-lg cursor-pointer transition-all ${
                      activeZoneFilter === 'head' ? 'bg-white text-teal-800 font-bold shadow-sm' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    सिर (Head)
                  </button>
                </div>
              </div>

              {/* High-Contrast Large Touch Target Symptom Grid (Min 48px Touch Targets) */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {filteredIcons.map(item => {
                  const isSelected = selectedTags.includes(item.id);
                  return (
                    <div
                      key={item.id}
                      onClick={() => handleToggleSymptom(item)}
                      className={`min-h-[72px] p-3 rounded-2xl border-2 text-left flex flex-col justify-between transition-all cursor-pointer select-none relative group ${
                        isSelected
                          ? 'ring-3 ring-teal-600 bg-teal-50 border-teal-500 font-bold shadow-md scale-[1.02]'
                          : `${item.color} shadow-sm hover:scale-[1.01]`
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <span className="text-3xl leading-none">{item.icon}</span>
                        
                        <div className="flex items-center gap-1">
                          {/* Audio Speaker Pronunciation Button */}
                          <button
                            type="button"
                            onClick={(e) => handleSpeakSymptomItem(item, e)}
                            className="p-1 rounded-lg bg-white/80 hover:bg-white text-slate-700 shadow-xs cursor-pointer"
                            title="Listen to Symptom Description"
                          >
                            <Volume2 className="w-3.5 h-3.5 text-teal-700" />
                          </button>
                          {isSelected && (
                            <CheckCircle2 className="w-4 h-4 text-teal-600" />
                          )}
                        </div>
                      </div>

                      <div className="mt-2">
                        <div className="text-xs font-bold text-slate-900 leading-tight">
                          {item.labelHi}
                        </div>
                        <div className="text-[10px] text-slate-600 font-normal leading-tight">
                          {item.labelEn}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Giant Tactile Voice Input Widget */}
              <VoiceInputWidget
                language={language}
                onTranscriptChange={handleVoiceTranscriptChange}
                initialTranscript={symptomsText}
              />
            </div>

            {/* STEP 3: VITALS & SUBMIT */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 sm:p-6 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-teal-100 text-teal-800 font-black flex items-center justify-center text-sm">
                    3
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">Vitals & Severity / शारीरिक जांच</h3>
                    <p className="text-xs text-slate-500">1-टैप ब्लूटूथ सेंसर से तुरंत जांचें या दर्ज करें</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleSimulateBtVitals}
                  disabled={isBtPairing}
                  className="bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 font-bold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <Activity className={`w-4 h-4 ${isBtPairing ? 'animate-spin' : ''}`} />
                  <span>{isBtPairing ? 'Connecting Sensor...' : '1-Tap Bluetooth Vitals'}</span>
                </button>
              </div>

              {/* Vitals Input Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200">
                  <span className="text-[11px] font-bold text-slate-600 flex items-center gap-1">
                    <Heart className="w-3.5 h-3.5 text-rose-500" /> SpO2 (%)
                  </span>
                  <input
                    type="number"
                    value={spO2}
                    onChange={e => setSpO2(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-xl mt-1.5 p-2 text-center font-bold text-base text-slate-900 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-400 block text-center mt-1">Normal: 95-100%</span>
                </div>

                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200">
                  <span className="text-[11px] font-bold text-slate-600 flex items-center gap-1">
                    <Thermometer className="w-3.5 h-3.5 text-amber-500" /> Temp (°F)
                  </span>
                  <input
                    type="number"
                    step="0.1"
                    value={temp}
                    onChange={e => setTemp(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-xl mt-1.5 p-2 text-center font-bold text-base text-slate-900 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-400 block text-center mt-1">Normal: 98.6°F</span>
                </div>

                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200">
                  <span className="text-[11px] font-bold text-slate-600 flex items-center gap-1">
                    BP (Systolic)
                  </span>
                  <input
                    type="number"
                    value={sysBP}
                    onChange={e => setSysBP(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-xl mt-1.5 p-2 text-center font-bold text-base text-slate-900 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-400 block text-center mt-1">Normal: 120</span>
                </div>

                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200">
                  <span className="text-[11px] font-bold text-slate-600 flex items-center gap-1">
                    Pulse (bpm)
                  </span>
                  <input
                    type="number"
                    value={pulse}
                    onChange={e => setPulse(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-xl mt-1.5 p-2 text-center font-bold text-base text-slate-900 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-400 block text-center mt-1">Normal: 60-100</span>
                </div>
              </div>

              {/* Big Submit Button */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-teal-600 hover:bg-teal-700 text-white font-extrabold py-4 px-6 rounded-2xl shadow-xl shadow-teal-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer text-base mt-2"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    <span>जांच की जा रही है (Evaluating Clinical Triage)...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-5 h-5" />
                    <span>लक्षण जांचें एवं डिजिटल टोकन प्राप्त करें (Generate Token)</span>
                  </>
                )}
              </button>
            </div>

          </form>
        </div>

        {/* Right Column: Issued Token & Priority Outcome */}
        <div className="lg:col-span-5 space-y-6">
          {triageOutput ? (
            <div className="bg-white rounded-3xl border border-slate-200 shadow-xl p-6 space-y-6 animate-fadeIn">
              
              {/* Token Display Header */}
              <div className={`rounded-3xl p-6 text-white text-center shadow-xl relative overflow-hidden ${
                triageOutput.result.category === 'RED'
                  ? 'bg-gradient-to-br from-red-600 via-rose-600 to-red-800 border-2 border-red-400'
                  : triageOutput.result.category === 'YELLOW'
                  ? 'bg-gradient-to-br from-amber-500 via-amber-600 to-yellow-600 border-2 border-amber-300'
                  : 'bg-gradient-to-br from-emerald-600 via-teal-600 to-emerald-800 border-2 border-emerald-400'
              }`}>
                
                <div className="flex items-center justify-between text-xs opacity-90 mb-2">
                  <span className="font-extrabold uppercase tracking-wider">PHC DIGITAL QUEUE TOKEN</span>
                  <span className="bg-black/30 px-2.5 py-0.5 rounded-full font-mono font-bold">
                    {new Date().toLocaleTimeString()}
                  </span>
                </div>

                <div className="my-2">
                  <span className="text-xs uppercase font-bold tracking-widest block opacity-90">टोकन संख्या (TOKEN NUMBER)</span>
                  <span className="text-6xl font-black tracking-tight font-mono drop-shadow-md">
                    {triageOutput.token.tokenId}
                  </span>
                </div>

                <div className="inline-flex items-center gap-1.5 bg-black/40 backdrop-blur-md px-3.5 py-1.5 rounded-full text-xs font-black uppercase tracking-wider mb-3">
                  <AlertOctagon className="w-4 h-4 text-amber-300" />
                  <span>PRIORITY: {triageOutput.result.urgency} (Score: {triageOutput.result.urgencyScore}/100)</span>
                </div>

                {/* Wait Time & Room Direction */}
                <div className="grid grid-cols-2 gap-2 text-xs bg-white/15 backdrop-blur-sm p-3.5 rounded-2xl mt-2 text-left">
                  <div>
                    <span className="opacity-80 block text-[11px]">Estimated Wait:</span>
                    <span className="font-black text-base">
                      {triageOutput.token.estimatedWaitMinutes === 0 ? '🚨 IMMEDIATE BYPASS' : `~${triageOutput.token.estimatedWaitMinutes} Mins`}
                    </span>
                  </div>
                  <div>
                    <span className="opacity-80 block text-[11px]">Assigned Room:</span>
                    <span className="font-black text-sm">{triageOutput.token.assignedRoom}</span>
                  </div>
                </div>

                {/* Speak Token Button */}
                <button
                  type="button"
                  onClick={() => {
                    const text = language === 'hi'
                      ? `टोकन संख्या ${triageOutput.token.tokenId}। कृपया कमरा ${triageOutput.token.assignedRoom} के बाहर प्रतीक्षा करें। अनुमानित समय ${triageOutput.token.estimatedWaitMinutes} मिनट।`
                      : `Token number ${triageOutput.token.tokenId}. Please wait near ${triageOutput.token.assignedRoom}. Estimated wait time ${triageOutput.token.estimatedWaitMinutes} minutes.`;
                    handleSpeakText(text);
                  }}
                  className="mt-3 w-full py-2 bg-white/20 hover:bg-white/30 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition-all"
                >
                  <Volume2 className="w-4 h-4" />
                  <span>टोकन आवाज में सुनें (Listen to Token Speech)</span>
                </button>
              </div>

              {/* Patient Info Summary */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs space-y-2 text-slate-800">
                <div className="flex justify-between font-medium">
                  <span className="text-slate-500">Patient:</span>
                  <span className="font-bold text-slate-900">{triageOutput.token.patientName} ({triageOutput.token.age}y/{triageOutput.token.gender})</span>
                </div>
                <div className="flex justify-between font-medium">
                  <span className="text-slate-500">Village:</span>
                  <span className="font-semibold text-slate-700">{triageOutput.token.village}</span>
                </div>
                <div className="flex justify-between font-medium">
                  <span className="text-slate-500">Health ID:</span>
                  <span className="font-mono text-slate-700">{triageOutput.token.patientId}</span>
                </div>
              </div>

              {/* Red Flags Alert if detected */}
              {triageOutput.result.redFlagsDetected && triageOutput.result.redFlagsDetected.length > 0 && (
                <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-4 text-xs text-red-900 space-y-1.5">
                  <div className="font-bold flex items-center gap-1.5 text-red-700 text-sm">
                    <AlertOctagon className="w-4 h-4 shrink-0" />
                    <span>Red Flag Danger Signs Triggered:</span>
                  </div>
                  <ul className="list-disc list-inside space-y-1 text-red-800 font-medium">
                    {triageOutput.result.redFlagsDetected.map((rf, idx) => (
                      <li key={idx}>{rf}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* AI & Rule Clinical Advice */}
              <div className="bg-slate-900 text-slate-100 rounded-2xl p-5 text-xs space-y-3 border border-slate-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-teal-400 font-bold">
                    <Sparkles className="w-4 h-4" />
                    <span>Clinical Reasoning & Department Guidance</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSpeakText(triageOutput.result.aiExplanation)}
                    className="text-slate-400 hover:text-white p-1 rounded cursor-pointer"
                    title="Audio Readout"
                  >
                    <Volume2 className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-slate-300 leading-relaxed">{triageOutput.result.aiExplanation}</p>
                <div className="pt-2 border-t border-slate-800">
                  <span className="font-semibold text-amber-300 block mb-0.5">Pre-Consult First-Aid Advice:</span>
                  <p className="text-slate-300">{triageOutput.result.preConsultAdvice}</p>
                </div>
              </div>

              {/* SMS / Feature Phone Simulation Button */}
              <button
                type="button"
                onClick={() => setIsSmsModalOpen(true)}
                className="w-full py-3 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-2xl text-xs font-bold text-slate-800 flex items-center justify-center gap-2 cursor-pointer transition-all"
              >
                <Smartphone className="w-4 h-4 text-slate-600" />
                <span>View 2G Feature Phone SMS & USSD Menu</span>
              </button>

            </div>
          ) : (
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8 text-center space-y-4">
              <div className="w-20 h-20 bg-teal-50 text-teal-600 rounded-3xl flex items-center justify-center mx-auto border border-teal-100 shadow-inner">
                <QrCode className="w-10 h-10" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {language === 'hi' ? 'लक्षण जांच हेतु तैयार' : 'Ready for Patient Intake'}
                </h3>
                <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
                  {language === 'hi' 
                    ? 'बाईं ओर लक्षण चुनें या बोलकर बताएं। कुछ ही क्षणों में टोकन और कतार का समय मिल जाएगा।' 
                    : 'Select symptom badges or tap the giant mic button. Instant queue priority token will be generated.'}
                </p>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs text-left text-slate-700 space-y-2">
                <p className="font-bold text-slate-900">SIH 2026 PS-03 Triage Standards:</p>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-red-500 shrink-0" />
                  <span><strong>RED (Emergency):</strong> Immediate bypass for chest pain, SpO2 &lt; 90%, major trauma.</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-amber-500 shrink-0" />
                  <span><strong>YELLOW (Moderate):</strong> Priority queue for fever &gt; 101°F, SpO2 90-94%, wheezing.</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-emerald-500 shrink-0" />
                  <span><strong>GREEN (Minor):</strong> General OPD for colds, refills, minor rashes.</span>
                </div>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Patient Lookup Modal (QR, Fingerprint, Phone) */}
      <PatientLookupModal
        isOpen={isLookupModalOpen}
        onClose={() => setIsLookupModalOpen(false)}
        onSelectPatient={(p) => setSelectedPatient(p)}
      />

      {/* SMS & USSD Simulator Modal */}
      <SmsUssdModal
        isOpen={isSmsModalOpen}
        onClose={() => setIsSmsModalOpen(false)}
        latestToken={triageOutput?.token}
      />

    </div>
  );
};

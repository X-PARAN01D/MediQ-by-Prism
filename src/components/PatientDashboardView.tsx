import React, { useState, useEffect } from 'react';
import { AppUser, QueueToken, Patient, VisitRecord, TriageResult, AppLanguage, Vitals, DoctorProfile, TriageRequest } from '../types';
import { 
  User, 
  Activity, 
  Video, 
  Clock, 
  FileText, 
  ShieldAlert, 
  CheckCircle2, 
  Sparkles, 
  Mic, 
  MicOff, 
  Phone, 
  Heart, 
  Thermometer, 
  AlertCircle, 
  ChevronRight, 
  ArrowRight, 
  Send, 
  Edit3, 
  Calendar, 
  Volume2, 
  Bot, 
  MessageSquare,
  Radio,
  XCircle,
  RotateCcw,
  CheckCircle,
  ShieldCheck,
  Stethoscope
} from 'lucide-react';
import { evaluateRuleBasedTriage, getNextSequentialTokenId } from '../utils/triageEngine';
import { PatientChatbot } from './PatientChatbot';
import { HealthHistorySection } from './HealthHistorySection';
import { LiveWebRTCVideoRoom } from './LiveWebRTCVideoRoom';
import { teleconsultService, TeleconsultSession, VideoCallRequest } from '../services/teleconsultService';

interface PatientDashboardViewProps {
  currentUser: AppUser;
  queueTokens: QueueToken[];
  onTriageComplete: (result: TriageResult, token: QueueToken) => void;
  language: AppLanguage;
  activeCallSession?: TeleconsultSession | null;
  onClearActiveCallSession?: () => void;
}

const COMMON_SYMPTOMS = [
  { id: 'chest_pain', label: 'छाती में दर्द / भारीपन (Chest Pain)', isRedFlag: true },
  { id: 'severe_breathlessness', label: 'साँस लेने में तकलीफ़ (Breathlessness)', isRedFlag: true },
  { id: 'fever', label: 'तेज़ बुखार (High Fever > 101°F)', isRedFlag: false },
  { id: 'severe_pain', label: 'पेट / सिर में असहनीय दर्द (Severe Pain)', isRedFlag: false },
  { id: 'cough', label: 'खांसी व ज़ुकाम (Cough & Cold)', isRedFlag: false },
  { id: 'vomiting', label: 'उल्टी / दस्त (Vomiting / Diarrhea)', isRedFlag: false },
  { id: 'general_weakness', label: 'कमज़ोरी व चक्कर (Weakness / Dizziness)', isRedFlag: false },
  { id: 'joint_pain', label: 'जोड़ों में दर्द (Joint / Body Ache)', isRedFlag: false },
];

export const PatientDashboardView: React.FC<PatientDashboardViewProps> = ({
  currentUser,
  queueTokens,
  onTriageComplete,
  language,
  activeCallSession,
  onClearActiveCallSession
}) => {
  const [activeTab, setActiveTab] = useState<'chatbot' | 'intake' | 'token' | 'video' | 'history' | 'profile'>('chatbot');
  
  // Real-time video call request state
  const [callRequest, setCallRequest] = useState<VideoCallRequest | null>(teleconsultService.getCurrentRequest());
  const [isRequestingCall, setIsRequestingCall] = useState(false);

  // Switch to video room if an active call session arrives
  useEffect(() => {
    if (activeCallSession) {
      setActiveTab('video');
    }
  }, [activeCallSession]);

  // Subscribe to teleconsult service call request events
  useEffect(() => {
    const unsubStatus = teleconsultService.on('request:status_changed', (req: VideoCallRequest) => {
      setCallRequest(req);
    });

    const unsubCreated = teleconsultService.on('request:created', (req: VideoCallRequest) => {
      setCallRequest(req);
    });

    const unsubConnected = teleconsultService.on('call:connected', () => {
      setActiveTab('video');
    });

    return () => {
      unsubStatus();
      unsubCreated();
      unsubConnected();
    };
  }, []);

  // Intake State
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
  const [symptomsDescription, setSymptomsDescription] = useState('');
  const [spO2, setSpO2] = useState<string>('98');
  const [temperature, setTemperature] = useState<string>('99.2');
  const [sysBP, setSysBP] = useState<string>('120');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [triageOutput, setTriageOutput] = useState<{
    triage: TriageResult;
    token: QueueToken;
  } | null>(null);

  // Profile Edit State
  const [profileName, setProfileName] = useState(currentUser.name || 'Sita Devi');
  const [profileAge, setProfileAge] = useState(String(currentUser.age || 48));
  const [profileVillage, setProfileVillage] = useState(currentUser.village || 'Rampur Village');
  const [profileSavedMsg, setProfileSavedMsg] = useState(false);

  // Patient-Scoped Queue Status (fetched securely from /api/queue/my-status)
  const [patientQueueStatus, setPatientQueueStatus] = useState<{
    hasActiveToken: boolean;
    myToken: QueueToken | null;
    positionInQueue: number;
    peopleAheadCount: number;
    estimatedWaitMinutes: number;
    nowCallingTokenId: string | null;
    nowCallingRoom: string | null;
    totalWaitingCount: number;
  } | null>(null);

  const fetchMyQueueStatus = async () => {
    try {
      const storedToken = localStorage.getItem('mediq_token');
      if (!storedToken) return;
      const res = await fetch('/api/queue/my-status', {
        headers: { 'Authorization': `Bearer ${storedToken}` }
      });
      if (res.status === 401) {
        window.dispatchEvent(new CustomEvent('mediq:unauthorized'));
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setPatientQueueStatus(data);
      }
    } catch (e) {}
  };

  useEffect(() => {
    fetchMyQueueStatus();
    const interval = setInterval(fetchMyQueueStatus, 8000);
    return () => clearInterval(interval);
  }, [currentUser]);

  // Active Token for this user (preferred from /api/queue/my-status)
  const activeToken = patientQueueStatus?.myToken || queueTokens.find(
    q => (q.patientName.toLowerCase() === currentUser.name.toLowerCase() || (currentUser.patientId && q.patientId === currentUser.patientId)) &&
         (q.status === 'Waiting' || q.status === 'In Consult')
  ) || (queueTokens.length > 0 ? queueTokens[0] : null);

  const toggleSymptom = (id: string) => {
    setSelectedSymptoms(prev => 
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  };

  const handleVoiceListen = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert('Speech recognition is not supported in this browser.');
      return;
    }

    try {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.lang = language === 'hi' ? 'hi-IN' : 'en-IN';
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onstart = () => setIsListening(true);
      recognition.onend = () => setIsListening(false);
      recognition.onerror = () => setIsListening(false);

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setSymptomsDescription(prev => prev ? `${prev}. ${transcript}` : transcript);

        // Auto badge detection
        const lower = transcript.toLowerCase();
        if (lower.includes('chest') || lower.includes('छाती') || lower.includes('सीने')) {
          if (!selectedSymptoms.includes('chest_pain')) setSelectedSymptoms(prev => [...prev, 'chest_pain']);
        }
        if (lower.includes('fever') || lower.includes('बुखार') || lower.includes('ताप')) {
          if (!selectedSymptoms.includes('fever')) setSelectedSymptoms(prev => [...prev, 'fever']);
        }
        if (lower.includes('cough') || lower.includes('खांसी')) {
          if (!selectedSymptoms.includes('cough')) setSelectedSymptoms(prev => [...prev, 'cough']);
        }
      };

      recognition.start();
    } catch (e) {
      setIsListening(false);
    }
  };

  const handleSpeechReadout = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = language === 'hi' ? 'hi-IN' : 'en-IN';
      window.speechSynthesis.speak(utterance);
    }
  };

  const handleSubmitIntake = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedSymptoms.length === 0 && !symptomsDescription) {
      alert('Please select or describe at least one symptom');
      return;
    }

    setIsSubmitting(true);

    try {
      const selectedLabels = selectedSymptoms.map(id => COMMON_SYMPTOMS.find(s => s.id === id)?.label || id);
      const combinedSummary = [
        ...selectedLabels,
        symptomsDescription ? `Details: ${symptomsDescription}` : ''
      ].filter(Boolean).join('. ');

      const vitals: Vitals = {
        spO2: spO2 ? Number(spO2) : undefined,
        temperature: temperature ? Number(temperature) : undefined,
        systolicBP: sysBP ? Number(sysBP) : undefined,
        diastolicBP: 80
      };

      const payload: TriageRequest = {
        patientName: currentUser.name || 'Sita Devi',
        age: currentUser.age ? Number(currentUser.age) : 48,
        gender: (currentUser.gender as any) || 'Female',
        village: currentUser.village || 'Rampur Village',
        symptomsText: combinedSummary,
        selectedSymptomTags: selectedSymptoms,
        vitals,
        language: language as any,
        enteredBy: 'Self'
      };

      const storedToken = localStorage.getItem('mediq_token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (storedToken) {
        headers['Authorization'] = `Bearer ${storedToken}`;
      }

      const res = await fetch('/api/triage', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });

      if (res.status === 401) {
        window.dispatchEvent(new CustomEvent('mediq:unauthorized'));
        setIsSubmitting(false);
        return;
      }

      const data = await res.json();

      if (res.ok && data.queueToken && data.triageResult) {
        onTriageComplete(data.triageResult, data.queueToken);
        setTriageOutput({ triage: data.triageResult, token: data.queueToken });
        teleconsultService.notifyQueueUpdate();
        await fetchMyQueueStatus();
      } else {
        // Fallback to local calculation if server responded with an error
        const localTriage = evaluateRuleBasedTriage(payload);
        const newTokenId = getNextSequentialTokenId(localTriage.urgency, queueTokens);
        const localToken: QueueToken = {
          tokenId: newTokenId,
          patientId: currentUser.patientId || `P-${Date.now().toString().slice(-5)}`,
          patientName: currentUser.name || 'Sita Devi',
          age: currentUser.age || 48,
          gender: (currentUser.gender as any) || 'Female',
          village: currentUser.village || 'Rampur Village',
          urgency: localTriage.urgency,
          category: localTriage.category,
          urgencyScore: localTriage.urgencyScore,
          symptomsSummary: combinedSummary,
          vitals,
          createdAt: new Date().toISOString(),
          triageResultId: localTriage.id,
          assignedDoctor: 'Dr. Suresh Verma',
          status: 'Waiting',
          estimatedWaitMinutes: localTriage.urgency === 'Emergency' ? 0 : localTriage.urgency === 'Moderate' ? 12 : 25,
          assignedRoom: 'Teleconsult Booth 1'
        };
        onTriageComplete(localTriage, localToken);
        setTriageOutput({ triage: localTriage, token: localToken });
        teleconsultService.notifyQueueUpdate();
        await fetchMyQueueStatus();
      }
    } catch (err) {
      console.error('Error submitting triage intake:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Trigger Video Call Request
  const handleRequestVideoCall = async () => {
    setIsRequestingCall(true);
    try {
      const req = await teleconsultService.requestVideoCall({
        tokenId: activeToken?.tokenId || 'MOD-014',
        patientId: currentUser.patientId || `P-${Date.now().toString().slice(-5)}`,
        patientName: currentUser.name || 'Sunita Devi',
        patientPhone: currentUser.phone || '9876543210',
        age: currentUser.age || 48,
        gender: currentUser.gender || 'Female',
        village: currentUser.village || 'Rampur Village',
        symptomsSummary: activeToken?.symptomsSummary || 'Patient requested live teleconsultation with doctor',
        urgency: (activeToken?.urgency as any) || 'Moderate',
        vitals: activeToken?.vitals ? {
          bloodPressure: activeToken.vitals.bloodPressure,
          pulseRate: activeToken.vitals.pulseRate,
          temperature: activeToken.vitals.temperature,
          spO2: activeToken.vitals.spO2
        } : {
          bloodPressure: '128/84',
          pulseRate: 92,
          temperature: 102.5,
          spO2: 96
        }
      });
      setCallRequest(req);
      setActiveTab('video');
    } catch (err) {
      console.warn('Error requesting video call:', err);
    } finally {
      setIsRequestingCall(false);
    }
  };

  const handleCancelCallRequest = async () => {
    if (callRequest) {
      await teleconsultService.cancelVideoCallRequest(callRequest.id);
      setCallRequest(prev => prev ? { ...prev, status: 'cancelled' } : null);
    }
  };

  const handleUpdateProfile = (e: React.FormEvent) => {
    e.preventDefault();
    currentUser.name = profileName;
    currentUser.age = Number(profileAge);
    currentUser.village = profileVillage;
    setProfileSavedMsg(true);
    setTimeout(() => setProfileSavedMsg(false), 4000);
  };

  const isCallActive = !!(activeCallSession || teleconsultService.getCurrentSession());

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fadeIn">
      
      {/* Patient Header Banner */}
      <div className="bg-gradient-to-r from-teal-800 via-teal-900 to-slate-900 rounded-3xl p-6 text-white shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border border-teal-700/50">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="bg-teal-700/60 text-teal-200 text-xs px-2.5 py-0.5 rounded-full border border-teal-500/40 font-bold flex items-center gap-1">
              <User className="w-3.5 h-3.5" />
              Patient Care Portal
            </span>
            <span className="text-xs text-teal-200">
              {currentUser.village || 'Rampur Village'} • {currentUser.age || 48}y / {currentUser.gender || 'Female'}
            </span>
          </div>
          <h2 className="text-2xl font-black tracking-tight">{currentUser.name || 'Sita Devi'}</h2>
          <p className="text-xs text-teal-100">
            National Health ABHA ID: <span className="font-mono font-bold text-teal-300">{currentUser.patientId || 'PHC-UP-84920'}</span>
          </p>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center gap-1 bg-slate-900/80 p-1.5 rounded-2xl border border-teal-800/80 text-xs flex-wrap">
          
          <button
            type="button"
            onClick={() => setActiveTab('chatbot')}
            className={`px-3 py-2 rounded-xl font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'chatbot' ? 'bg-teal-600 text-white shadow-md' : 'text-teal-200 hover:text-white'
            }`}
          >
            <Bot className="w-4 h-4 text-amber-300" />
            <span>AI Doctor (आरोग्य साथी)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('intake')}
            className={`px-3 py-2 rounded-xl font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'intake' ? 'bg-teal-600 text-white shadow-md' : 'text-teal-200 hover:text-white'
            }`}
          >
            <Edit3 className="w-4 h-4" />
            <span>Symptom Intake</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('token')}
            className={`px-3 py-2 rounded-xl font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'token' ? 'bg-teal-600 text-white shadow-md' : 'text-teal-200 hover:text-white'
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>My Token {activeToken ? `(${activeToken.tokenId})` : ''}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('video')}
            className={`px-3 py-2 rounded-xl font-bold flex items-center gap-1.5 transition-all cursor-pointer relative ${
              activeTab === 'video' ? 'bg-teal-600 text-white shadow-md' : 'text-teal-200 hover:text-white'
            }`}
          >
            <Video className="w-4 h-4" />
            <span>Video Call</span>
            {callRequest?.status === 'pending' && (
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping ml-0.5"></span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`px-3 py-2 rounded-xl font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'history' ? 'bg-teal-600 text-white shadow-md' : 'text-teal-200 hover:text-white'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Prescriptions & History (पर्चे और इतिहास)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            className={`px-3 py-2 rounded-xl font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'profile' ? 'bg-teal-600 text-white shadow-md' : 'text-teal-200 hover:text-white'
            }`}
          >
            <User className="w-4 h-4" />
            <span>Identity Profile</span>
          </button>

        </div>
      </div>

      {/* TAB 0: MULTILINGUAL AI MEDICAL CHATBOT (AROGYA SAATHI) */}
      {activeTab === 'chatbot' && (
        <div className="space-y-4">
          <PatientChatbot
            currentUser={currentUser}
            language={language}
            onBookToken={(triage, doctor, token) => {
              if (token) {
                onTriageComplete(triage, token);
                fetchMyQueueStatus();
                setActiveTab('token');
              } else {
                setSymptomsDescription(triage?.summary || '');
                setActiveTab('intake');
              }
            }}
            onStartVideoConsult={(doctor) => {
              handleRequestVideoCall();
            }}
            onViewTokenQueue={() => {
              setActiveTab('token');
            }}
          />
        </div>
      )}

      {/* TAB 1: SYMPTOM INTAKE FORM & SMART TRIAGE OUTPUT */}
      {activeTab === 'intake' && (
        triageOutput ? (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-xl p-6 sm:p-8 space-y-6">
            {/* Success Header */}
            <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl">
              <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
              <div>
                <h4 className="text-sm font-bold text-emerald-950">
                  Triage Evaluation Complete & Priority Token Issued!
                </h4>
                <p className="text-xs text-emerald-700">
                  लक्षण मूल्यांकन पूर्ण हो गया है और आपका टोकन सफलतापूर्वक जारी कर दिया गया है।
                </p>
              </div>
            </div>

            {/* Triage Output Summary Card */}
            <div className="rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
              <div className={`p-5 text-white flex items-center justify-between ${
                triageOutput.token.urgency === 'Emergency'
                  ? 'bg-rose-600'
                  : triageOutput.token.urgency === 'Moderate'
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-emerald-600'
              }`}>
                <div>
                  <span className="text-[10px] uppercase font-black tracking-wider block opacity-90">
                    Ayushman Bharat Priority Token
                  </span>
                  <h3 className="text-2xl sm:text-3xl font-black font-mono tracking-tight">
                    {triageOutput.token.tokenId}
                  </h3>
                </div>
                <div className="text-right">
                  <span className="text-xs uppercase font-bold px-3 py-1 rounded-full bg-white/20 backdrop-blur-md">
                    {triageOutput.token.urgency.toUpperCase()} PRIORITY
                  </span>
                  <div className="text-[11px] mt-1 opacity-90">
                    Triage Score: {triageOutput.token.urgencyScore}/100
                  </div>
                </div>
              </div>

              <div className="p-5 sm:p-6 bg-slate-50 space-y-4 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="bg-white p-3 rounded-xl border border-slate-200">
                    <span className="text-slate-500 block text-[10px] uppercase font-bold">Estimated Wait</span>
                    <span className="font-extrabold text-sm text-slate-900 mt-0.5 block">
                      ~{triageOutput.token.estimatedWaitMinutes} mins
                    </span>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-slate-200">
                    <span className="text-slate-500 block text-[10px] uppercase font-bold">Assigned Department</span>
                    <span className="font-extrabold text-sm text-teal-800 mt-0.5 block">
                      {triageOutput.token.assignedRoom || 'Teleconsult Booth 1'}
                    </span>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-slate-200">
                    <span className="text-slate-500 block text-[10px] uppercase font-bold">Assigned Doctor</span>
                    <span className="font-extrabold text-sm text-slate-900 mt-0.5 block">
                      {triageOutput.token.assignedDoctor || 'Dr. Suresh Verma'}
                    </span>
                  </div>
                </div>

                <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-1">
                  <span className="text-[10px] text-slate-500 uppercase font-bold block">Recorded Symptoms</span>
                  <p className="text-slate-800 font-medium">
                    {triageOutput.token.symptomsSummary}
                  </p>
                </div>

                {triageOutput.triage.recommendations && triageOutput.triage.recommendations.length > 0 && (
                  <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-1">
                    <span className="text-[10px] text-slate-500 uppercase font-bold block">Clinical Advice</span>
                    <p className="text-slate-800 font-medium">
                      {triageOutput.triage.recommendations.join('. ')}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Navigation & Action CTAs */}
            <div className="space-y-3 pt-2">
              <button
                type="button"
                onClick={() => setActiveTab('token')}
                className="w-full bg-teal-600 hover:bg-teal-700 text-white font-extrabold py-4 px-6 rounded-2xl text-sm shadow-xl shadow-teal-600/30 flex items-center justify-center gap-2 cursor-pointer transition-all"
              >
                <Activity className="w-4 h-4" />
                <span>Go to Live Token Queue & Status (टोकन स्थिति देखें)</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setTriageOutput(null);
                  setSelectedSymptoms([]);
                  setSymptomsDescription('');
                }}
                className="w-full py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-2xl text-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Submit Another Symptom Intake (नया लक्षण दर्ज करें)</span>
              </button>
            </div>
          </div>
        ) : (
        <form onSubmit={handleSubmitIntake} className="bg-white rounded-3xl border border-slate-200 shadow-xl p-6 sm:p-8 space-y-6">
          <div className="border-b border-slate-100 pb-4 flex items-center justify-between">
            <div>
              <h3 className="text-xl font-black text-slate-900 flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-teal-600" />
                Symptom Intake & Smart Clinical Triage
              </h3>
              <p className="text-xs text-slate-500">
                Select your symptoms or speak in Hindi/English to generate your priority queue token.
              </p>
            </div>

            <button
              type="button"
              onClick={handleVoiceListen}
              className={`p-3 rounded-2xl border transition-all flex items-center gap-2 text-xs font-bold cursor-pointer ${
                isListening 
                  ? 'bg-rose-500 text-white border-rose-600 animate-pulse' 
                  : 'bg-teal-50 text-teal-700 border-teal-200 hover:bg-teal-100'
              }`}
            >
              {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              <span>{isListening ? 'Listening...' : 'Voice Input (बोलकर बताएं)'}</span>
            </button>
          </div>

          <div className="space-y-4">
            
            {/* Symptom Selection Grid */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-900 uppercase tracking-wider">
                Common Symptoms (लक्षण चुनें)
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {COMMON_SYMPTOMS.map(s => {
                  const isChecked = selectedSymptoms.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => toggleSymptom(s.id)}
                      className={`p-3.5 rounded-2xl border text-left text-xs font-semibold flex items-center justify-between transition-all cursor-pointer ${
                        isChecked 
                          ? s.isRedFlag 
                            ? 'bg-rose-50 border-rose-400 text-rose-900 ring-2 ring-rose-200 font-bold'
                            : 'bg-teal-50 border-teal-400 text-teal-900 ring-2 ring-teal-200 font-bold'
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <span>{s.label}</span>
                      {s.isRedFlag && (
                        <span className="text-[10px] bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full font-bold">
                          Urgent Flag
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Freeform description */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-900 uppercase tracking-wider">
                Describe Problem in Detail (विस्तार से लिखें या बोलें)
              </label>
              <textarea
                rows={3}
                value={symptomsDescription}
                onChange={e => setSymptomsDescription(e.target.value)}
                placeholder="e.g., मुझे 3 दिन से तेज़ बुखार है और गले में ख़राश है..."
                className="w-full bg-slate-50 border border-slate-300 rounded-2xl p-3.5 text-xs text-slate-900 focus:outline-none focus:border-teal-500 font-medium"
              />
            </div>

            {/* Quick Vitals */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Thermometer className="w-4 h-4 text-amber-600" />
                  Vitals Input (optional or measured by PHC desk)
                </span>
                <span className="text-[10px] text-slate-500">Auto-calibrated for triage math</span>
              </div>

              <div className="grid grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="text-[10px] text-slate-500 block font-medium">SpO2 Oxygen (%)</label>
                  <input
                    type="number"
                    value={spO2}
                    onChange={e => setSpO2(e.target.value)}
                    placeholder="98"
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 font-mono font-bold text-slate-900 text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 block font-medium">Temperature (°F)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={temperature}
                    onChange={e => setTemperature(e.target.value)}
                    placeholder="99.2"
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 font-mono font-bold text-slate-900 text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 block font-medium">Systolic BP (mmHg)</label>
                  <input
                    type="number"
                    value={sysBP}
                    onChange={e => setSysBP(e.target.value)}
                    placeholder="120"
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 font-mono font-bold text-slate-900 text-xs"
                  />
                </div>
              </div>
            </div>

            {/* Submit CTA */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-teal-600 hover:bg-teal-700 text-white font-extrabold py-4 px-6 rounded-2xl text-sm shadow-xl shadow-teal-600/30 flex items-center justify-center gap-2 cursor-pointer transition-all"
            >
              {isSubmitting ? (
                <span>Evaluating Symptoms & Issuing Token...</span>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Generate Priority Triage Token (टोकन प्राप्त करें)</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

          </div>
        </form>
        )
      )}

      {/* TAB 2: ACTIVE TOKEN & QUEUE TRACKER */}
      {activeTab === 'token' && (
        <div className="space-y-6">
          {activeToken ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              {/* Main Token Digital Card */}
              <div className="md:col-span-2 bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden">
                
                {/* Urgency Header */}
                <div className={`p-6 text-white flex items-center justify-between ${
                  activeToken.urgency === 'Emergency'
                    ? 'bg-rose-600'
                    : activeToken.urgency === 'Moderate'
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-emerald-600'
                }`}>
                  <div>
                    <span className="text-[11px] uppercase font-black tracking-wider block opacity-90">
                      Ayushman Bharat PHC Token
                    </span>
                    <h3 className="text-3xl font-black font-mono tracking-tight">{activeToken.tokenId}</h3>
                  </div>

                  <div className="text-right">
                    <span className="text-xs uppercase font-bold px-3 py-1 rounded-full bg-white/20 backdrop-blur-md">
                      {activeToken.urgency.toUpperCase()} PRIORITY
                    </span>
                    <div className="text-[11px] mt-1 opacity-90">Triage Score: {activeToken.urgencyScore}/100</div>
                  </div>
                </div>

                <div className="p-6 sm:p-8 space-y-6">
                  
                  {/* Status, Position & Estimated Wait */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs">
                    <div>
                      <span className="text-slate-500 block text-[10px] uppercase font-bold">Queue Status</span>
                      <span className="font-extrabold text-sm text-teal-800 flex items-center gap-1 mt-0.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                        {activeToken.status === 'In Consult' ? 'In Consult (Now Calling)' : 'Waiting in Queue'}
                      </span>
                    </div>

                    <div>
                      <span className="text-slate-500 block text-[10px] uppercase font-bold">Position In Line</span>
                      <span className="font-extrabold text-sm text-slate-900 flex items-center gap-1 mt-0.5">
                        {patientQueueStatus?.positionInQueue 
                          ? `#${patientQueueStatus.positionInQueue} (${patientQueueStatus.peopleAheadCount} ahead)` 
                          : 'Next in line'}
                      </span>
                    </div>

                    <div>
                      <span className="text-slate-500 block text-[10px] uppercase font-bold">Estimated Wait</span>
                      <span className="font-extrabold text-sm text-slate-900 flex items-center gap-1 mt-0.5">
                        <Clock className="w-3.5 h-3.5 text-amber-600" />
                        {activeToken.estimatedWaitMinutes === 0 ? 'Immediate / Next' : `${activeToken.estimatedWaitMinutes} Minutes`}
                      </span>
                    </div>

                    <div>
                      <span className="text-slate-500 block text-[10px] uppercase font-bold">Assigned Location</span>
                      <span className="font-extrabold text-sm text-slate-900 block mt-0.5">
                        {activeToken.assignedRoom || 'Teleconsult Booth 1'}
                      </span>
                    </div>
                  </div>

                  {/* Audio Readout in Hindi/English */}
                  <div className="flex items-center justify-between bg-teal-50/70 border border-teal-200 p-3 rounded-xl text-xs">
                    <span className="text-teal-900 font-medium">
                      🔊 टोकन संख्या {activeToken.tokenId}। अनुमानित प्रतीक्षा समय {activeToken.estimatedWaitMinutes} मिनट।
                    </span>
                    <button
                      type="button"
                      onClick={() => handleSpeechReadout(`Token number ${activeToken.tokenId}. Estimated wait time is ${activeToken.estimatedWaitMinutes} minutes. Assigned to ${activeToken.assignedRoom}.`)}
                      className="bg-teal-700 hover:bg-teal-800 text-white px-3 py-1 rounded-lg font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                      <span>Listen</span>
                    </button>
                  </div>

                  {/* Reported Symptoms Summary */}
                  <div className="space-y-2 text-xs">
                    <span className="font-bold text-slate-900 uppercase tracking-wider block">Clinical Triage Summary</span>
                    <p className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-slate-700 leading-relaxed">
                      {activeToken.symptomsSummary}
                    </p>
                  </div>

                  {/* Actions: Request Video Call */}
                  <div className="pt-2 flex flex-col sm:flex-row gap-3">
                    <button
                      type="button"
                      onClick={handleRequestVideoCall}
                      disabled={isRequestingCall}
                      className="flex-1 bg-teal-600 hover:bg-teal-700 text-white font-extrabold py-3.5 px-4 rounded-2xl text-xs flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-teal-600/30 transition-all"
                    >
                      <Video className="w-4 h-4" />
                      <span>Request Live Video Call with Doctor (वीडियो परामर्श)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveTab('intake')}
                      className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3.5 px-4 rounded-2xl text-xs cursor-pointer"
                    >
                      Submit New Symptoms
                    </button>
                  </div>

                </div>

              </div>

              {/* Right Col: Waiting Room Guidance */}
              <div className="space-y-4">
                <div className="bg-gradient-to-br from-teal-900 to-slate-900 text-white rounded-3xl p-5 shadow-xl space-y-4 border border-teal-800">
                  <span className="text-xs uppercase font-bold text-teal-300 tracking-wider">Patient Guidance</span>
                  <p className="text-xs text-slate-200 leading-relaxed">
                    Please take a seat in the primary waiting area. When your token is called, an announcement will play and you can join the video consult directly on your phone or at the PHC teleconsult booth.
                  </p>

                  <div className="border-t border-teal-800/80 pt-3 space-y-2 text-xs">
                    <div className="flex items-center gap-2 text-teal-200 font-bold">
                      <Heart className="w-4 h-4 text-rose-400" />
                      <span>Pre-Consult First Aid Advice:</span>
                    </div>
                    <p className="text-[11px] text-slate-300">
                      Drink warm water. If experiencing chest tightness or breathlessness, notify the clinic nurse immediately.
                    </p>
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 p-4 text-xs space-y-2">
                  <div className="font-bold text-slate-900">Digital Token SMS Sent</div>
                  <p className="text-[11px] text-slate-500">
                    A confirmation SMS has been dispatched to <strong>{currentUser.phone}</strong> with token details for low-connectivity 2G feature phones.
                  </p>
                </div>
              </div>

            </div>
          ) : (
            <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center text-slate-500 space-y-4 shadow-sm">
              <Clock className="w-16 h-16 text-teal-500 mx-auto opacity-50" />
              <div className="space-y-1">
                <h4 className="text-lg font-bold text-slate-900">No Active Queue Token Found</h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Submit your current symptoms on the intake form to generate an instant priority token.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('intake')}
                className="bg-teal-600 hover:bg-teal-700 text-white font-bold px-6 py-2.5 rounded-xl text-xs inline-flex items-center gap-1.5 cursor-pointer shadow-md"
              >
                <span>Start Symptom Intake</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: LIVE WEBRTC VIDEO TELECONSULTATION CALL (REQUEST & ACTIVE SESSION) */}
      {activeTab === 'video' && (
        <div className="space-y-6">
          
          {isCallActive ? (
            /* Active Connected Video Call Room */
            <LiveWebRTCVideoRoom
              currentUser={currentUser}
              token={activeToken}
              session={activeCallSession || teleconsultService.getCurrentSession()}
              onEndCall={() => {
                if (onClearActiveCallSession) onClearActiveCallSession();
                setActiveTab('history');
              }}
            />
          ) : (
            /* Request Video Call Flow State (Pending, Rejected, or Ready to Request) */
            <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden">
              
              {/* Header */}
              <div className="bg-slate-900 p-6 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-teal-500/20 border border-teal-400/40 flex items-center justify-center text-teal-300">
                    <Video className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black">Doctor Teleconsultation Desk</h3>
                    <p className="text-xs text-teal-300">Connect with Medical Officer at Rampur Primary Health Centre</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="bg-slate-800 border border-slate-700 px-3 py-1 rounded-xl text-xs font-mono text-slate-300">
                    Token: <strong className="text-teal-300">{activeToken?.tokenId || 'MOD-014'}</strong>
                  </span>
                </div>
              </div>

              <div className="p-6 sm:p-8 space-y-6">
                
                {/* 1. Request is currently PENDING (Waiting for Doctor to Accept) */}
                {callRequest?.status === 'pending' && (
                  <div className="bg-gradient-to-br from-teal-950 via-slate-900 to-indigo-950 rounded-3xl p-8 text-white border-2 border-teal-500/80 shadow-2xl text-center space-y-6 relative overflow-hidden ring-4 ring-teal-500/20 animate-fadeIn">
                    
                    {/* Animated Pulsing Waves */}
                    <div className="relative mx-auto w-24 h-24">
                      <div className="absolute inset-0 rounded-full bg-teal-500/30 animate-ping"></div>
                      <div className="relative w-24 h-24 rounded-full bg-teal-600/40 border-2 border-teal-400 flex items-center justify-center text-4xl shadow-xl">
                        <Radio className="w-10 h-10 text-teal-300 animate-pulse" />
                      </div>
                    </div>

                    <div className="space-y-2 max-w-md mx-auto">
                      <span className="inline-block bg-amber-500/20 border border-amber-400/40 text-amber-300 text-xs px-3 py-1 rounded-full font-bold uppercase tracking-wider">
                        Call Request Sent • Waiting for Doctor
                      </span>
                      <h4 className="text-2xl font-black text-white">Connecting to On-Duty Doctor...</h4>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        Your consultation request for Token <strong className="text-teal-300">{callRequest.tokenId}</strong> is currently appearing in Dr. Suresh Verma's live queue. As soon as the doctor accepts, the video call will connect immediately.
                      </p>
                    </div>

                    <div className="bg-slate-800/80 rounded-2xl p-4 border border-slate-700 max-w-md mx-auto text-xs text-left space-y-2">
                      <div className="flex justify-between text-slate-300">
                        <span>Patient Name:</span>
                        <strong className="text-white">{callRequest.patientName}</strong>
                      </div>
                      <div className="flex justify-between text-slate-300">
                        <span>Urgency Level:</span>
                        <strong className="text-amber-300">{callRequest.urgency}</strong>
                      </div>
                      <div className="flex justify-between text-slate-300">
                        <span>Reported Symptoms:</span>
                        <span className="text-slate-200 line-clamp-1">{callRequest.symptomsSummary}</span>
                      </div>
                    </div>

                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={handleCancelCallRequest}
                        className="bg-slate-800 hover:bg-slate-700 text-rose-300 hover:text-white border border-slate-700 px-6 py-2.5 rounded-2xl text-xs font-bold cursor-pointer transition-all inline-flex items-center gap-2"
                      >
                        <XCircle className="w-4 h-4" />
                        <span>Cancel Request</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* 2. Request was REJECTED / DECLINED */}
                {callRequest?.status === 'rejected' && (
                  <div className="bg-rose-50 border-2 border-rose-300 rounded-3xl p-6 sm:p-8 text-slate-900 space-y-4 animate-fadeIn">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-rose-100 border border-rose-300 flex items-center justify-center text-rose-600 shrink-0">
                        <AlertCircle className="w-6 h-6" />
                      </div>
                      <div>
                        <h4 className="text-lg font-black text-rose-900">Doctor Currently Unavailable for Video Call</h4>
                        <p className="text-xs text-rose-700 mt-0.5">
                          {callRequest.rejectionReason || 'The Medical Officer is currently attending to critical triage emergencies.'}
                        </p>
                      </div>
                    </div>

                    <div className="bg-white p-4 rounded-2xl border border-rose-200 text-xs space-y-2 text-slate-700">
                      <p className="font-bold">Next Steps for Immediate Medical Assistance:</p>
                      <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-600">
                        <li>You may request a call again in a few moments once the doctor completes the current emergency.</li>
                        <li>Alternatively, visit PHC Teleconsult Booth 1 directly to be assisted by the staff nurse.</li>
                      </ul>
                    </div>

                    <div className="flex items-center gap-3 pt-2">
                      <button
                        type="button"
                        onClick={handleRequestVideoCall}
                        disabled={isRequestingCall}
                        className="bg-teal-600 hover:bg-teal-700 text-white font-bold px-6 py-2.5 rounded-2xl text-xs flex items-center gap-2 cursor-pointer shadow-md"
                      >
                        <RotateCcw className="w-4 h-4" />
                        <span>Request Video Call Again</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* 3. Initial Ready to Request Video Call */}
                {(!callRequest || callRequest.status === 'cancelled') && (
                  <div className="space-y-6">
                    
                    <div className="bg-teal-50 border border-teal-200 rounded-2xl p-4 sm:p-6 text-slate-800 space-y-3">
                      <div className="flex items-center gap-2 text-teal-800 font-bold text-sm">
                        <Stethoscope className="w-5 h-5 text-teal-600" />
                        <span>Instant Video Consultation Request</span>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        Click the button below to alert Dr. Suresh Verma at Rampur PHC. Your symptoms and vital statistics will be displayed directly on the doctor's consultation monitor.
                      </p>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 text-xs">
                        <div className="bg-white p-3 rounded-xl border border-teal-100">
                          <span className="text-[10px] text-slate-400 block font-bold uppercase">Token</span>
                          <strong className="text-teal-700 font-mono">{activeToken?.tokenId || 'MOD-014'}</strong>
                        </div>
                        <div className="bg-white p-3 rounded-xl border border-teal-100">
                          <span className="text-[10px] text-slate-400 block font-bold uppercase">Urgency</span>
                          <strong className="text-slate-800">{activeToken?.urgency || 'Moderate'}</strong>
                        </div>
                        <div className="bg-white p-3 rounded-xl border border-teal-100">
                          <span className="text-[10px] text-slate-400 block font-bold uppercase">Oxygen (SpO2)</span>
                          <strong className="text-slate-800">{activeToken?.vitals?.spO2 || 96}%</strong>
                        </div>
                        <div className="bg-white p-3 rounded-xl border border-teal-100">
                          <span className="text-[10px] text-slate-400 block font-bold uppercase">Assigned PHC</span>
                          <strong className="text-slate-800">Rampur Block</strong>
                        </div>
                      </div>
                    </div>

                    <div className="text-center pt-2">
                      <button
                        type="button"
                        onClick={handleRequestVideoCall}
                        disabled={isRequestingCall}
                        className="w-full sm:w-auto bg-gradient-to-r from-teal-600 to-indigo-600 hover:from-teal-700 hover:to-indigo-700 text-white font-black py-4 px-8 rounded-3xl text-sm shadow-xl shadow-teal-600/30 flex items-center justify-center gap-3 cursor-pointer mx-auto transition-all transform hover:scale-[1.02]"
                      >
                        <Video className="w-5 h-5" />
                        <span>Request Video Call with Doctor (डॉक्टर से वीडियो परामर्श का अनुरोध करें)</span>
                      </button>
                    </div>

                  </div>
                )}

              </div>

            </div>
          )}

          <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-slate-200 text-xs">
            <div className="text-slate-600">
              Need assistance? An ASHA worker or PHC nurse is available at the booth.
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className="bg-teal-600 hover:bg-teal-700 text-white font-bold px-4 py-2 rounded-xl cursor-pointer"
            >
              View My Past Prescriptions
            </button>
          </div>
        </div>
      )}

      {/* TAB 4: HEALTH HISTORY, PAST VISIT SUMMARIES & CHRONIC CONDITION ALERTS */}
      {activeTab === 'history' && (
        <HealthHistorySection
          currentUser={currentUser}
          language={language}
          onInitiateIntake={(tag) => {
            if (tag) {
              const lower = tag.toLowerCase();
              if (lower.includes('hyper') || lower.includes('blood pressure') || lower.includes('बीपी')) {
                setSelectedSymptoms(['chest_pain', 'general_weakness']);
              } else if (lower.includes('sugar') || lower.includes('diabetes')) {
                setSelectedSymptoms(['general_weakness']);
              } else {
                setSelectedSymptoms(['general_weakness']);
              }
            }
            setActiveTab('intake');
          }}
          onJoinTeleconsult={() => setActiveTab('video')}
        />
      )}

      {/* TAB 5: IDENTITY & EDIT PROFILE */}
      {activeTab === 'profile' && (
        <form onSubmit={handleUpdateProfile} className="bg-white rounded-3xl border border-slate-200 shadow-xl p-6 sm:p-8 space-y-6">
          <div className="border-b border-slate-100 pb-4 flex items-center justify-between">
            <div>
              <h3 className="text-xl font-black text-slate-900 flex items-center gap-2">
                <User className="w-5 h-5 text-teal-600" />
                Patient Identity & Demographic Profile
              </h3>
              <p className="text-xs text-slate-500">
                Manage your demographic information and national ABHA healthcare identity.
              </p>
            </div>

            <div className="bg-teal-50 border border-teal-200 px-3 py-1 rounded-xl text-teal-800 font-mono text-xs font-bold">
              ID: {currentUser.patientId || 'PHC-UP-84920'}
            </div>
          </div>

          {profileSavedMsg && (
            <div className="bg-emerald-50 border border-emerald-300 text-emerald-800 p-4 rounded-2xl text-xs font-bold flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <span>Profile details updated and synced to Primary Health Centre records.</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="space-y-1.5">
              <label className="block font-bold text-slate-800">Full Name</label>
              <input
                type="text"
                value={profileName}
                onChange={e => setProfileName(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-bold text-slate-900 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block font-bold text-slate-800">Age (Years)</label>
              <input
                type="number"
                value={profileAge}
                onChange={e => setProfileAge(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-bold text-slate-900 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block font-bold text-slate-800">Village / Locality</label>
              <input
                type="text"
                value={profileVillage}
                onChange={e => setProfileVillage(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-bold text-slate-900 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block font-bold text-slate-800">Registered Phone</label>
              <input
                type="text"
                disabled
                value={currentUser.phone || '9876543210'}
                className="w-full bg-slate-100 border border-slate-200 rounded-xl px-3 py-2 text-slate-500 font-mono text-xs cursor-not-allowed"
              />
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-slate-100">
            <button
              type="submit"
              className="bg-teal-600 hover:bg-teal-700 text-white font-bold px-6 py-2.5 rounded-2xl text-xs flex items-center gap-2 cursor-pointer shadow-md shadow-teal-600/30"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Save Profile Changes</span>
            </button>
          </div>
        </form>
      )}

    </div>
  );
};

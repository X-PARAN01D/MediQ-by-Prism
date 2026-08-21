import React, { useState, useEffect } from 'react';
import { AppUser, QueueToken, Patient, Prescription, AppLanguage } from '../types';
import { 
  Stethoscope, 
  Video, 
  FileText, 
  Users, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  Phone, 
  Plus, 
  Trash2, 
  Printer, 
  ShieldAlert, 
  Activity, 
  Heart, 
  ChevronRight,
  Send,
  Sparkles,
  PhoneCall,
  XCircle,
  CheckCircle,
  Bell,
  Radio,
  Thermometer,
  ShieldCheck
} from 'lucide-react';
import { LiveWebRTCVideoRoom } from './LiveWebRTCVideoRoom';
import { teleconsultService, TeleconsultSession, VideoCallRequest } from '../services/teleconsultService';
import { PrescriptionPDFModal } from './PrescriptionPDFModal';

interface DoctorDashboardViewProps {
  currentUser: AppUser;
  queueTokens: QueueToken[];
  onCallNext: () => void;
  onSelectPatientToConsult: (token: QueueToken) => void;
  onSavePrescription: (rx: Partial<Prescription>) => void;
  language: AppLanguage;
}

export const DoctorDashboardView: React.FC<DoctorDashboardViewProps> = ({
  currentUser,
  queueTokens,
  onCallNext,
  onSelectPatientToConsult,
  onSavePrescription,
  language
}) => {
  const [activeTab, setActiveTab] = useState<'queue' | 'consult' | 'prescription'>('queue');
  
  // Real-time Pending Video Call Requests
  const [pendingRequests, setPendingRequests] = useState<VideoCallRequest[]>([]);
  const [incomingAlert, setIncomingAlert] = useState<VideoCallRequest | null>(null);

  // Currently consulting patient
  const inConsultToken = queueTokens.find(q => q.status === 'In Consult') || queueTokens[0];
  const [selectedToken, setSelectedToken] = useState<QueueToken>(inConsultToken || queueTokens[0]);

  // Video call local controls & state
  const [callConnected, setCallConnected] = useState(false);
  const [activeSession, setActiveSession] = useState<TeleconsultSession | null>(null);

  // Prescription Form State
  const [diagnosis, setDiagnosis] = useState(
    selectedToken?.urgency === 'Emergency' ? 'Suspected Acute Coronary Syndrome' : 'Acute Upper Respiratory Tract Infection with Mild Bronchospasm'
  );
  const [advice, setAdvice] = useState('Rest adequately, drink lukewarm water, avoid cold foods, and return if high fever persists.');
  const [followUpDays, setFollowUpDays] = useState(5);
  const [medications, setMedications] = useState([
    {
      name: 'Paracetamol 500mg (पैरासिटामोल)',
      dosage: '1 tablet',
      frequency: 'Thrice daily after meals (सुबह / दोपहर / रात)',
      duration: '3 days',
      instructions: 'For fever above 100°F'
    },
    {
      name: 'Cetirizine 10mg (सिट्रीज़िन)',
      dosage: '1 tablet',
      frequency: 'Once at bedtime (रात को)',
      duration: '5 days',
      instructions: 'For rhinitis / runny nose'
    },
    {
      name: 'ORS Sachet (ओ.आर.एस.)',
      dosage: '1 packet in 1L water',
      frequency: 'Sip throughout the day',
      duration: '2 days',
      instructions: 'Electrolyte hydration'
    }
  ]);

  const [savedSuccessMsg, setSavedSuccessMsg] = useState(false);

  // Load and subscribe to real-time incoming video call requests
  useEffect(() => {
    // Initial fetch
    teleconsultService.fetchPendingRequests().then(reqs => {
      setPendingRequests(reqs);
    });

    // Subscriptions
    const unsubUpdated = teleconsultService.on('requests:updated', (reqs: VideoCallRequest[]) => {
      setPendingRequests(reqs);
    });

    const unsubIncoming = teleconsultService.on('request:incoming', (req: VideoCallRequest) => {
      setIncomingAlert(req);
      // auto clear banner after 8s
      setTimeout(() => {
        setIncomingAlert(prev => (prev?.id === req.id ? null : prev));
      }, 8000);
    });

    const unsubConnected = teleconsultService.on('call:connected', (session: TeleconsultSession) => {
      setActiveSession(session);
      setCallConnected(true);
      setActiveTab('consult');
      // Match queue token if possible
      const matchingToken = queueTokens.find(q => q.tokenId === session.tokenId);
      if (matchingToken) {
        setSelectedToken(matchingToken);
      }
    });

    const unsubEnded = teleconsultService.on('call:ended', () => {
      setActiveSession(null);
      setCallConnected(false);
    });

    return () => {
      unsubUpdated();
      unsubIncoming();
      unsubConnected();
      unsubEnded();
    };
  }, [queueTokens]);

  // Filter and sort tokens by urgency
  const waitingTokens = queueTokens
    .filter(q => q.status === 'Waiting')
    .sort((a, b) => {
      const priority = { Emergency: 0, Moderate: 1, Minor: 2 };
      if (priority[a.urgency] !== priority[b.urgency]) {
        return priority[a.urgency] - priority[b.urgency];
      }
      return b.urgencyScore - a.urgencyScore;
    });

  const completedTokens = queueTokens.filter(q => q.status === 'Completed');
  const emergencyCount = queueTokens.filter(q => q.urgency === 'Emergency' && q.status !== 'Completed').length;

  // Handle Doctor Accepting Video Call Request
  const handleAcceptRequest = async (req: VideoCallRequest) => {
    try {
      // Find or create matching token
      let token = queueTokens.find(q => q.tokenId === req.tokenId);
      if (!token) {
        token = {
          tokenId: req.tokenId,
          patientId: req.patientId,
          patientName: req.patientName,
          age: req.age || 45,
          gender: (req.gender as any) || 'Female',
          village: req.village || 'Rampur Village',
          urgency: req.urgency || 'Moderate',
          category: req.urgency === 'Emergency' ? 'RED' : req.urgency === 'Moderate' ? 'YELLOW' : 'GREEN',
          symptomsSummary: req.symptomsSummary || 'Patient teleconsultation request',
          vitals: req.vitals ? {
            spO2: req.vitals.spO2,
            temperature: req.vitals.temperature,
            systolicBP: 120,
            diastolicBP: 80,
            pulseRate: req.vitals.pulseRate
          } : undefined,
          createdAt: req.requestedAt,
          triageResultId: `res_${req.tokenId}`,
          assignedDoctor: currentUser.name || 'Dr. Suresh Verma',
          assignedRoom: 'Teleconsult Desk 1',
          urgencyScore: req.urgency === 'Emergency' ? 95 : req.urgency === 'Moderate' ? 60 : 30,
          status: 'In Consult',
          estimatedWaitMinutes: 0
        };
      }

      setSelectedToken(token);
      onSelectPatientToConsult(token);
      setActiveTab('consult');
      setCallConnected(true);
      setIncomingAlert(null);

      await teleconsultService.acceptCallRequest(req.id, {
        doctorId: currentUser.id || 'doc_suresh_verma',
        doctorName: currentUser.name || 'Dr. Suresh Verma',
        doctorSpecialty: currentUser.doctorSpecialty || 'General Medical Officer',
        doctorHospital: currentUser.doctorHospital || 'Rampur Primary Health Centre'
      });
    } catch (err) {
      console.warn('Error accepting call request:', err);
    }
  };

  // Handle Doctor Declining Video Call Request
  const handleRejectRequest = async (requestId: string) => {
    try {
      await teleconsultService.rejectCallRequest(
        requestId,
        'Doctor is currently attending to critical emergency triage patients. Please visit PHC booth.',
        currentUser.name || 'Dr. Suresh Verma'
      );
      setPendingRequests(prev => prev.filter(r => r.id !== requestId));
      if (incomingAlert?.id === requestId) {
        setIncomingAlert(null);
      }
    } catch (err) {
      console.warn('Error rejecting call request:', err);
    }
  };

  const handleStartConsultWithToken = async (token: QueueToken) => {
    setSelectedToken(token);
    onSelectPatientToConsult(token);
    setActiveTab('consult');
    setCallConnected(true);

    try {
      await teleconsultService.initiateCall(token, currentUser.doctorHospital || 'Rampur Primary Health Centre');
    } catch (err) {
      console.warn('Error initiating teleconsult call:', err);
    }
  };

  const handleAddMedicine = () => {
    setMedications(prev => [
      ...prev,
      {
        name: 'Amoxicillin 500mg',
        dosage: '1 capsule',
        frequency: 'Twice daily (सुबह / रात)',
        duration: '5 days',
        instructions: 'After meals'
      }
    ]);
  };

  const handleRemoveMedicine = (index: number) => {
    setMedications(prev => prev.filter((_, i) => i !== index));
  };

  const handleMedicineChange = (index: number, field: string, value: string) => {
    setMedications(prev => prev.map((m, i) => i === index ? { ...m, [field]: value } : m));
  };

  const [savedRxForModal, setSavedRxForModal] = useState<Prescription | null>(null);

  const handleSaveRx = (e: React.FormEvent) => {
    e.preventDefault();
    const rxData: Prescription = {
      id: `RX-2026-${Math.floor(10000 + Math.random() * 90000)}`,
      visitId: `vst-${Date.now().toString(36)}`,
      patientId: selectedToken?.patientId || 'PHC-UP-84920',
      patientName: selectedToken?.patientName || 'Patient',
      doctorName: currentUser.name || 'Dr. Suresh Verma',
      diagnosis,
      medications,
      advice,
      followUpDays,
      date: new Date().toISOString().split('T')[0]
    };

    onSavePrescription(rxData);
    setSavedRxForModal(rxData);
    setSavedSuccessMsg(true);
    setTimeout(() => setSavedSuccessMsg(false), 5000);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-fadeIn">
      
      {/* Doctor Header Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 text-white shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-indigo-900/80 text-indigo-300 text-xs px-2.5 py-0.5 rounded-full border border-indigo-700/50 font-bold flex items-center gap-1">
              <Stethoscope className="w-3.5 h-3.5" />
              Doctor Teleconsultation Desk
            </span>
            <span className="text-xs text-slate-400">Rampur PHC Block</span>
          </div>
          <h2 className="text-2xl font-black tracking-tight">{currentUser.name}</h2>
          <p className="text-xs text-slate-300">
            {currentUser.doctorSpecialty || 'Medical Officer (In-Charge)'} • Active Queue: <span className="font-bold text-amber-300">{waitingTokens.length} Waiting</span>
            {pendingRequests.length > 0 && (
              <span className="ml-2 font-bold text-rose-400 inline-flex items-center gap-1 bg-rose-950/80 px-2 py-0.5 rounded-full border border-rose-800">
                <Radio className="w-3 h-3 animate-pulse text-rose-400" />
                {pendingRequests.length} Live Call Requests
              </span>
            )}
          </p>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center gap-1 bg-slate-800 p-1.5 rounded-2xl border border-slate-700 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('queue')}
            className={`px-3 py-2 rounded-xl font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'queue' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-300 hover:text-white'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>1. Priority Queue ({waitingTokens.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('consult')}
            className={`px-3 py-2 rounded-xl font-bold flex items-center gap-1.5 transition-all cursor-pointer relative ${
              activeTab === 'consult' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-300 hover:text-white'
            }`}
          >
            <Video className="w-4 h-4" />
            <span>2. Video Consultancy</span>
            {pendingRequests.length > 0 && (
              <span className="ml-1 bg-rose-500 text-white text-[10px] font-black px-1.5 py-0.2 rounded-full animate-bounce">
                {pendingRequests.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('prescription')}
            className={`px-3 py-2 rounded-xl font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'prescription' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-300 hover:text-white'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>3. Online Rx Pad</span>
          </button>
        </div>
      </div>

      {/* Floating Real-Time New Incoming Call Alert Banner */}
      {incomingAlert && (
        <div className="bg-gradient-to-r from-teal-950 via-slate-900 to-indigo-950 border-2 border-teal-500 text-white p-4 rounded-3xl shadow-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-bounce ring-4 ring-teal-500/20">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-teal-500/20 border border-teal-400/40 flex items-center justify-center text-2xl shrink-0">
              <Radio className="w-6 h-6 text-teal-300 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] bg-teal-500/30 text-teal-300 font-bold px-2 py-0.5 rounded-full border border-teal-400/40">
                  New Live Video Request
                </span>
                <span className="text-xs font-mono text-slate-300">Token: {incomingAlert.tokenId}</span>
              </div>
              <h4 className="text-base font-black text-white mt-0.5">{incomingAlert.patientName}</h4>
              <p className="text-xs text-slate-300 max-w-xl line-clamp-1">{incomingAlert.symptomsSummary}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={() => handleRejectRequest(incomingAlert.id)}
              className="bg-slate-800 hover:bg-slate-700 text-rose-300 border border-slate-700 px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer transition-all"
            >
              Decline
            </button>
            <button
              type="button"
              onClick={() => handleAcceptRequest(incomingAlert)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 shadow-lg shadow-emerald-600/40 cursor-pointer transition-all"
            >
              <Video className="w-4 h-4" />
              <span>Accept & Join Call</span>
            </button>
          </div>
        </div>
      )}

      {/* Emergency Alert Banner */}
      {emergencyCount > 0 && (
        <div className="bg-rose-600 text-white p-3.5 rounded-2xl flex items-center justify-between shadow-lg animate-pulse">
          <div className="flex items-center gap-2 font-bold text-xs sm:text-sm">
            <ShieldAlert className="w-5 h-5 shrink-0" />
            <span>CRITICAL: {emergencyCount} Emergency Token in queue! Immediate medical attention required.</span>
          </div>
          <button
            type="button"
            onClick={() => {
              const emg = queueTokens.find(q => q.urgency === 'Emergency' && q.status !== 'Completed');
              if (emg) handleStartConsultWithToken(emg);
            }}
            className="bg-white text-rose-700 px-3 py-1 rounded-xl text-xs font-black hover:bg-rose-50 cursor-pointer shadow-sm"
          >
            Admit Emergency Patient Now
          </button>
        </div>
      )}

      {/* TAB 1: LIVE PRIORITY QUEUE INTAKE */}
      {activeTab === 'queue' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Users className="w-5 h-5 text-indigo-600" />
                Live Patient Intake Queue
              </h3>
              <p className="text-xs text-slate-500">
                Sorted by clinical urgency rules (Emergency &gt; Moderate &gt; Minor).
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onCallNext}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold px-4 py-2.5 rounded-2xl text-xs flex items-center gap-1.5 shadow-md shadow-indigo-600/30 cursor-pointer transition-all"
              >
                <span>Call Next Patient</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Left 2 Cols: Queue Cards */}
            <div className="md:col-span-2 space-y-3">
              {waitingTokens.length === 0 ? (
                <div className="bg-white rounded-3xl border border-slate-200 p-8 text-center text-slate-500">
                  <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-2 opacity-60" />
                  <p className="font-bold">No waiting patients in queue.</p>
                  <p className="text-xs text-slate-400 mt-1">All registered patients have been consulted.</p>
                </div>
              ) : (
                waitingTokens.map(token => {
                  const isEmergency = token.urgency === 'Emergency';
                  const isModerate = token.urgency === 'Moderate';
                  const hasVideoReq = pendingRequests.find(r => r.tokenId === token.tokenId || r.patientName.toLowerCase() === token.patientName.toLowerCase());

                  return (
                    <div
                      key={token.tokenId}
                      className={`bg-white rounded-2xl p-4 border transition-all shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                        isEmergency 
                          ? 'border-rose-300 bg-rose-50/40 hover:border-rose-500 ring-2 ring-rose-400/30' 
                          : isModerate 
                            ? 'border-amber-200 hover:border-amber-400' 
                            : 'border-slate-200 hover:border-teal-300'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`px-3 py-2 rounded-xl text-center shrink-0 font-mono font-black text-xs ${
                          isEmergency ? 'bg-rose-600 text-white' : isModerate ? 'bg-amber-500 text-white' : 'bg-teal-600 text-white'
                        }`}>
                          {token.tokenId}
                        </div>

                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-slate-900 text-sm">{token.patientName}</h4>
                            <span className="text-xs text-slate-400 font-medium">({token.age}y / {token.gender})</span>
                            {hasVideoReq && (
                              <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-300">
                                <Radio className="w-2.5 h-2.5 animate-pulse text-emerald-600" />
                                Video Request Live
                              </span>
                            )}
                          </div>
                          
                          <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">
                            {token.symptomsSummary}
                          </p>

                          <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-500">
                            <span>Village: <strong className="text-slate-700">{token.village}</strong></span>
                            <span>•</span>
                            <span>Wait: <strong className="text-slate-700">~{token.estimatedWaitMinutes} mins</strong></span>
                            {token.vitals?.spO2 && (
                              <>
                                <span>•</span>
                                <span>SpO2: <strong className={token.vitals.spO2 < 95 ? 'text-rose-600' : 'text-slate-700'}>{token.vitals.spO2}%</strong></span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {hasVideoReq ? (
                          <button
                            type="button"
                            onClick={() => handleAcceptRequest(hasVideoReq)}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-md shadow-emerald-600/30 cursor-pointer"
                          >
                            <Video className="w-3.5 h-3.5" />
                            <span>Accept Call</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleStartConsultWithToken(token)}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-xs cursor-pointer"
                          >
                            <Video className="w-3.5 h-3.5" />
                            <span>Start Consult</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Right Column: AI Triage Assistant & Queue Summary */}
            <div className="space-y-4">
              
              {/* Teleconsult incoming requests widget in sidebar */}
              <div className="bg-slate-900 text-white rounded-3xl p-5 border border-slate-800 shadow-xl space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                  <div className="flex items-center gap-2 text-teal-300 font-bold text-xs">
                    <Radio className="w-4 h-4 text-teal-400 animate-pulse" />
                    <span>Incoming Call Requests</span>
                  </div>
                  <span className="bg-teal-950 text-teal-300 font-mono text-[10px] px-2 py-0.5 rounded-full border border-teal-800 font-bold">
                    {pendingRequests.length} Pending
                  </span>
                </div>

                {pendingRequests.length === 0 ? (
                  <div className="py-4 text-center text-slate-400 text-xs">
                    No active teleconsult call requests.
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                    {pendingRequests.map(req => (
                      <div key={req.id} className="bg-slate-800/90 rounded-2xl p-3 border border-slate-700 text-xs space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-white truncate max-w-[140px]">{req.patientName}</span>
                          <span className="font-mono text-teal-300 text-[10px] bg-slate-900 px-1.5 py-0.5 rounded">
                            {req.tokenId}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-300 line-clamp-1">{req.symptomsSummary}</p>
                        <div className="flex items-center justify-end gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => handleRejectRequest(req.id)}
                            className="bg-slate-700 hover:bg-slate-600 text-rose-300 px-2.5 py-1 rounded-lg text-[10px] font-bold cursor-pointer"
                          >
                            Decline
                          </button>
                          <button
                            type="button"
                            onClick={() => handleAcceptRequest(req)}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <Video className="w-3 h-3" />
                            <span>Accept</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Quick Summary Stats */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-2 text-xs">
                <div className="font-bold text-slate-900">Today's Session Stats</div>
                <div className="flex justify-between text-slate-600">
                  <span>Completed Consults:</span>
                  <span className="font-bold text-slate-900">{completedTokens.length}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Average Wait Time:</span>
                  <span className="font-bold text-teal-700">8.4 mins</span>
                </div>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* TAB 2: LIVE WEBRTC VIDEO CONSULTATION ROOM & REQUESTS MANAGEMENT */}
      {activeTab === 'consult' && (
        <div className="space-y-6">
          
          {/* Incoming Video Requests Queue List for Doctor */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 text-white shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Radio className="w-5 h-5 text-teal-400 animate-pulse" />
                <div>
                  <h3 className="text-base font-bold text-white">Live Patient Video Call Requests</h3>
                  <p className="text-xs text-slate-400">Patients registered for teleconsultation waiting for your acceptance</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="bg-teal-950 text-teal-300 text-xs px-3 py-1 rounded-full border border-teal-800 font-bold">
                  {pendingRequests.length} Requests Live
                </span>
              </div>
            </div>

            {pendingRequests.length === 0 ? (
              <div className="py-4 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-400" />
                <span>No pending call requests. Start a direct consultation from the queue below or wait for patient requests.</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {pendingRequests.map(req => {
                  const isEmg = req.urgency === 'Emergency';
                  return (
                    <div
                      key={req.id}
                      className={`p-4 rounded-2xl border transition-all flex flex-col justify-between gap-3 ${
                        isEmg 
                          ? 'bg-rose-950/40 border-rose-600/80 ring-1 ring-rose-500' 
                          : 'bg-slate-800/80 border-slate-700 hover:border-teal-500/50'
                      }`}
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-xs bg-slate-900 px-2 py-0.5 rounded text-teal-300">
                              {req.tokenId}
                            </span>
                            <h4 className="font-bold text-white text-sm">{req.patientName}</h4>
                          </div>

                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                            isEmg ? 'bg-rose-600 text-white' : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          }`}>
                            {req.urgency}
                          </span>
                        </div>

                        <p className="text-xs text-slate-300 line-clamp-2">{req.symptomsSummary}</p>

                        <div className="flex flex-wrap gap-2 text-[11px] text-slate-400 pt-1">
                          <span>Village: <strong className="text-slate-200">{req.village}</strong></span>
                          <span>•</span>
                          <span>SpO2: <strong className="text-emerald-400">{req.vitals?.spO2 || 96}%</strong></span>
                          <span>•</span>
                          <span>Temp: <strong className="text-amber-300">{req.vitals?.temperature || 100.4}°F</strong></span>
                          <span>•</span>
                          <span>BP: <strong className="text-slate-200">{req.vitals?.bloodPressure || '120/80'}</strong></span>
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-700/60">
                        <button
                          type="button"
                          onClick={() => handleRejectRequest(req.id)}
                          className="bg-slate-800 hover:bg-slate-700 text-rose-300 hover:text-white border border-slate-700 px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition-all"
                        >
                          Decline Request
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAcceptRequest(req)}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 shadow-md shadow-emerald-600/40 cursor-pointer transition-all"
                        >
                          <Video className="w-3.5 h-3.5" />
                          <span>Accept & Start Call</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Active WebRTC Video Consultation Room - Only rendered when callConnected is true */}
          {callConnected && (
            <div className="space-y-4">
              <LiveWebRTCVideoRoom
                currentUser={currentUser}
                token={selectedToken}
                session={activeSession || teleconsultService.getCurrentSession()}
                onEndCall={() => {
                  setCallConnected(false);
                  setActiveTab('prescription');
                }}
                onProceedToPrescription={(tok) => {
                  setSelectedToken(tok);
                  setActiveTab('prescription');
                }}
              />

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setActiveTab('prescription')}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-6 py-3 rounded-2xl text-xs flex items-center gap-2 cursor-pointer shadow-lg shadow-indigo-600/30"
                >
                  <FileText className="w-4 h-4" />
                  <span>Proceed to Digital Prescription Form</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

        </div>
      )}

      {/* TAB 3: ONLINE PRESCRIPTION FORM (RX PAD) */}
      {activeTab === 'prescription' && (
        <form onSubmit={handleSaveRx} className="space-y-6">
          
          <div className="bg-white rounded-3xl border border-slate-200 shadow-xl p-6 sm:p-8 space-y-6">
            
            {/* Rx Header */}
            <div className="border-b border-slate-200 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-[11px] font-bold text-indigo-600 uppercase tracking-wider">Government of India • Ministry of Health & Family Welfare</span>
                <h3 className="text-xl font-black text-slate-900">Rampur Primary Health Centre (PHC) E-Prescription</h3>
                <p className="text-xs text-slate-500">Telemedicine Consultation Record • ABDM / Ayushman Bharat Compliant</p>
              </div>

              <div className="text-right text-xs bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                <div className="font-bold text-slate-900">{currentUser.name}</div>
                <div className="text-slate-500 text-[11px]">Reg: MCI/UP/84920</div>
                <div className="text-slate-500 text-[11px]">Date: {new Date().toLocaleDateString('en-IN')}</div>
              </div>
            </div>

            {/* Patient Details Row */}
            <div className="bg-indigo-50/60 rounded-2xl p-4 border border-indigo-100 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-bold">Patient Name</span>
                <span className="font-bold text-slate-900">{selectedToken?.patientName}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-bold">Age / Gender</span>
                <span className="font-bold text-slate-900">{selectedToken?.age} yrs / {selectedToken?.gender}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-bold">Village</span>
                <span className="font-bold text-slate-900">{selectedToken?.village}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-bold">Token ID</span>
                <span className="font-mono font-bold text-indigo-700">{selectedToken?.tokenId}</span>
              </div>
            </div>

            {savedSuccessMsg && (
              <div className="bg-emerald-50 border border-emerald-300 text-emerald-800 p-4 rounded-2xl text-xs font-bold flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <span>Prescription saved successfully! Patient EHR updated and digital copy sent via SMS.</span>
              </div>
            )}

            {/* Clinical Diagnosis */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-900 uppercase tracking-wider">Clinical Diagnosis *</label>
              <input
                type="text"
                required
                value={diagnosis}
                onChange={e => setDiagnosis(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 font-semibold focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Medications Table */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-slate-900 uppercase tracking-wider">Rx - Prescribed Medications</label>
                <button
                  type="button"
                  onClick={handleAddMedicine}
                  className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 px-3 py-1 rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Medicine</span>
                </button>
              </div>

              <div className="space-y-2">
                {medications.map((med, idx) => (
                  <div key={idx} className="bg-slate-50 p-3 rounded-2xl border border-slate-200 grid grid-cols-1 sm:grid-cols-12 gap-2 items-center text-xs">
                    <div className="sm:col-span-4">
                      <input
                        type="text"
                        placeholder="Medicine Name (e.g. Paracetamol 500mg)"
                        value={med.name}
                        onChange={e => handleMedicineChange(idx, 'name', e.target.value)}
                        className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-900"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <input
                        type="text"
                        placeholder="Dosage (1 tab)"
                        value={med.dosage}
                        onChange={e => handleMedicineChange(idx, 'dosage', e.target.value)}
                        className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
                      />
                    </div>
                    <div className="sm:col-span-3">
                      <input
                        type="text"
                        placeholder="Frequency (Thrice daily)"
                        value={med.frequency}
                        onChange={e => handleMedicineChange(idx, 'frequency', e.target.value)}
                        className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <input
                        type="text"
                        placeholder="Duration (3 days)"
                        value={med.duration}
                        onChange={e => handleMedicineChange(idx, 'duration', e.target.value)}
                        className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
                      />
                    </div>
                    <div className="sm:col-span-1 flex justify-center">
                      <button
                        type="button"
                        onClick={() => handleRemoveMedicine(idx)}
                        className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg cursor-pointer"
                        title="Remove Medicine"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Advice & Instructions */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-900 uppercase tracking-wider">Lifestyle / Dietary Advice & Instructions</label>
              <textarea
                rows={2}
                value={advice}
                onChange={e => setAdvice(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Follow-up Days & Submit */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-slate-200">
              <div className="flex items-center gap-2 text-xs">
                <span className="font-bold text-slate-700">Follow-up in:</span>
                <select
                  value={followUpDays}
                  onChange={e => setFollowUpDays(Number(e.target.value))}
                  className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-900 cursor-pointer"
                >
                  <option value={3}>3 Days (3 दिन बाद)</option>
                  <option value={5}>5 Days (5 दिन बाद)</option>
                  <option value={7}>7 Days (1 सप्ताह बाद)</option>
                  <option value={14}>14 Days (2 सप्ताह बाद)</option>
                </select>
              </div>

              <div className="flex items-center gap-3">
                {savedRxForModal && (
                  <button
                    type="button"
                    onClick={() => setSavedRxForModal(savedRxForModal)}
                    className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold px-4 py-2.5 rounded-2xl text-xs flex items-center gap-1.5 cursor-pointer shadow-2xs"
                  >
                    <Printer className="w-4 h-4 text-indigo-600" />
                    <span>View / Print Signed PDF</span>
                  </button>
                )}

                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-black px-6 py-2.5 rounded-2xl text-xs flex items-center gap-2 cursor-pointer shadow-lg shadow-indigo-600/30 active:scale-95 transition-all"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Sign & Issue E-Prescription</span>
                </button>
              </div>
            </div>

          </div>

        </form>
      )}

      {/* Official Prescription PDF Modal */}
      {savedRxForModal && (
        <PrescriptionPDFModal
          isOpen={!!savedRxForModal}
          prescription={savedRxForModal}
          onClose={() => setSavedRxForModal(null)}
        />
      )}

    </div>
  );
};

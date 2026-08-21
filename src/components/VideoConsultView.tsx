import React, { useState } from 'react';
import { QueueToken, Patient, Prescription, AppLanguage } from '../types';
import { 
  Video, 
  VideoOff, 
  Mic, 
  MicOff, 
  PhoneOff, 
  Sparkles, 
  FileText, 
  Plus, 
  Trash2, 
  CheckCircle, 
  AlertTriangle, 
  Activity, 
  Heart, 
  Thermometer, 
  Printer, 
  PhoneCall, 
  User, 
  ShieldAlert,
  Download,
  Eye,
  CheckCircle2
} from 'lucide-react';
import { PrescriptionPDFModal } from './PrescriptionPDFModal';

interface VideoConsultViewProps {
  activeToken: QueueToken | null;
  patient: Patient | null;
  onCompleteConsult: (prescription: Partial<Prescription>) => void;
  language: AppLanguage;
}

export const VideoConsultView: React.FC<VideoConsultViewProps> = ({
  activeToken,
  patient,
  onCompleteConsult,
  language
}) => {
  // Video Controls
  const [isMicOn, setIsMicOn] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isCallConnected, setIsCallConnected] = useState(true);

  // Prescription Form State
  const [diagnosis, setDiagnosis] = useState('Acute Viral Febrile Illness with Mild Dehydration');
  const [medications, setMedications] = useState([
    { name: 'Paracetamol', dosage: '500mg', frequency: 'Thrice daily after food', duration: '3 days', instructions: 'For fever > 100°F' },
    { name: 'ORS Powder', dosage: '1 Sachet', frequency: 'In 1 Litre boiled water daily', duration: '3 days', instructions: 'Sip frequently' }
  ]);
  const [advice, setAdvice] = useState('Complete bed rest, maintain fluid intake, return to PHC if fever persists > 3 days.');
  const [followUpDays, setFollowUpDays] = useState(7);

  // Prescription Output / Print Preview State
  const [savedPrescription, setSavedPrescription] = useState<Prescription | null>(null);
  const [showAmbulanceAlert, setShowAmbulanceAlert] = useState(false);
  const [showPdfModal, setShowPdfModal] = useState(false);

  const handleAddMedication = () => {
    setMedications([
      ...medications,
      { name: '', dosage: '500mg', frequency: 'Twice daily', duration: '5 days', instructions: 'After meals' }
    ]);
  };

  const handleRemoveMedication = (index: number) => {
    setMedications(medications.filter((_, i) => i !== index));
  };

  const handleUpdateMedication = (index: number, field: string, value: string) => {
    const updated = [...medications];
    (updated[index] as any)[field] = value;
    setMedications(updated);
  };

  const handleSubmitPrescription = (e: React.FormEvent) => {
    e.preventDefault();
    const rxId = `RX-2026-${Math.floor(10000 + Math.random() * 90000)}`;
    const rxData: Prescription = {
      id: rxId,
      visitId: `vst-${Date.now().toString(36)}`,
      patientId: patient?.id || activeToken?.patientId || 'PHC-UP-84920',
      patientName: patient?.name || activeToken?.patientName || 'Sunita Devi',
      doctorName: 'Dr. Suresh Verma (Senior MO)',
      diagnosis,
      medications: medications.filter(m => m.name.trim().length > 0),
      advice,
      followUpDays,
      date: new Date().toISOString().split('T')[0]
    };

    onCompleteConsult(rxData);
    setSavedPrescription(rxData);
    setShowPdfModal(true);
  };

  const currentPatientName = patient?.name || activeToken?.patientName || 'Sunita Devi';
  const currentTokenId = activeToken?.tokenId || 'MOD-012';

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-white shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-teal-900/60 text-teal-300 text-xs px-2.5 py-0.5 rounded-full border border-teal-700/50 font-semibold">
              Teleconsultation Booth
            </span>
            <span className="text-xs text-slate-400">WebRTC Encrypted Room #2</span>
          </div>
          <h2 className="text-2xl font-bold tracking-tight">Teleconsultation & Doctor Portal</h2>
          <p className="text-sm text-slate-300 mt-1 max-w-2xl">
            Live video consultation connected with {currentPatientName} (Token: {currentTokenId}). Integrated Gemini AI Copilot & Prescription Writer.
          </p>
        </div>

        <button
          onClick={() => setShowAmbulanceAlert(true)}
          className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-lg shadow-red-900/50 flex items-center gap-2 cursor-pointer transition-all"
        >
          <PhoneCall className="w-4 h-4" />
          <span>Emergency Ambulance 108 Dispatch</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: WebRTC Video Call Screen & Audio Controls */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl relative">
            
            {/* Main Patient Video Frame */}
            <div className="aspect-video bg-slate-950 flex items-center justify-center relative">
              {isVideoOn && isCallConnected ? (
                <div className="w-full h-full bg-slate-900 relative flex items-center justify-center">
                  {/* Simulated Patient Video Stream Canvas */}
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-900/60 to-transparent z-10" />
                  
                  {/* Avatar Graphic for Patient */}
                  <div className="text-center z-20 space-y-3">
                    <div className="w-28 h-28 bg-teal-900/80 text-teal-300 rounded-full flex items-center justify-center mx-auto border-4 border-teal-500 shadow-2xl">
                      <User className="w-14 h-14" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white">{currentPatientName}</h3>
                      <p className="text-xs text-teal-300 font-medium">Live Video Stream • Rampur PHC Booth 2</p>
                    </div>
                  </div>

                  {/* Vitals Live Overlay on Video */}
                  <div className="absolute top-4 left-4 z-20 bg-slate-900/80 backdrop-blur-md border border-slate-700 p-2.5 rounded-xl text-[11px] text-slate-200 space-y-1">
                    <div className="flex items-center gap-1.5 text-rose-400 font-bold">
                      <Heart className="w-3.5 h-3.5" /> SpO2: {activeToken?.vitals?.spO2 || 96}%
                    </div>
                    <div className="flex items-center gap-1.5 text-amber-400 font-bold">
                      <Thermometer className="w-3.5 h-3.5" /> Temp: {activeToken?.vitals?.temperature || 102.5}°F
                    </div>
                  </div>

                  {/* Doctor Thumbnail (Picture-in-Picture) */}
                  <div className="absolute bottom-4 right-4 z-20 w-32 h-24 bg-slate-800 border-2 border-teal-500 rounded-xl overflow-hidden shadow-xl flex items-center justify-center">
                    <span className="text-[10px] font-bold text-teal-300">Dr. Suresh Verma</span>
                  </div>
                </div>
              ) : (
                <div className="text-center p-8 text-slate-500 space-y-2">
                  <VideoOff className="w-12 h-12 mx-auto text-slate-600" />
                  <p className="text-sm font-semibold">Video Stream Muted / Re-connecting...</p>
                </div>
              )}
            </div>

            {/* Video Control Bar */}
            <div className="bg-slate-900 p-4 border-t border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsMicOn(prev => !prev)}
                  className={`p-3 rounded-xl cursor-pointer transition-all active:scale-95 flex items-center justify-center ${
                    isMicOn 
                      ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700' 
                      : 'bg-rose-600 hover:bg-rose-700 text-white ring-2 ring-rose-400/60 shadow-lg shadow-rose-600/30'
                  }`}
                  title={isMicOn ? 'Mute Microphone' : 'Unmute Microphone'}
                >
                  {isMicOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
                </button>

                <button
                  type="button"
                  onClick={() => setIsVideoOn(prev => !prev)}
                  className={`p-3 rounded-xl cursor-pointer transition-all active:scale-95 flex items-center justify-center ${
                    isVideoOn 
                      ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700' 
                      : 'bg-rose-600 hover:bg-rose-700 text-white ring-2 ring-rose-400/60 shadow-lg shadow-rose-600/30'
                  }`}
                  title={isVideoOn ? 'Turn Video Off' : 'Turn Video On'}
                >
                  {isVideoOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
                </button>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-400 font-mono">Session ID: #WEBRTC-PHC-8492</span>
                <button
                  type="button"
                  onClick={() => setIsCallConnected(prev => !prev)}
                  className="bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-md"
                >
                  <PhoneOff className="w-4 h-4" />
                  <span>{isCallConnected ? 'End Call' : 'Reconnect Call'}</span>
                </button>
              </div>
            </div>

          </div>

          {/* Gemini AI Clinical Assistant Copilot for Doctor */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 text-slate-100 shadow-xl space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2 text-teal-400 font-bold text-sm">
                <Sparkles className="w-5 h-5" />
                <span>Gemini Doctor Clinical Copilot</span>
              </div>
              <span className="text-[10px] bg-teal-950 text-teal-300 px-2 py-0.5 rounded font-mono border border-teal-800">
                AI Clinical Guidance
              </span>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              <strong>Differential Diagnosis Suggestion:</strong> Acute Viral Febrile Illness / High Fever.
              Rule out Dengue / Typhoid considering local Rampur PHC fever spike.
            </p>

            <div className="bg-slate-800/80 rounded-xl p-3 text-xs text-slate-300 space-y-1.5 border border-slate-700">
              <span className="text-amber-300 font-semibold block">Safety & Drug Interaction Checks:</span>
              <p>• Paracetamol 500mg safe for patient age 32. No liver history noted in EHR.</p>
              <p>• Recommend fluid rehydration (ORS) due to elevated temperature (102.5°F).</p>
            </div>
          </div>
        </div>

        {/* Right Column: Digital Prescription Writer */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-lg p-6 space-y-6">
            
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <FileText className="w-4 h-4 text-teal-600" />
                Digital Prescription Writer / पर्ची
              </h3>
              <span className="text-xs text-slate-500 font-mono">Token: {currentTokenId}</span>
            </div>

            {!savedPrescription ? (
              <form onSubmit={handleSubmitPrescription} className="space-y-4">
                
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Clinical Diagnosis *</label>
                  <input
                    type="text"
                    required
                    value={diagnosis}
                    onChange={e => setDiagnosis(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-teal-500 font-medium"
                  />
                </div>

                {/* Medications List */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-bold text-slate-700">Prescribed Medications</label>
                    <button
                      type="button"
                      onClick={handleAddMedication}
                      className="text-teal-700 hover:text-teal-800 text-xs font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add Medicine
                    </button>
                  </div>

                  <div className="space-y-3">
                    {medications.map((med, idx) => (
                      <div key={idx} className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs space-y-2 relative">
                        <div className="flex items-center justify-between gap-2">
                          <input
                            type="text"
                            placeholder="Medicine Name (e.g. Paracetamol)"
                            value={med.name}
                            onChange={e => handleUpdateMedication(idx, 'name', e.target.value)}
                            className="bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-900 flex-1"
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveMedication(idx)}
                            className="text-red-500 hover:text-red-700 p-1 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="text"
                            placeholder="Dosage (500mg)"
                            value={med.dosage}
                            onChange={e => handleUpdateMedication(idx, 'dosage', e.target.value)}
                            className="bg-white border border-slate-200 rounded-lg p-1.5 text-[11px]"
                          />
                          <input
                            type="text"
                            placeholder="Frequency (1-0-1)"
                            value={med.frequency}
                            onChange={e => handleUpdateMedication(idx, 'frequency', e.target.value)}
                            className="bg-white border border-slate-200 rounded-lg p-1.5 text-[11px]"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Dietary & Precaution Advice</label>
                  <textarea
                    rows={2}
                    value={advice}
                    onChange={e => setAdvice(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 focus:outline-none focus:border-teal-500"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full bg-teal-700 hover:bg-teal-800 active:scale-98 text-white font-extrabold py-3.5 px-4 rounded-2xl shadow-lg shadow-teal-700/20 transition-all flex items-center justify-center gap-2 cursor-pointer text-xs"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Issue & Sign Prescription (ई-पर्चा जारी करें)</span>
                </button>
              </form>
            ) : (
              /* Printable Prescription Result Sheet */
              <div className="bg-slate-50 border border-teal-200 rounded-2xl p-5 text-xs space-y-4 shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-teal-700 block">ABDM Compliant E-Prescription</span>
                    <h4 className="font-extrabold text-slate-900 text-sm">RAMPUR PRIMARY HEALTH CENTRE</h4>
                    <p className="text-[10px] text-slate-500">Government Teleconsultation Record</p>
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-teal-800 font-mono text-xs block">Rx #{savedPrescription.id}</span>
                    <span className="text-[10px] text-slate-500">{savedPrescription.date}</span>
                  </div>
                </div>

                <div className="space-y-1 text-slate-800 bg-white p-3 rounded-xl border border-slate-200 text-xs">
                  <p><strong>Patient:</strong> {savedPrescription.patientName} <span className="text-slate-500 font-mono text-[11px]">({patient?.id || activeToken?.patientId})</span></p>
                  <p><strong>Doctor:</strong> {savedPrescription.doctorName}</p>
                  <p><strong>Diagnosis:</strong> <span className="font-bold text-teal-800">{savedPrescription.diagnosis}</span></p>
                </div>

                <div className="space-y-1">
                  <span className="font-bold text-slate-900 block text-xs">Prescribed Medicines:</span>
                  <ul className="list-disc list-inside space-y-1 text-slate-700 bg-white p-3 rounded-xl border border-slate-200 text-xs">
                    {savedPrescription.medications.map((m, i) => (
                      <li key={i}><strong>{m.name}</strong> ({m.dosage}) — {m.frequency} [{m.instructions}]</li>
                    ))}
                  </ul>
                </div>

                {savedPrescription.advice && (
                  <p className="text-slate-600 bg-slate-100 p-2.5 rounded-xl text-xs"><strong>Doctor Advice:</strong> {savedPrescription.advice}</p>
                )}

                <div className="flex flex-col sm:flex-row gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowPdfModal(true)}
                    className="flex-1 bg-teal-700 hover:bg-teal-800 text-white py-2.5 rounded-xl font-bold flex items-center justify-center gap-1.5 cursor-pointer text-xs shadow-xs"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>View & Download Official PDF</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowPdfModal(true);
                      setTimeout(() => window.print(), 300);
                    }}
                    className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-2.5 rounded-xl font-bold flex items-center justify-center gap-1.5 cursor-pointer text-xs shadow-xs"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Print PDF</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSavedPrescription(null)}
                    className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-3 py-2.5 rounded-xl font-semibold cursor-pointer text-xs"
                  >
                    Edit
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>

      </div>

      {/* Official Government Prescription PDF Modal */}
      {savedPrescription && (
        <PrescriptionPDFModal
          isOpen={showPdfModal}
          prescription={savedPrescription}
          patient={patient}
          onClose={() => setShowPdfModal(false)}
        />
      )}

      {/* Ambulance Dispatch Overlay Modal */}
      {showAmbulanceAlert && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border-2 border-red-600 rounded-2xl max-w-md w-full p-6 text-slate-100 shadow-2xl space-y-4">
            <div className="w-12 h-12 bg-red-950 text-red-500 rounded-full flex items-center justify-center mx-auto border border-red-700">
              <ShieldAlert className="w-7 h-7" />
            </div>
            
            <h3 className="text-lg font-bold text-center text-red-400">
              Dispatched 108 Emergency Ambulance
            </h3>
            
            <p className="text-xs text-slate-300 text-center leading-relaxed">
              District Health Dispatch Room alerted. Ambulance Unit AMB-108-UP-34 assigned to Rampur PHC. ETA ~12 minutes.
            </p>

            <button
              onClick={() => setShowAmbulanceAlert(false)}
              className="w-full bg-red-600 text-white font-bold py-2.5 rounded-xl cursor-pointer text-xs"
            >
              Close Alert Window
            </button>
          </div>
        </div>
      )}

    </div>
  );
};

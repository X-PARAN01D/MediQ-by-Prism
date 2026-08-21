import React, { useState } from 'react';
import { 
  QrCode, 
  Fingerprint, 
  Phone, 
  User, 
  CheckCircle2, 
  Search, 
  X, 
  Volume2, 
  ShieldCheck, 
  Clock, 
  FileText, 
  AlertCircle,
  Pill,
  Printer
} from 'lucide-react';
import { Patient, VisitRecord } from '../types';
import { INITIAL_PATIENTS, INITIAL_VISITS } from '../data/mockData';

interface PatientLookupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPatient: (patient: Patient) => void;
}

export const PatientLookupModal: React.FC<PatientLookupModalProps> = ({
  isOpen,
  onClose,
  onSelectPatient
}) => {
  const [activeTab, setActiveTab] = useState<'qr' | 'fingerprint' | 'phone'>('qr');
  const [searchQuery, setSearchQuery] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scannedPatient, setScannedPatient] = useState<Patient | null>(null);
  const [thumbScanning, setThumbScanning] = useState(false);
  const [selectedPatientHistory, setSelectedPatientHistory] = useState<VisitRecord[] | null>(null);
  const [showCardPrint, setShowCardPrint] = useState(false);

  if (!isOpen) return null;

  // Handle Simulated QR Scan
  const handleSimulateQRScan = (patient: Patient) => {
    setScanning(true);
    setTimeout(() => {
      setScanning(false);
      setScannedPatient(patient);
      const visits = INITIAL_VISITS.filter(v => v.patientId === patient.id);
      setSelectedPatientHistory(visits);
    }, 1200);
  };

  // Handle Simulated Biometric Thumbprint
  const handleSimulateThumbprint = (patient: Patient) => {
    setThumbScanning(true);
    setTimeout(() => {
      setThumbScanning(false);
      setScannedPatient(patient);
      const visits = INITIAL_VISITS.filter(v => v.patientId === patient.id);
      setSelectedPatientHistory(visits);
    }, 1500);
  };

  const handlePhoneSearch = () => {
    const matched = INITIAL_PATIENTS.find(
      p => p.contactNumber.includes(searchQuery) || p.abhaId?.includes(searchQuery) || p.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
    if (matched) {
      setScannedPatient(matched);
      const visits = INITIAL_VISITS.filter(v => v.patientId === matched.id);
      setSelectedPatientHistory(visits);
    } else {
      alert("No patient found with this phone number. Try clicking one of the demo patients below.");
    }
  };

  const speakPatientDetails = (patient: Patient) => {
    if (!('speechSynthesis' in window)) return;
    const text = `रोगी का नाम: ${patient.nameRegional || patient.name}, उम्र: ${patient.age} वर्ष, गांव: ${patient.village}, रक्त समूह: ${patient.bloodGroup || 'B+'}, स्वास्थ्य पहचान पत्र संख्या ${patient.abhaId || 'मान्य'}`;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'hi-IN';
    utterance.rate = 0.9;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-teal-600 flex items-center justify-center text-white">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base">Rural Patient ID & Health Record Lookup</h3>
              <p className="text-xs text-teal-300">बिना स्मार्टफ़ोन एवं बिना टाइपिंग के 1-टैप पहचान</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Identification Tabs */}
        <div className="grid grid-cols-3 border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700">
          <button
            type="button"
            onClick={() => { setActiveTab('qr'); setScannedPatient(null); }}
            className={`py-3 px-2 flex items-center justify-center gap-2 border-b-2 cursor-pointer transition-all ${
              activeTab === 'qr' ? 'border-teal-600 text-teal-700 bg-white font-bold' : 'border-transparent hover:bg-slate-100'
            }`}
          >
            <QrCode className="w-4 h-4" />
            <span>QR Card Scan (क्यूआर कार्ड)</span>
          </button>
          <button
            type="button"
            onClick={() => { setActiveTab('fingerprint'); setScannedPatient(null); }}
            className={`py-3 px-2 flex items-center justify-center gap-2 border-b-2 cursor-pointer transition-all ${
              activeTab === 'fingerprint' ? 'border-teal-600 text-teal-700 bg-white font-bold' : 'border-transparent hover:bg-slate-100'
            }`}
          >
            <Fingerprint className="w-4 h-4" />
            <span>Thumbprint (अंगूठा बायोमेट्रिक)</span>
          </button>
          <button
            type="button"
            onClick={() => { setActiveTab('phone'); setScannedPatient(null); }}
            className={`py-3 px-2 flex items-center justify-center gap-2 border-b-2 cursor-pointer transition-all ${
              activeTab === 'phone' ? 'border-teal-600 text-teal-700 bg-white font-bold' : 'border-transparent hover:bg-slate-100'
            }`}
          >
            <Phone className="w-4 h-4" />
            <span>Phone / ABHA No.</span>
          </button>
        </div>

        {/* Tab Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          
          {/* TAB 1: QR CARD SCANNER */}
          {activeTab === 'qr' && !scannedPatient && (
            <div className="space-y-4">
              <div className="bg-teal-50 border-2 border-dashed border-teal-300 rounded-3xl p-6 flex flex-col items-center justify-center text-center space-y-3">
                <div className="w-20 h-20 rounded-2xl bg-white shadow-md flex items-center justify-center border border-teal-200">
                  {scanning ? (
                    <QrCode className="w-12 h-12 text-teal-600 animate-pulse" />
                  ) : (
                    <QrCode className="w-12 h-12 text-slate-700" />
                  )}
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">Scan Patient's Printed QR Health Card</h4>
                  <p className="text-xs text-slate-500 max-w-sm mt-1">
                    Hold the paper health slip or ABHA PVC smart card in front of camera to instantly load full medical history.
                  </p>
                </div>
              </div>

              <div>
                <p className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Select a Demo Rural Health Card to Simulate Scan:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {INITIAL_PATIENTS.map(p => (
                    <button
                      key={p.id}
                      onClick={() => handleSimulateQRScan(p)}
                      className="p-3 bg-slate-50 hover:bg-teal-50 border border-slate-200 hover:border-teal-400 rounded-2xl flex items-center justify-between text-left transition-all cursor-pointer group"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-10 h-10 rounded-xl bg-teal-100 text-teal-800 font-bold flex items-center justify-center text-xs">
                          {p.bloodGroup || 'B+'}
                        </div>
                        <div>
                          <div className="font-bold text-xs text-slate-900 group-hover:text-teal-800">
                            {p.nameRegional || p.name}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {p.age} Y • {p.village}
                          </div>
                        </div>
                      </div>
                      <span className="text-[11px] font-semibold text-teal-600 bg-white px-2 py-1 rounded-lg border border-teal-200">
                        Scan Card
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: BIOMETRIC THUMBPRINT */}
          {activeTab === 'fingerprint' && !scannedPatient && (
            <div className="space-y-4">
              <div className="bg-indigo-50 border-2 border-dashed border-indigo-300 rounded-3xl p-6 flex flex-col items-center justify-center text-center space-y-3">
                <div className={`w-24 h-24 rounded-full flex items-center justify-center shadow-lg transition-all ${
                  thumbScanning ? 'bg-indigo-600 text-white animate-pulse ring-8 ring-indigo-300' : 'bg-white text-indigo-700 border border-indigo-200'
                }`}>
                  <Fingerprint className="w-14 h-14" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">Biometric Fingerprint Authentication</h4>
                  <p className="text-xs text-slate-500 max-w-sm mt-1">
                    Place thumb on the USB Biometric scanner for zero-literacy 1-touch ABHA authentication.
                  </p>
                </div>
              </div>

              <div>
                <p className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Simulate Biometric Thumbprint Touch:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {INITIAL_PATIENTS.map(p => (
                    <button
                      key={p.id}
                      onClick={() => handleSimulateThumbprint(p)}
                      className="p-3 bg-slate-50 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-400 rounded-2xl flex items-center justify-between text-left transition-all cursor-pointer group"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-800 flex items-center justify-center">
                          <Fingerprint className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="font-bold text-xs text-slate-900 group-hover:text-indigo-800">
                            {p.nameRegional || p.name}
                          </div>
                          <div className="text-[11px] text-slate-500">ID: {p.thumbprintId || 'BIO-01'}</div>
                        </div>
                      </div>
                      <span className="text-[11px] font-semibold text-indigo-600 bg-white px-2 py-1 rounded-lg border border-indigo-200">
                        Touch Thumb
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: PHONE / ABHA NUMBER SEARCH */}
          {activeTab === 'phone' && !scannedPatient && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Phone className="w-4 h-4 absolute left-3 top-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Enter 10-digit Phone or ABHA Number (e.g. 98765 12345)"
                    className="w-full pl-9 pr-4 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <button
                  onClick={handlePhoneSearch}
                  className="bg-teal-600 hover:bg-teal-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <Search className="w-4 h-4" />
                  <span>खोजें (Search)</span>
                </button>
              </div>

              <div className="space-y-2">
                <p className="text-xs text-slate-500">Suggested registered village patients:</p>
                {INITIAL_PATIENTS.map(p => (
                  <div 
                    key={p.id}
                    onClick={() => {
                      setScannedPatient(p);
                      setSelectedPatientHistory(INITIAL_VISITS.filter(v => v.patientId === p.id));
                    }}
                    className="p-3 border border-slate-200 rounded-xl flex items-center justify-between hover:bg-teal-50 hover:border-teal-300 cursor-pointer transition-all"
                  >
                    <div>
                      <div className="font-bold text-xs text-slate-900">{p.nameRegional || p.name} ({p.name})</div>
                      <div className="text-[11px] text-slate-500">{p.contactNumber} • {p.village}</div>
                    </div>
                    <span className="text-xs text-teal-700 font-semibold">Select</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* DISPLAY SCANNED PATIENT SUMMARY & VISUAL SMART CARD */}
          {scannedPatient && (
            <div className="space-y-5 animate-fadeIn">
              
              {/* Top Smart Health Card Visual */}
              <div className="bg-gradient-to-br from-teal-800 to-slate-900 text-white rounded-3xl p-5 shadow-xl border border-teal-700/50 space-y-4 relative overflow-hidden">
                <div className="absolute -right-8 -bottom-8 opacity-10 pointer-events-none">
                  <ShieldCheck className="w-48 h-48" />
                </div>

                <div className="flex items-center justify-between border-b border-teal-700/60 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="bg-white text-teal-900 font-extrabold text-[10px] px-2 py-0.5 rounded-md">ABDM COMPLIANT</span>
                    <span className="text-xs text-teal-200 font-mono">ABHA: {scannedPatient.abhaId || '84-9201-4402-9182'}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => speakPatientDetails(scannedPatient)}
                    className="bg-teal-700 hover:bg-teal-600 text-white text-xs px-2.5 py-1 rounded-xl flex items-center gap-1 cursor-pointer transition-all"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>सुनें (Listen)</span>
                  </button>
                </div>

                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-teal-100 text-teal-900 flex items-center justify-center font-bold text-xl shadow-md border-2 border-white/80 overflow-hidden">
                    {scannedPatient.photoUrl ? (
                      <img src={scannedPatient.photoUrl} alt={scannedPatient.name} className="w-full h-full object-cover" />
                    ) : (
                      <span>{scannedPatient.name.charAt(0)}</span>
                    )}
                  </div>
                  <div>
                    <h4 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
                      <span>{scannedPatient.nameRegional || scannedPatient.name}</span>
                      <span className="text-xs font-normal text-teal-300">({scannedPatient.name})</span>
                    </h4>
                    <p className="text-xs text-teal-200 mt-0.5">
                      {scannedPatient.age} Y • {scannedPatient.gender} • Blood Group: <strong className="text-amber-300">{scannedPatient.bloodGroup || 'B+'}</strong>
                    </p>
                    <p className="text-xs text-teal-300/80">
                      Village: {scannedPatient.village} • Phone: {scannedPatient.contactNumber}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 text-[11px] bg-slate-950/40 p-3 rounded-2xl border border-teal-700/40">
                  <div>
                    <span className="text-slate-400 block">Existing Conditions / पुरानी बीमारी:</span>
                    <span className="font-semibold text-slate-100">
                      {scannedPatient.medicalHistory.join(', ') || 'None recorded'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Allergies / एलर्जी:</span>
                    <span className="font-semibold text-rose-300">
                      {scannedPatient.allergies && scannedPatient.allergies.length > 0 ? scannedPatient.allergies.join(', ') : 'No known drug allergies'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Past Visits Timeline */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h5 className="font-bold text-xs text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-teal-600" />
                    <span>Past PHC Visits & Prescriptions (पिछला इलाज)</span>
                  </h5>
                  <span className="text-[11px] text-slate-500 font-medium">1 Previous Visit Recorded</span>
                </div>

                {selectedPatientHistory && selectedPatientHistory.length > 0 ? (
                  selectedPatientHistory.map(vst => (
                    <div key={vst.id} className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3 text-xs">
                      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                        <div className="font-bold text-slate-900">{vst.diagnosis || 'General Checkup'}</div>
                        <span className="text-[11px] font-mono text-slate-500">{vst.date}</span>
                      </div>
                      
                      {vst.prescription && (
                        <div className="space-y-2 bg-white p-3 rounded-xl border border-slate-100">
                          <span className="text-[11px] font-bold text-teal-800 flex items-center gap-1">
                            <Pill className="w-3.5 h-3.5" />
                            <span>Prescribed Medications (दवाइयां):</span>
                          </span>
                          <div className="space-y-1.5">
                            {vst.prescription.medications.map((m, idx) => (
                              <div key={idx} className="flex items-center justify-between text-[11px] bg-slate-50 p-2 rounded-lg">
                                <span className="font-semibold text-slate-800">💊 {m.name} ({m.dosage})</span>
                                <span className="text-slate-600">{m.frequency} • {m.duration}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-500 bg-slate-50 p-3 rounded-xl text-center">
                    No prior chronic visits recorded. Starting fresh intake.
                  </p>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setScannedPatient(null)}
                  className="flex-1 py-3 px-4 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-50 cursor-pointer"
                >
                  Scan Another (अन्य रोगी)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onSelectPatient(scannedPatient);
                    onClose();
                  }}
                  className="flex-2 py-3 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-teal-600/30 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>इस रोगी के लिए लक्षण जांच शुरू करें (Proceed with Patient)</span>
                </button>
              </div>

            </div>
          )}

        </div>

      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { Patient, Vitals, AppLanguage, OfflineSyncItem } from '../types';
import { INITIAL_PATIENTS, INITIAL_OFFLINE_SYNC_ITEMS } from '../data/mockData';
import { 
  UserCheck, 
  WifiOff, 
  RefreshCw, 
  Plus, 
  Activity, 
  Heart, 
  Thermometer, 
  CheckCircle2, 
  Database,
  Smartphone,
  Search,
  Users,
  QrCode,
  Fingerprint,
  Mic,
  Volume2,
  Printer,
  ShieldCheck,
  Check
} from 'lucide-react';

interface AshaAssistViewProps {
  language: AppLanguage;
  isOnline: boolean;
}

export const AshaAssistView: React.FC<AshaAssistViewProps> = ({ language, isOnline }) => {
  const [patientsList, setPatientsList] = useState<Patient[]>(INITIAL_PATIENTS);
  const [searchQuery, setSearchQuery] = useState('');
  const [syncItems, setSyncItems] = useState<OfflineSyncItem[]>(INITIAL_OFFLINE_SYNC_ITEMS);
  
  // New Village Patient Registration Form
  const [newName, setNewName] = useState('');
  const [newNameRegional, setNewNameRegional] = useState('');
  const [newAge, setNewAge] = useState<number>(34);
  const [newGender, setNewGender] = useState<'Male' | 'Female'>('Female');
  const [newVillage, setNewVillage] = useState('Kheri Village Sub-Center');
  const [newContact, setNewContact] = useState('+91 98123 00412');
  const [newBloodGroup, setNewBloodGroup] = useState('O+');
  const [symptomsText, setSymptomsText] = useState('');

  // Vitals Capture
  const [spO2, setSpO2] = useState('98');
  const [temp, setTemp] = useState('98.6');
  const [bp, setBp] = useState('120/80');
  const [pulse, setPulse] = useState('74');

  // Interactive Generated Smart Card modal state
  const [createdCardPatient, setCreatedCardPatient] = useState<Patient | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncSuccessMsg, setSyncSuccessMsg] = useState('');

  // Bluetooth Sensor simulation
  const handleBluetoothSimulateVitals = () => {
    const randomSpO2 = String(94 + Math.floor(Math.random() * 6));
    const randomTemp = String((98.4 + Math.random() * 3.2).toFixed(1));
    const randomSys = 110 + Math.floor(Math.random() * 30);
    const randomDia = 70 + Math.floor(Math.random() * 15);
    const randomPulse = String(68 + Math.floor(Math.random() * 25));

    setSpO2(randomSpO2);
    setTemp(randomTemp);
    setBp(`${randomSys}/${randomDia}`);
    setPulse(randomPulse);

    if ('speechSynthesis' in window) {
      const msg = new SpeechSynthesisUtterance('ब्लूटूथ से सभी शारीरिक माप दर्ज कर लिए गए हैं।');
      msg.lang = 'hi-IN';
      window.speechSynthesis.speak(msg);
    }
  };

  const handleAddPatientByAsha = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName) return;

    const idNumber = Math.floor(1000 + Math.random() * 9000);
    const newPatient: Patient = {
      id: `PHC-UP-${idNumber}`,
      abhaId: `84-${idNumber}-${Math.floor(1000 + Math.random() * 9000)}-${Math.floor(1000 + Math.random() * 9000)}`,
      name: newName,
      nameRegional: newNameRegional || newName,
      age: Number(newAge),
      gender: newGender,
      village: newVillage,
      contactNumber: newContact,
      bloodGroup: newBloodGroup,
      thumbprintId: `BIO-UP-${idNumber}-R1`,
      medicalHistory: symptomsText ? [symptomsText] : ['Routine Intake'],
      registeredDate: new Date().toISOString().split('T')[0]
    };

    setPatientsList([newPatient, ...patientsList]);
    
    // Add to offline sync list
    const syncItem: OfflineSyncItem = {
      id: `sync-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      type: 'registration',
      patientName: newPatient.name,
      village: newPatient.village,
      data: newPatient,
      status: 'pending'
    };
    setSyncItems([syncItem, ...syncItems]);

    // Show Printable Smart Card Preview
    setCreatedCardPatient(newPatient);
    setNewName('');
    setNewNameRegional('');
    setSymptomsText('');
  };

  const handleSyncOfflineData = () => {
    setIsSyncing(true);
    setTimeout(() => {
      setIsSyncing(false);
      setSyncItems(syncItems.map(item => ({ ...item, status: 'synced' })));
      setSyncSuccessMsg('All offline village records synchronized successfully with PHC Central Server!');
      setTimeout(() => setSyncSuccessMsg(''), 5000);
    }, 1500);
  };

  const filtered = patientsList.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.nameRegional && p.nameRegional.includes(searchQuery)) ||
    p.village.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const pendingCount = syncItems.filter(i => i.status === 'pending').length;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-teal-950 to-slate-900 border border-teal-800/40 rounded-3xl p-5 sm:p-6 text-white shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="bg-teal-500/20 text-teal-300 text-xs px-3 py-1 rounded-full border border-teal-400/40 font-bold flex items-center gap-1.5">
              <UserCheck className="w-3.5 h-3.5" />
              ASHA Worker / Clinic Helpdesk Mode
            </span>
            <span className="text-xs text-slate-300 font-medium">Village Sub-Center Field Unit</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black tracking-tight text-slate-100">
            Community Health Worker Doorstep Portal
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-2xl">
            Empowers ASHA workers to register low-literacy villagers at home, capture vitals via Bluetooth, issue printable physical QR Health Cards, and sync offline queues when returning to PHC.
          </p>
        </div>

        {/* Sync Controls */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="bg-slate-800/80 border border-slate-700 rounded-2xl px-3.5 py-2 text-xs flex items-center gap-2 text-slate-300">
            <Database className="w-4 h-4 text-teal-400" />
            <span>Pending Offline Sync: <strong className="text-amber-400 font-bold">{pendingCount}</strong></span>
          </div>

          <button
            type="button"
            onClick={handleSyncOfflineData}
            disabled={isSyncing || pendingCount === 0}
            className="bg-teal-600 hover:bg-teal-700 disabled:opacity-40 text-white px-4 py-2.5 rounded-2xl text-xs font-bold shadow-lg shadow-teal-600/30 flex items-center gap-2 cursor-pointer transition-all"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Syncing...' : 'Sync to PHC Cloud'}</span>
          </button>
        </div>
      </div>

      {syncSuccessMsg && (
        <div className="bg-emerald-50 border-2 border-emerald-300 rounded-2xl p-4 text-xs text-emerald-900 font-bold flex items-center gap-2 shadow-sm animate-fadeIn">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{syncSuccessMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Doorstep Intake & Vitals Form */}
        <div className="lg:col-span-5 space-y-6">
          <form onSubmit={handleAddPatientByAsha} className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <Plus className="w-4 h-4 text-teal-600" />
                Register New Village Patient
              </h3>
              <span className="text-[11px] text-teal-700 font-bold bg-teal-50 px-2 py-0.5 rounded-md border border-teal-200">
                Auto ABHA ID
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Patient Name (English) *</label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="e.g. Maniram Pal"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Name (Hindi / क्षेत्रीय भाषा)</label>
                <input
                  type="text"
                  value={newNameRegional}
                  onChange={e => setNewNameRegional(e.target.value)}
                  placeholder="जैसे: मनीराम पाल"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-teal-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Age</label>
                <input
                  type="number"
                  value={newAge}
                  onChange={e => setNewAge(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Gender</label>
                <select
                  value={newGender}
                  onChange={e => setNewGender(e.target.value as any)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-2 py-2 text-xs text-slate-900 focus:outline-none focus:border-teal-500 cursor-pointer"
                >
                  <option value="Female">Female</option>
                  <option value="Male">Male</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Blood Group</label>
                <select
                  value={newBloodGroup}
                  onChange={e => setNewBloodGroup(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-2 py-2 text-xs text-slate-900 focus:outline-none focus:border-teal-500 cursor-pointer"
                >
                  <option value="A+">A+</option>
                  <option value="B+">B+</option>
                  <option value="O+">O+</option>
                  <option value="AB+">AB+</option>
                  <option value="O-">O-</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Village / Hamlet</label>
                <input
                  type="text"
                  value={newVillage}
                  onChange={e => setNewVillage(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Mobile No.</label>
                <input
                  type="text"
                  value={newContact}
                  onChange={e => setNewContact(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-teal-500"
                />
              </div>
            </div>

            {/* Vitals Capture with 1-Tap Bluetooth button */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-slate-900">
                  Doorstep Vitals (SpO2 / BP / Temp)
                </label>
                <button
                  type="button"
                  onClick={handleBluetoothSimulateVitals}
                  className="text-teal-700 hover:text-teal-900 text-[11px] font-bold flex items-center gap-1 cursor-pointer bg-teal-50 px-2 py-1 rounded-lg border border-teal-200"
                >
                  <Activity className="w-3.5 h-3.5 text-teal-600" />
                  <span>1-Tap Bluetooth Capture</span>
                </button>
              </div>

              <div className="grid grid-cols-4 gap-2 bg-slate-50 p-3 rounded-2xl border border-slate-200">
                <div>
                  <span className="text-[10px] text-slate-500 block">SpO2 (%)</span>
                  <input
                    type="text"
                    value={spO2}
                    onChange={e => setSpO2(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-1.5 text-xs font-bold text-teal-800 text-center"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block">Temp (°F)</span>
                  <input
                    type="text"
                    value={temp}
                    onChange={e => setTemp(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-1.5 text-xs font-bold text-amber-800 text-center"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block">BP</span>
                  <input
                    type="text"
                    value={bp}
                    onChange={e => setBp(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-1.5 text-xs font-bold text-slate-800 text-center"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block">Pulse</span>
                  <input
                    type="text"
                    value={pulse}
                    onChange={e => setPulse(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-1.5 text-xs font-bold text-slate-800 text-center"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Reported Symptoms</label>
              <textarea
                rows={2}
                value={symptomsText}
                onChange={e => setSymptomsText(e.target.value)}
                placeholder="Notes taken during home visit..."
                className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 focus:outline-none focus:border-teal-500"
              />
            </div>

            <button
              type="submit"
              className="w-full bg-teal-600 hover:bg-teal-700 text-white font-extrabold py-3.5 px-4 rounded-2xl shadow-lg shadow-teal-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer text-xs"
            >
              <Plus className="w-4 h-4" />
              <span>Save Record & Generate QR Smart Card</span>
            </button>
          </form>

          {/* PRINTABLE SMART HEALTH CARD PREVIEW */}
          {createdCardPatient && (
            <div className="bg-gradient-to-br from-teal-800 to-slate-900 text-white rounded-3xl p-5 shadow-xl border border-teal-700/50 space-y-4 animate-fadeIn">
              <div className="flex items-center justify-between border-b border-teal-700/60 pb-3">
                <div className="flex items-center gap-2">
                  <span className="bg-white text-teal-900 font-extrabold text-[10px] px-2 py-0.5 rounded-md">
                    AYUSHMAN / ABHA CARD
                  </span>
                  <span className="text-xs text-teal-200 font-mono">PHC RAMANPUR</span>
                </div>
                <button
                  type="button"
                  onClick={() => alert("Physical QR Health Card printed on Bluetooth thermal printer.")}
                  className="bg-teal-700 hover:bg-teal-600 text-white text-xs px-2.5 py-1 rounded-xl flex items-center gap-1 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Slip</span>
                </button>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-16 h-16 rounded-2xl bg-white p-1 text-slate-900 flex items-center justify-center shadow-md">
                  <QrCode className="w-12 h-12 text-slate-900" />
                </div>
                <div>
                  <h4 className="font-bold text-base text-white">
                    {createdCardPatient.nameRegional || createdCardPatient.name}
                  </h4>
                  <p className="text-xs text-teal-200">
                    {createdCardPatient.age} Y • {createdCardPatient.gender} • Blood: <strong className="text-amber-300">{createdCardPatient.bloodGroup}</strong>
                  </p>
                  <p className="text-[11px] text-teal-300/80 font-mono">
                    ABHA: {createdCardPatient.abhaId}
                  </p>
                </div>
              </div>

              <div className="text-[11px] bg-black/30 p-2.5 rounded-xl text-teal-100 flex items-center justify-between">
                <span>Biometric Thumb ID: {createdCardPatient.thumbprintId}</span>
                <span className="text-emerald-400 flex items-center gap-1 font-semibold">
                  <Check className="w-3.5 h-3.5" /> Ready for Offline Scan
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Village Roster & Offline Sync Queue */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* Section 1: Offline Sync Queue Table */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <Database className="w-4 h-4 text-amber-500" />
                Field Sync Queue (Offline Buffer)
              </h3>
              <span className="text-xs text-slate-500">Auto-syncs on PHC WiFi</span>
            </div>

            <div className="space-y-2 max-h-48 overflow-y-auto">
              {syncItems.map(item => (
                <div 
                  key={item.id}
                  className="p-3 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between text-xs"
                >
                  <div>
                    <div className="font-bold text-slate-900">{item.patientName} ({item.village})</div>
                    <div className="text-[11px] text-slate-500">{item.type.toUpperCase()} • Recorded: {item.timestamp}</div>
                  </div>
                  <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${
                    item.status === 'synced' 
                      ? 'bg-emerald-100 text-emerald-800' 
                      : 'bg-amber-100 text-amber-800 animate-pulse'
                  }`}>
                    {item.status === 'synced' ? 'Synced to Cloud' : 'Pending Sync'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Section 2: Registered Village Directory */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Users className="w-5 h-5 text-teal-600" />
                Village Health Logbook ({patientsList.length})
              </h3>
              <span className="text-xs text-slate-500 font-mono">ASHA: Rekha Devi</span>
            </div>

            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="text"
                placeholder="Search by name, Hindi name, village, or ABHA..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-10 pr-3 py-2.5 text-xs text-slate-900 focus:outline-none focus:border-teal-500"
              />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="p-3">Health ID / ABHA</th>
                    <th className="p-3">Patient Name</th>
                    <th className="p-3">Village</th>
                    <th className="p-3">Contact</th>
                    <th className="p-3">Blood Grp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map(patient => (
                    <tr key={patient.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-3 font-mono font-bold text-teal-700">{patient.id}</td>
                      <td className="p-3 font-bold text-slate-900">
                        {patient.nameRegional || patient.name} ({patient.age}y)
                      </td>
                      <td className="p-3 text-slate-600">{patient.village}</td>
                      <td className="p-3 font-mono text-slate-500">{patient.contactNumber}</td>
                      <td className="p-3 font-bold text-amber-700">{patient.bloodGroup || 'B+'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};

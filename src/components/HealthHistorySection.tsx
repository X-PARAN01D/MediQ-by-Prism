import React, { useState, useEffect } from 'react';
import { 
  AppUser, 
  VisitRecord, 
  AppLanguage,
  Prescription 
} from '../types';
import { 
  FileText, 
  Calendar, 
  Activity, 
  Plus, 
  Search, 
  Stethoscope, 
  CheckCircle2, 
  X, 
  Pill, 
  Tag, 
  Clock, 
  ShieldCheck, 
  Trash2,
  AlertCircle,
  Printer,
  Download,
  Eye
} from 'lucide-react';
import { INITIAL_VISITS } from '../data/mockData';
import { PrescriptionPDFModal } from './PrescriptionPDFModal';

interface HealthHistorySectionProps {
  currentUser: AppUser;
  language: AppLanguage;
  onInitiateIntake?: (symptomTag?: string) => void;
  onJoinTeleconsult?: () => void;
}

const COMMON_SYMPTOM_TAGS = [
  'Fever (बुखार)',
  'Cough (खांसी)',
  'Headache (सिरदर्द)',
  'Chest Discomfort (सीने में दर्द)',
  'Knee / Joint Pain (जोड़ों का दर्द)',
  'Stomach Ache (पेट दर्द)',
  'Dizziness / Weakness (कमजोरी)',
  'High Blood Pressure (बीपी)',
  'Blood Sugar / Glucose (शुगर)'
];

export const HealthHistorySection: React.FC<HealthHistorySectionProps> = ({
  currentUser,
  language,
  onInitiateIntake
}) => {
  const [visits, setVisits] = useState<VisitRecord[]>(INITIAL_VISITS);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [modalPrescription, setModalPrescription] = useState<{ prescription: Prescription; visit?: VisitRecord } | null>(null);

  // New Record Form State
  const [visitDate, setVisitDate] = useState(new Date().toISOString().split('T')[0]);
  const [symptomsInput, setSymptomsInput] = useState<string[]>([]);
  const [customSymptom, setCustomSymptom] = useState('');
  const [doctorOrFacility, setDoctorOrFacility] = useState('Rampur Primary Health Centre');
  const [diagnosisOrIssue, setDiagnosisOrIssue] = useState('');
  const [notesAndAdvice, setNotesAndAdvice] = useState('');
  const [prescribedMeds, setPrescribedMeds] = useState('');

  // Fetch from server
  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const token = localStorage.getItem('mediq_token');
        const headers: Record<string, string> = {};
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
        const idToQuery = currentUser.patientId || currentUser.phone || currentUser.name;
        const res = await fetch(`/api/patient/health-history/${idToQuery}`, { headers });
        if (res.status === 401) {
          window.dispatchEvent(new CustomEvent('mediq:unauthorized'));
          return;
        }
        if (res.ok) {
          const data = await res.json();
          if (data.pastVisits && data.pastVisits.length > 0) {
            // Merge with initial visits to avoid losing rich clinical demos, deduplicating by ID
            const existingIds = new Set(data.pastVisits.map((v: VisitRecord) => v.id));
            const merged = [
              ...data.pastVisits,
              ...INITIAL_VISITS.filter(v => !existingIds.has(v.id))
            ];
            setVisits(merged);
          }
        }
      } catch (err) {
        console.warn('Fallback to local visits:', err);
      }
    };
    fetchHistory();
    const interval = setInterval(fetchHistory, 4000); // Polling for newly issued prescriptions
    return () => clearInterval(interval);
  }, [currentUser.phone, currentUser.patientId, currentUser.name]);

  const toggleSymptomTag = (tag: string) => {
    setSymptomsInput(prev => 
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const addCustomSymptom = (e: React.FormEvent) => {
    e.preventDefault();
    if (customSymptom.trim() && !symptomsInput.includes(customSymptom.trim())) {
      setSymptomsInput(prev => [...prev, customSymptom.trim()]);
      setCustomSymptom('');
    }
  };

  const handleSaveRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!diagnosisOrIssue.trim() && symptomsInput.length === 0) {
      alert('Please specify at least one symptom or health issue.');
      return;
    }

    const newRecord: VisitRecord = {
      id: `vst-${Date.now()}`,
      patientId: currentUser.patientId || 'PHC-UP-84920',
      patientName: currentUser.name,
      date: visitDate,
      phcName: doctorOrFacility.trim() || 'Health Centre / Home Log',
      symptoms: symptomsInput.length > 0 ? symptomsInput : [diagnosisOrIssue.trim()],
      triageCategory: 'GREEN',
      doctorName: doctorOrFacility.includes('Dr.') ? doctorOrFacility : 'Attending Medical Officer',
      doctorSpecialty: 'General Medicine',
      diagnosis: diagnosisOrIssue.trim() || symptomsInput.join(', '),
      clinicalNotes: notesAndAdvice.trim() || undefined,
      consultMode: 'In-Person',
      prescription: prescribedMeds.trim() ? {
        id: `rx-${Date.now()}`,
        visitId: `vst-${Date.now()}`,
        patientId: currentUser.patientId || 'PHC-UP-84920',
        patientName: currentUser.name,
        doctorName: doctorOrFacility || 'Medical Officer',
        diagnosis: diagnosisOrIssue.trim() || 'Health Follow-up',
        medications: [{
          name: prescribedMeds.trim(),
          dosage: 'As prescribed',
          frequency: 'Daily',
          duration: 'As instructed',
          instructions: 'Take with clean drinking water'
        }],
        advice: notesAndAdvice.trim() || 'Take adequate rest and maintain hydration',
        followUpDays: 14,
        date: visitDate
      } : undefined
    };

    try {
      const token = localStorage.getItem('mediq_token');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      await fetch('/api/patient/add-visit', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          patientId: newRecord.patientId,
          patientName: newRecord.patientName,
          date: newRecord.date,
          phcName: newRecord.phcName,
          doctorName: newRecord.doctorName,
          diagnosis: newRecord.diagnosis,
          symptoms: newRecord.symptoms,
          medicationSummary: prescribedMeds,
          advice: notesAndAdvice
        })
      });
    } catch (err) {
      console.warn('Saved record locally:', err);
    }

    setVisits(prev => [newRecord, ...prev]);
    setIsAddOpen(false);
    setSymptomsInput([]);
    setDiagnosisOrIssue('');
    setNotesAndAdvice('');
    setPrescribedMeds('');
    setSuccessMsg('Past symptom & health detail saved successfully.');
    setTimeout(() => setSuccessMsg(null), 4000);
  };

  const filteredVisits = visits.filter(v => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const matchDiag = (v.diagnosis || '').toLowerCase().includes(q);
    const matchFacility = v.phcName.toLowerCase().includes(q);
    const matchDoc = v.doctorName.toLowerCase().includes(q);
    const matchSymptoms = (v.symptoms || []).some(s => s.toLowerCase().includes(q));
    return matchDiag || matchFacility || matchDoc || matchSymptoms;
  });

  return (
    <div className="space-y-6">
      
      {/* 1. Header & Summary Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="bg-teal-50 text-teal-800 text-xs px-2.5 py-0.5 rounded-full font-bold border border-teal-200 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-teal-600" />
              <span>Past Health Details & Symptoms</span>
            </span>
            <span className="text-slate-400 text-xs font-mono">
              ABHA: {currentUser.abhaId || '84-9201-4402-9182'}
            </span>
          </div>
          <h2 className="text-xl font-black text-slate-900 mt-1">
            Past Medical History (पिछला स्वास्थ्य इतिहास)
          </h2>
          <p className="text-xs text-slate-500">
            Recorded history of your past symptoms, consultations, and prescribed care.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsAddOpen(true)}
          className="bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl flex items-center gap-1.5 shadow-sm transition-all cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>+ Add Past Symptom / Visit</span>
        </button>
      </div>

      {/* Success alert */}
      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-300 text-emerald-900 p-3.5 rounded-xl text-xs font-bold flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button 
            onClick={() => setSuccessMsg(null)}
            className="text-emerald-700 hover:text-emerald-900 text-xs underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* 2. Search and Counter */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search past symptoms, doctor or illness..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-teal-500 font-medium"
          />
        </div>

        <div className="text-xs text-slate-500 font-medium flex items-center gap-2">
          <span>Total Records: <strong>{filteredVisits.length}</strong></span>
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')}
              className="text-teal-700 hover:underline font-bold"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* 3. List of Past Details & Symptoms */}
      {filteredVisits.length > 0 ? (
        <div className="space-y-3.5">
          {filteredVisits.map(record => (
            <div 
              key={record.id}
              className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-3 hover:border-teal-300 transition-all text-xs"
            >
              {/* Top Row: Date, Facility & Doctor */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-extrabold text-sm text-slate-900">
                    {record.diagnosis || 'Clinical Consultation'}
                  </span>
                  {record.diagnosisHindi && (
                    <span className="text-slate-500 font-medium">({record.diagnosisHindi})</span>
                  )}
                </div>

                <div className="flex items-center gap-2 text-[11px] text-slate-500 font-mono">
                  <Calendar className="w-3.5 h-3.5 text-teal-600" />
                  <span>{new Date(record.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                </div>
              </div>

              {/* Middle Row: Symptoms Tags */}
              {record.symptoms && record.symptoms.length > 0 && (
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Past Symptoms Recorded (लक्षण):
                  </span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {record.symptoms.map((symptom, idx) => (
                      <span 
                        key={idx}
                        className="bg-slate-100 text-slate-800 text-[11px] font-medium px-2.5 py-1 rounded-lg border border-slate-200/60 flex items-center gap-1"
                      >
                        <Tag className="w-3 h-3 text-teal-600" />
                        <span>{symptom}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Bottom Details: Doctor / Notes / Medications */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1 text-[11px]">
                
                {/* Doctor & Facility */}
                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 space-y-1">
                  <div className="text-slate-500 flex items-center gap-1">
                    <Stethoscope className="w-3.5 h-3.5 text-teal-700 shrink-0" />
                    <span>Facility / Doctor:</span>
                  </div>
                  <div className="font-bold text-slate-800">{record.doctorName}</div>
                  <div className="text-slate-500 text-[10px]">{record.phcName}</div>
                </div>

                {/* Medications / Advice */}
                {(record.prescription?.medications?.length || record.prescription?.advice || record.clinicalNotes) && (
                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 space-y-1">
                    <div className="text-slate-500 flex items-center gap-1">
                      <Pill className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                      <span>Prescribed Care & Advice:</span>
                    </div>
                    {record.prescription?.medications && record.prescription.medications.length > 0 && (
                      <div className="font-bold text-slate-800">
                        {record.prescription.medications.map(m => `${m.name} (${m.dosage})`).join(', ')}
                      </div>
                    )}
                    {(record.prescription?.advice || record.clinicalNotes) && (
                      <div className="text-slate-600 text-[10px]">
                        {record.prescription?.advice || record.clinicalNotes}
                      </div>
                    )}
                  </div>
                )}

              </div>

              {/* Prescription PDF & Print Actions Bar */}
              {record.prescription && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-slate-100 bg-teal-50/40 p-2.5 rounded-xl border border-teal-100/60">
                  <div className="flex items-center gap-1.5 text-xs text-teal-900 font-bold">
                    <FileText className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                    <span>Digital E-Prescription ({record.prescription.id})</span>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setModalPrescription({ prescription: record.prescription!, visit: record })}
                      className="bg-white hover:bg-teal-50 text-teal-800 border border-teal-200 px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
                    >
                      <Eye className="w-3.5 h-3.5 text-teal-700" />
                      <span>View E-Prescription</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setModalPrescription({ prescription: record.prescription!, visit: record });
                        setTimeout(() => window.print(), 300);
                      }}
                      className="bg-teal-600 hover:bg-teal-700 text-white px-3.5 py-1.5 rounded-xl font-extrabold text-xs flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Get PDF / Print</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Quick Check Action */}
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={() => onInitiateIntake && onInitiateIntake(record.diagnosis || record.symptoms?.[0])}
                  className="text-teal-700 hover:text-teal-900 font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                >
                  <Activity className="w-3 h-3" />
                  <span>Check Current Symptoms for this Issue</span>
                </button>
              </div>

            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 bg-white rounded-2xl border border-slate-200 text-slate-400 space-y-2">
          <FileText className="w-10 h-10 mx-auto text-slate-300" />
          <p className="text-xs font-bold text-slate-600">No past health records found matching your query.</p>
          <button
            onClick={() => setSearchQuery('')}
            className="text-teal-700 underline text-xs font-bold cursor-pointer"
          >
            Clear Search
          </button>
        </div>
      )}

      {/* 4. MODAL: ADD PAST SYMPTOMS & DETAILS */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-lg w-full border border-slate-200 shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-black text-slate-900 text-base flex items-center gap-2">
                  <FileText className="w-4 h-4 text-teal-600" />
                  <span>Record Past Health Details & Symptoms</span>
                </h3>
                <p className="text-[11px] text-slate-500">
                  Save past clinical notes and symptoms to your medical timeline.
                </p>
              </div>
              <button 
                type="button"
                onClick={() => setIsAddOpen(false)}
                className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveRecord} className="space-y-4 text-xs">
              
              {/* Date & Facility */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Date of Visit / Symptom *</label>
                  <input
                    type="date"
                    required
                    value={visitDate}
                    onChange={e => setVisitDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs font-medium text-slate-900 focus:outline-none focus:border-teal-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Doctor / PHC Facility</label>
                  <input
                    type="text"
                    value={doctorOrFacility}
                    onChange={e => setDoctorOrFacility(e.target.value)}
                    placeholder="e.g., Rampur PHC / Dr. Suresh"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs font-medium text-slate-900 focus:outline-none focus:border-teal-500"
                  />
                </div>
              </div>

              {/* Symptoms Selector */}
              <div className="space-y-1.5">
                <label className="block font-bold text-slate-700">Past Symptoms Experienced (लक्षण चुनें):</label>
                <div className="flex flex-wrap gap-1.5">
                  {COMMON_SYMPTOM_TAGS.map(tag => {
                    const isSelected = symptomsInput.includes(tag);
                    return (
                      <button
                        type="button"
                        key={tag}
                        onClick={() => toggleSymptomTag(tag)}
                        className={`text-[11px] px-2.5 py-1 rounded-lg border font-medium transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-teal-600 text-white border-teal-600'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {isSelected ? '✓ ' : '+ '}{tag}
                      </button>
                    );
                  })}
                </div>

                {/* Custom symptom input */}
                <div className="flex gap-2 pt-1">
                  <input
                    type="text"
                    placeholder="Or type other custom symptom..."
                    value={customSymptom}
                    onChange={e => setCustomSymptom(e.target.value)}
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-teal-500"
                  />
                  <button
                    type="button"
                    onClick={addCustomSymptom}
                    className="bg-slate-800 text-white px-3 py-1.5 rounded-xl font-bold text-xs cursor-pointer hover:bg-slate-700"
                  >
                    Add
                  </button>
                </div>
              </div>

              {/* Diagnosis / Health Issue */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Diagnosis or Primary Health Issue</label>
                <input
                  type="text"
                  placeholder="e.g., Seasonal Flu, High Blood Pressure, Knee Arthritis"
                  value={diagnosisOrIssue}
                  onChange={e => setDiagnosisOrIssue(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs font-medium text-slate-900 focus:outline-none focus:border-teal-500"
                />
              </div>

              {/* Prescribed Medications */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Prescribed Medicines / Treatment (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g., Paracetamol 500mg, Amlodipine 5mg"
                  value={prescribedMeds}
                  onChange={e => setPrescribedMeds(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs font-medium text-slate-900 focus:outline-none focus:border-teal-500"
                />
              </div>

              {/* Doctor's Advice / Notes */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Doctor's Advice or Notes (Optional)</label>
                <textarea
                  rows={2}
                  placeholder="e.g., Advised warm fluids, low salt diet, review in 7 days"
                  value={notesAndAdvice}
                  onChange={e => setNotesAndAdvice(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs font-medium text-slate-900 focus:outline-none focus:border-teal-500 resize-none"
                />
              </div>

              {/* Actions */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-teal-600 hover:bg-teal-700 text-white font-extrabold px-4 py-2 rounded-xl text-xs flex items-center gap-1 shadow-sm cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Save Record</span>
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* 5. MODAL: OFFICIAL PRESCRIPTION PDF & PRINT PREVIEW */}
      {modalPrescription && (
        <PrescriptionPDFModal
          isOpen={!!modalPrescription}
          prescription={modalPrescription.prescription}
          visit={modalPrescription.visit}
          patient={currentUser}
          onClose={() => setModalPrescription(null)}
        />
      )}

    </div>
  );
};

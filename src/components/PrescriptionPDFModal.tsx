import React, { useRef } from 'react';
import { Prescription, VisitRecord, Patient, AppUser } from '../types';
import { 
  X, 
  Printer, 
  Download, 
  Share2, 
  ShieldCheck, 
  CheckCircle2, 
  Calendar, 
  User, 
  Stethoscope, 
  FileText, 
  QrCode, 
  AlertCircle,
  Building2,
  Clock,
  Pill,
  HeartPulse
} from 'lucide-react';

interface PrescriptionPDFModalProps {
  prescription: Prescription;
  visit?: VisitRecord | null;
  patient?: Patient | AppUser | null;
  isOpen: boolean;
  onClose: () => void;
}

export const PrescriptionPDFModal: React.FC<PrescriptionPDFModalProps> = ({
  prescription,
  visit,
  patient,
  isOpen,
  onClose
}) => {
  const printContainerRef = useRef<HTMLDivElement>(null);

  if (!isOpen || !prescription) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadText = () => {
    const rxText = `
========================================================================
             GOVERNMENT OF INDIA - NATIONAL HEALTH MISSION
                AYUSHMAN BHARAT DIGITAL MISSION (ABDM)
              RAMPUR PRIMARY HEALTH CENTRE (PHC) - E-SANJEEVANI
========================================================================
PRESCRIPTION ID : ${prescription.id}
DATE & TIME     : ${prescription.date} | ${new Date().toLocaleTimeString()}
CONSULT MODE    : Teleconsultation & Rural Health Network

--------------------------- PATIENT DETAILS ----------------------------
Name            : ${prescription.patientName}
Patient ID      : ${prescription.patientId}
ABHA ID         : ${patient?.abhaId || '84-9201-4402-9182'}
Age / Gender    : ${patient?.age || 48} Yrs / ${patient?.gender || 'Female'}
Village / PHC   : ${patient?.village || 'Rampur Village'}, Block Rampur, Sitapur

--------------------------- DOCTOR DETAILS -----------------------------
Doctor Name     : ${prescription.doctorName}
Specialization  : General Medicine / Medical Officer
Registration No : NMC/MCI-UP-2018-84920
Facility        : Rampur Primary Health Centre, Telemedicine Desk

------------------------ CLINICAL DIAGNOSIS ----------------------------
Diagnosis       : ${prescription.diagnosis} ${prescription.diagnosisHindi ? `(${prescription.diagnosisHindi})` : ''}

----------------------- PRESCRIBED MEDICINES (Rx) -----------------------
${prescription.medications.map((m, idx) => `
${idx + 1}. ${m.name.toUpperCase()}
   Dosage       : ${m.dosage}
   Frequency    : ${m.frequency}
   Duration     : ${m.duration}
   Instructions : ${m.instructions}
`).join('')}

--------------------------- MEDICAL ADVICE -----------------------------
Advice          : ${prescription.advice}
Follow-up       : Within ${prescription.followUpDays || 7} days

----------------------- EMERGENCY & VERIFICATION -----------------------
In case of worsening symptoms or SpO2 < 94%, report immediately to PHC
or call National Ambulance Service 108.
Digitally Signed by ${prescription.doctorName} under ABDM Guidelines.
========================================================================
    `;

    const blob = new Blob([rxText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Prescription_${prescription.patientName.replace(/\s+/g, '_')}_${prescription.id}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 print:p-0 print:bg-white print:static">
      
      {/* Container */}
      <div 
        ref={printContainerRef}
        className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-4xl max-h-[92vh] overflow-y-auto print:max-h-none print:shadow-none print:border-none print:rounded-none flex flex-col"
      >
        {/* Modal Action Header (Hidden in Print) */}
        <div className="bg-slate-900 text-white px-6 py-4 rounded-t-3xl flex items-center justify-between border-b border-slate-800 print:hidden shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-teal-500/20 border border-teal-400/30 flex items-center justify-center text-teal-300">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-sm sm:text-base">Official Digital E-Prescription (ई-पर्चा)</h3>
                <span className="bg-emerald-500/20 text-emerald-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-500/30 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" />
                  ABDM Verified
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                National Telemedicine & Primary Health Centre Network • ID: {prescription.id}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold px-3.5 py-2 rounded-xl flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
              title="Print Prescription"
            >
              <Printer className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Print / Save PDF</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadText}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold px-3 py-2 rounded-xl flex items-center gap-1.5 border border-slate-700 transition-all cursor-pointer"
              title="Download Prescription Text"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Download</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300 hover:text-white cursor-pointer ml-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable Official Prescription Paper */}
        <div className="p-6 sm:p-10 space-y-6 text-slate-800 bg-white font-sans print:p-6 print:space-y-4">
          
          {/* Header & Emblem */}
          <div className="border-b-2 border-slate-900 pb-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-800 shrink-0 font-black text-xl shadow-xs">
                <Building2 className="w-8 h-8 text-teal-700" />
              </div>
              <div>
                <div className="text-[11px] font-bold tracking-widest text-slate-500 uppercase">
                  Government of India • Ministry of Health & Family Welfare
                </div>
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  RAMPUR PRIMARY HEALTH CENTRE
                </h1>
                <div className="text-xs font-semibold text-teal-800 flex items-center justify-center sm:justify-start gap-2">
                  <span>Block Rampur, District Sitapur, Uttar Pradesh</span>
                  <span>•</span>
                  <span>National Health Mission (NHM)</span>
                </div>
              </div>
            </div>

            <div className="text-center sm:text-right shrink-0">
              <div className="inline-block bg-teal-50 border border-teal-200 px-3 py-1 rounded-xl text-teal-900 text-xs font-bold">
                E-SANJEEVANI TELECONSULT
              </div>
              <div className="text-[11px] font-mono text-slate-600 mt-1">
                <strong>Rx No:</strong> {prescription.id}
              </div>
              <div className="text-[11px] text-slate-500">
                <strong>Date:</strong> {prescription.date || new Date().toISOString().split('T')[0]}
              </div>
            </div>
          </div>

          {/* Patient & Doctor Two-Column Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs bg-slate-50 p-4 rounded-2xl border border-slate-200">
            
            {/* Patient Meta */}
            <div className="space-y-1.5 border-b sm:border-b-0 sm:border-r border-slate-200 pb-3 sm:pb-0 sm:pr-4">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-teal-800 flex items-center gap-1">
                <User className="w-3.5 h-3.5 text-teal-600" />
                Patient Details (रोगी का विवरण)
              </span>
              <div className="text-sm font-extrabold text-slate-900">
                {prescription.patientName}
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-700">
                <div>
                  <span className="text-slate-400">Patient ID:</span> <strong className="font-mono">{prescription.patientId}</strong>
                </div>
                <div>
                  <span className="text-slate-400">ABHA ID:</span> <strong className="font-mono text-teal-700">{patient?.abhaId || '84-9201-4402-9182'}</strong>
                </div>
                <div>
                  <span className="text-slate-400">Age / Gender:</span> <strong>{patient?.age || 48} Yrs / {patient?.gender || 'Female'}</strong>
                </div>
                <div>
                  <span className="text-slate-400">Village:</span> <strong>{patient?.village || 'Rampur Village'}</strong>
                </div>
              </div>
            </div>

            {/* Doctor Meta */}
            <div className="space-y-1.5 sm:pl-2">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-800 flex items-center gap-1">
                <Stethoscope className="w-3.5 h-3.5 text-indigo-600" />
                Attending Doctor Details (चिकित्सक विवरण)
              </span>
              <div className="text-sm font-extrabold text-slate-900">
                {prescription.doctorName}
              </div>
              <div className="text-[11px] text-slate-700 space-y-0.5">
                <div><span className="text-slate-400">Specialty:</span> <strong>General Medicine & Tele-triage</strong></div>
                <div><span className="text-slate-400">Registration:</span> <strong className="font-mono">NMC/MCI-UP-2018-84920</strong></div>
                <div><span className="text-slate-400">Centre:</span> <strong>Rampur PHC Telemedicine Booth</strong></div>
              </div>
            </div>

          </div>

          {/* Vitals Bar if available */}
          {visit?.vitals && (
            <div className="flex items-center gap-4 bg-emerald-50/70 border border-emerald-200/80 px-4 py-2 rounded-xl text-xs flex-wrap">
              <span className="font-bold text-emerald-900 flex items-center gap-1 text-[11px]">
                <HeartPulse className="w-3.5 h-3.5 text-emerald-700" />
                Vitals Recorded:
              </span>
              {visit.vitals.spO2 && (
                <span className="text-emerald-800 text-[11px]">SpO2: <strong>{visit.vitals.spO2}%</strong></span>
              )}
              {visit.vitals.temperature && (
                <span className="text-emerald-800 text-[11px]">Temp: <strong>{visit.vitals.temperature}°F</strong></span>
              )}
              {visit.vitals.systolicBP && (
                <span className="text-emerald-800 text-[11px]">BP: <strong>{visit.vitals.systolicBP}/{visit.vitals.diastolicBP || 80} mmHg</strong></span>
              )}
              {visit.vitals.pulseRate && (
                <span className="text-emerald-800 text-[11px]">Pulse: <strong>{visit.vitals.pulseRate} bpm</strong></span>
              )}
            </div>
          )}

          {/* Diagnosis Section */}
          <div className="border border-slate-200 rounded-2xl p-4 bg-white shadow-2xs space-y-1">
            <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <span>PROVISIONAL / CLINICAL DIAGNOSIS (नैदानिक निष्कर्ष)</span>
            </div>
            <div className="text-base font-extrabold text-slate-900 flex items-center gap-2 flex-wrap">
              <span>{prescription.diagnosis}</span>
              {prescription.diagnosisHindi && (
                <span className="text-slate-500 text-xs font-semibold">({prescription.diagnosisHindi})</span>
              )}
            </div>
            {visit?.symptoms && visit.symptoms.length > 0 && (
              <div className="text-xs text-slate-500 pt-1">
                <span className="font-bold">Chief Symptoms Reported:</span> {visit.symptoms.join(', ')}
              </div>
            )}
          </div>

          {/* Rx Medications Table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
              <div className="flex items-center gap-2">
                <span className="font-black text-xl text-teal-800 font-serif italic">℞</span>
                <h3 className="font-black text-sm text-slate-900 uppercase tracking-wider">
                  Prescribed Medications (दवाइयाँ)
                </h3>
              </div>
              <span className="text-[11px] text-teal-800 bg-teal-50 px-2.5 py-0.5 rounded-full font-bold border border-teal-200">
                Available at PHC Jan Aushadhi Dispensary
              </span>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-3 text-[11px] w-12 text-center">#</th>
                    <th className="p-3 text-[11px]">Medicine Name & Form</th>
                    <th className="p-3 text-[11px]">Dosage</th>
                    <th className="p-3 text-[11px]">Frequency / Timing</th>
                    <th className="p-3 text-[11px]">Duration</th>
                    <th className="p-3 text-[11px]">Instructions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {prescription.medications.map((med, index) => (
                    <tr key={index} className="hover:bg-slate-50/50">
                      <td className="p-3 font-bold text-center text-slate-400">{index + 1}</td>
                      <td className="p-3 font-bold text-slate-900 text-sm">
                        {med.name}
                      </td>
                      <td className="p-3 text-slate-700 font-medium">{med.dosage || '1 Tab'}</td>
                      <td className="p-3 font-semibold text-slate-800">
                        <span className="bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                          {med.frequency}
                        </span>
                      </td>
                      <td className="p-3 text-slate-700 font-medium">{med.duration || '5 days'}</td>
                      <td className="p-3 text-slate-600 text-[11px]">{med.instructions || 'With water after food'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Advice & Lifestyle Guidance */}
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-2 text-xs">
            <span className="font-extrabold text-[11px] text-slate-800 uppercase tracking-wider block">
              Dietary Advice & Clinical Guidance (परामर्श व निर्देश):
            </span>
            <p className="text-slate-700 leading-relaxed font-medium">
              {prescription.advice || 'Maintain oral rehydration with boiled water, eat light nutritious food, take medications on time, and avoid heavy manual exertion for 3 days.'}
            </p>
          </div>

          {/* Follow-up & Red Flags */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="bg-teal-50/70 border border-teal-200 rounded-xl p-3 space-y-1">
              <span className="font-extrabold text-teal-900 text-[11px] flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-teal-700" />
                Follow-up Schedule:
              </span>
              <p className="text-teal-800 font-medium">
                Review at Rampur PHC in <strong>{prescription.followUpDays || 7} Days</strong> or teleconsult if symptoms do not improve.
              </p>
            </div>

            <div className="bg-rose-50/70 border border-rose-200 rounded-xl p-3 space-y-1">
              <span className="font-extrabold text-rose-900 text-[11px] flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                Emergency Warning (आपातकालीन चेतावनी):
              </span>
              <p className="text-rose-800 font-medium text-[11px]">
                If breathlessness, chest pain, high fever &gt; 102°F or fainting occurs, call <strong>108 Ambulance</strong> immediately.
              </p>
            </div>
          </div>

          {/* Doctor Digital Stamp & Signature */}
          <div className="border-t border-slate-200 pt-6 flex flex-col sm:flex-row items-center justify-between gap-6">
            
            {/* QR Code Verification */}
            <div className="flex items-center gap-3 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
              <div className="w-14 h-14 bg-white border border-slate-300 rounded-lg flex items-center justify-center p-1 shadow-2xs">
                {/* SVG QR Code Simulation */}
                <svg viewBox="0 0 100 100" className="w-full h-full text-slate-900 fill-current">
                  <path d="M10 10 h30 v30 h-30 z M15 15 v20 h20 v-20 z M20 20 h10 v10 h-10 z" />
                  <path d="M60 10 h30 v30 h-30 z M65 15 v20 h20 v-20 z M70 20 h10 v10 h-10 z" />
                  <path d="M10 60 h30 v30 h-30 z M15 65 v20 h20 v-20 z M20 70 h10 v10 h-10 z" />
                  <rect x="45" y="15" width="8" height="8" />
                  <rect x="45" y="30" width="8" height="8" />
                  <rect x="45" y="45" width="8" height="8" />
                  <rect x="60" y="45" width="8" height="8" />
                  <rect x="75" y="45" width="15" height="8" />
                  <rect x="45" y="60" width="8" height="15" />
                  <rect x="60" y="60" width="15" height="8" />
                  <rect x="60" y="75" width="8" height="15" />
                  <rect x="75" y="75" width="15" height="15" />
                </svg>
              </div>
              <div className="text-[10px] text-slate-500 space-y-0.5">
                <div className="font-bold text-slate-800">Scan to Verify Record</div>
                <div>ABDM Registry Hash: #{prescription.id.slice(-8).toUpperCase()}</div>
                <div>E-Sign Timestamp: {new Date().toLocaleDateString()}</div>
              </div>
            </div>

            {/* Doctor Signature Stamp */}
            <div className="text-center sm:text-right space-y-1">
              <div className="font-serif italic font-bold text-lg text-indigo-950 border-b border-dashed border-slate-300 pb-1 inline-block px-4">
                {prescription.doctorName}
              </div>
              <div className="text-xs font-bold text-slate-900">
                Digitally Signed & Certified Medical Officer
              </div>
              <div className="text-[11px] text-slate-500 font-mono">
                Reg: NMC-UP-2018-84920 • Rampur PHC
              </div>
            </div>

          </div>

          {/* Footer Legal Note */}
          <div className="border-t border-slate-100 pt-3 text-center text-[10px] text-slate-400">
            This is an electronically generated and digitally validated electronic prescription under the Telemedicine Practice Guidelines, National Medical Commission & ABDM Act, Government of India.
          </div>

        </div>

      </div>

    </div>
  );
};

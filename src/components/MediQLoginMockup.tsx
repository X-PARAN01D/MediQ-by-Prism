import React, { useState } from 'react';
import { 
  User, 
  Stethoscope, 
  Phone, 
  ShieldCheck, 
  KeyRound, 
  CheckCircle2, 
  BadgeCheck, 
  Building2,
  ArrowRight,
  Send,
  Lock,
  HeartPulse
} from 'lucide-react';

export const MediQLoginMockup: React.FC = () => {
  const [selectedRole, setSelectedRole] = useState<'patient' | 'doctor'>('patient');
  
  // Patient mock state
  const [patientPhone, setPatientPhone] = useState('98123 45678');
  const [patientOtp, setPatientOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [patientVerified, setPatientVerified] = useState(false);

  // Doctor mock state
  const [doctorName, setDoctorName] = useState('Dr. Suresh Verma');
  const [medicalId, setMedicalId] = useState('MCI-UP-2018-84920');
  const [doctorLoggedIn, setDoctorLoggedIn] = useState(false);

  const handleSendOtp = () => {
    setOtpSent(true);
  };

  const handleVerifyOtp = () => {
    setPatientVerified(true);
  };

  const handleDoctorLogin = () => {
    setDoctorLoggedIn(true);
  };

  const handleReset = () => {
    setOtpSent(false);
    setPatientVerified(false);
    setDoctorLoggedIn(false);
  };

  return (
    <div id="mediq-login-mockup-wrapper" className="min-h-screen bg-slate-100/80 text-slate-800 flex items-center justify-center p-4 sm:p-6 font-sans">
      <div className="w-full max-w-md bg-white rounded-3xl border border-slate-200/90 shadow-xl overflow-hidden">
        
        {/* Brand / Top Header */}
        <div className="bg-gradient-to-r from-emerald-800 via-teal-800 to-cyan-900 text-white p-6 text-center relative overflow-hidden">
          <div className="flex items-center justify-center gap-2 mb-2">
            <div className="w-9 h-9 rounded-xl bg-white/15 backdrop-blur-sm border border-white/25 flex items-center justify-center text-emerald-200">
              <HeartPulse className="w-5 h-5 text-emerald-300" />
            </div>
            <span className="font-extrabold text-xl tracking-tight">MediQ</span>
          </div>
          <h1 className="text-base font-bold text-emerald-50">AI Symptom Checker & Teleconsultation Queue</h1>
          <p className="text-xs text-emerald-200/80 mt-1">Smart Healthcare Portal for Rural PHCs & Clinics</p>
        </div>

        {/* Role Switcher Tabs */}
        <div className="p-3 bg-slate-100/90 border-b border-slate-200">
          <div className="grid grid-cols-2 p-1 bg-slate-200/80 rounded-2xl gap-1">
            <button
              id="role-tab-patient"
              type="button"
              onClick={() => {
                setSelectedRole('patient');
                handleReset();
              }}
              className={`py-2.5 px-3 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer ${
                selectedRole === 'patient'
                  ? 'bg-white text-emerald-900 shadow-sm border border-slate-200/60 font-black'
                  : 'text-slate-600 hover:text-slate-900 font-semibold'
              }`}
            >
              <User className="w-4 h-4 text-emerald-600" />
              <span>Patient (मरीज़)</span>
            </button>

            <button
              id="role-tab-doctor"
              type="button"
              onClick={() => {
                setSelectedRole('doctor');
                handleReset();
              }}
              className={`py-2.5 px-3 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer ${
                selectedRole === 'doctor'
                  ? 'bg-white text-cyan-950 shadow-sm border border-slate-200/60 font-black'
                  : 'text-slate-600 hover:text-slate-900 font-semibold'
              }`}
            >
              <Stethoscope className="w-4 h-4 text-cyan-700" />
              <span>Doctor (चिकित्सक)</span>
            </button>
          </div>
        </div>

        {/* Form Container */}
        <div className="p-6 space-y-5">

          {/* PATIENT LOGIN FORM */}
          {selectedRole === 'patient' && (
            <div id="patient-login-form" className="space-y-4 animate-fadeIn">
              <div className="border-b border-slate-100 pb-2">
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <User className="w-4 h-4 text-emerald-700" />
                  <span>Patient Login with Mobile OTP</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">Enter your phone number to receive a secure one-time verification code.</p>
              </div>

              {/* Phone Number Field */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">Mobile Phone Number</label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs font-semibold text-slate-500">+91</span>
                  <input
                    id="patient-phone-input"
                    type="tel"
                    value={patientPhone}
                    onChange={(e) => setPatientPhone(e.target.value)}
                    placeholder="98765 43210"
                    className="w-full pl-11 pr-3 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                  />
                  <Phone className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                </div>
              </div>

              {/* Send OTP Button */}
              {!otpSent && (
                <button
                  id="patient-send-otp-btn"
                  type="button"
                  onClick={handleSendOtp}
                  className="w-full py-3 px-4 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs sm:text-sm rounded-xl shadow-md flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-[0.99]"
                >
                  <Send className="w-4 h-4" />
                  <span>Send OTP / ओटीपी भेजें</span>
                </button>
              )}

              {/* OTP Input and Verify Button */}
              {otpSent && (
                <div className="space-y-4 pt-1 animate-fadeIn">
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                      OTP code sent to <strong>+91 {patientPhone}</strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => setOtpSent(false)}
                      className="text-emerald-700 underline font-bold text-[11px] cursor-pointer"
                    >
                      Change
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-700">Enter 4-Digit OTP Code</label>
                    <div className="relative">
                      <input
                        id="patient-otp-input"
                        type="text"
                        maxLength={6}
                        value={patientOtp}
                        onChange={(e) => setPatientOtp(e.target.value)}
                        placeholder="• • • •"
                        className="w-full pl-10 pr-3 py-2.5 text-center tracking-[0.4em] font-mono text-base font-bold bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                      />
                      <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    </div>
                  </div>

                  <button
                    id="patient-verify-login-btn"
                    type="button"
                    onClick={handleVerifyOtp}
                    className="w-full py-3 px-4 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs sm:text-sm rounded-xl shadow-md flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-[0.99]"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Verify & Login / पुष्टि करें और लॉगिन करें</span>
                  </button>
                </div>
              )}

              {/* Patient Mock Success Feedback */}
              {patientVerified && (
                <div className="p-3.5 bg-emerald-100 border border-emerald-300 text-emerald-950 rounded-xl text-xs font-medium space-y-1 animate-fadeIn">
                  <div className="flex items-center gap-1.5 font-bold text-emerald-900">
                    <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                    <span>Mock Login Successful (Patient)</span>
                  </div>
                  <p className="text-[11px] text-emerald-800">
                    Ready to proceed to AI Symptom Triage, Queue Token booking, and Video Consultations.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* DOCTOR LOGIN FORM */}
          {selectedRole === 'doctor' && (
            <div id="doctor-login-form" className="space-y-4 animate-fadeIn">
              <div className="border-b border-slate-100 pb-2">
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <Stethoscope className="w-4 h-4 text-cyan-800" />
                  <span>Medical Officer & Specialist Portal</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">Sign in to manage the live waiting queue, video calls, and e-prescriptions.</p>
              </div>

              {/* Full Name Field */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">Doctor Full Name</label>
                <div className="relative">
                  <input
                    id="doctor-fullname-input"
                    type="text"
                    value={doctorName}
                    onChange={(e) => setDoctorName(e.target.value)}
                    placeholder="e.g. Dr. Suresh Verma"
                    className="w-full pl-9 pr-3 py-2.5 text-xs sm:text-sm bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-600 focus:bg-white font-medium"
                  />
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                </div>
              </div>

              {/* Medical ID / Registration Number Field */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">Medical Registration / License ID</label>
                <div className="relative">
                  <input
                    id="doctor-medical-id-input"
                    type="text"
                    value={medicalId}
                    onChange={(e) => setMedicalId(e.target.value)}
                    placeholder="e.g. MCI-UP-2018-84920"
                    className="w-full pl-9 pr-3 py-2.5 text-xs sm:text-sm bg-slate-50 border border-slate-300 rounded-xl font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-600 focus:bg-white"
                  />
                  <BadgeCheck className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                </div>
                <p className="text-[11px] text-slate-500 flex items-center gap-1">
                  <Building2 className="w-3 h-3 text-slate-400" />
                  <span>Verified with National Medical Commission (NMC / State Council)</span>
                </p>
              </div>

              {/* Doctor Login Button */}
              <button
                id="doctor-login-btn"
                type="button"
                onClick={handleDoctorLogin}
                className="w-full py-3 px-4 bg-cyan-800 hover:bg-cyan-900 text-white font-bold text-xs sm:text-sm rounded-xl shadow-md flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-[0.99]"
              >
                <Lock className="w-4 h-4" />
                <span>Doctor Login / चिकित्सक लॉगिन</span>
              </button>

              {/* Doctor Mock Success Feedback */}
              {doctorLoggedIn && (
                <div className="p-3.5 bg-cyan-50 border border-cyan-300 text-cyan-950 rounded-xl text-xs font-medium space-y-1 animate-fadeIn">
                  <div className="flex items-center gap-1.5 font-bold text-cyan-900">
                    <CheckCircle2 className="w-4 h-4 text-cyan-700" />
                    <span>Mock Login Verified (Doctor)</span>
                  </div>
                  <p className="text-[11px] text-cyan-800">
                    Welcome {doctorName}. Telemedicine Desk & Triaged Queue ready.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Footer Note */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
            <span className="flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              UI Mockup (No live auth required)
            </span>
            <button
              type="button"
              onClick={handleReset}
              className="text-slate-500 hover:text-slate-800 underline font-medium cursor-pointer"
            >
              Reset Form
            </button>
          </div>

        </div>

      </div>
    </div>
  );
};

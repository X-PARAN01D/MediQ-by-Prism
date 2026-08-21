import React, { useState } from 'react';
import { AppUser, UserRole, AppLanguage } from '../types';
import { 
  User, 
  Stethoscope, 
  Sparkles, 
  Phone, 
  Lock, 
  ArrowRight, 
  ShieldCheck, 
  HeartPulse, 
  CheckCircle2, 
  Building2, 
  BadgeCheck,
  UserPlus,
  LogIn,
  Eye,
  EyeOff,
  MapPin,
  Calendar,
  AlertCircle,
  Loader2,
  Database
} from 'lucide-react';

interface LandingAuthViewProps {
  onLoginSuccess: (user: AppUser) => void;
  language: AppLanguage;
}

type AuthMode = 'login' | 'register';

export const LandingAuthView: React.FC<LandingAuthViewProps> = ({ onLoginSuccess, language }) => {
  const [selectedRole, setSelectedRole] = useState<UserRole>('patient');
  const [authMode, setAuthMode] = useState<AuthMode>('login');

  // Common form states
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Patient Form States
  const [patientLoginPhone, setPatientLoginPhone] = useState('9812345678');
  const [patientLoginPassword, setPatientLoginPassword] = useState('password123');
  
  const [patientRegName, setPatientRegName] = useState('');
  const [patientRegPhone, setPatientRegPhone] = useState('');
  const [patientRegPassword, setPatientRegPassword] = useState('');
  const [patientRegAge, setPatientRegAge] = useState('32');
  const [patientRegGender, setPatientRegGender] = useState<'Male' | 'Female' | 'Other'>('Female');
  const [patientRegVillage, setPatientRegVillage] = useState('Rampur Village');

  // Doctor Form States
  const [doctorLoginId, setDoctorLoginId] = useState('MCI-UP-2018-84920');
  const [doctorLoginPassword, setDoctorLoginPassword] = useState('password123');

  const [doctorRegName, setDoctorRegName] = useState('');
  const [doctorRegMedicalId, setDoctorRegMedicalId] = useState('');
  const [doctorRegPassword, setDoctorRegPassword] = useState('');
  const [doctorRegSpecialization, setDoctorRegSpecialization] = useState('General Medicine & Tele-Emergency MO');
  const [doctorRegLocation, setDoctorRegLocation] = useState('Rampur Primary Health Centre (PHC)');
  const [doctorRegPhone, setDoctorRegPhone] = useState('');

  // Handle Quick Demo One-Click Access
  const handleQuickDemoLogin = async (role: UserRole, identifier: string, pass: string) => {
    setSelectedRole(role);
    setAuthMode('login');
    setErrorMsg('');
    setSuccessMsg('');
    setLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier,
          password: pass,
          role
        })
      });

      const data = await response.json();
      if (!response.ok) {
        const errorText = (data.errors && data.errors.length > 0)
          ? data.errors.map((e: any) => e.message).join(' • ')
          : (data.error || data.message || 'Failed to authenticate');
        throw new Error(errorText);
      }

      if (data.token) {
        localStorage.setItem('mediq_token', data.token);
      }

      setSuccessMsg(`Welcome, ${data.user.name}! Directing to your dashboard...`);
      setTimeout(() => {
        onLoginSuccess(data.user);
      }, 500);
    } catch (err: any) {
      setErrorMsg(err.message || 'Demo login failed');
    } finally {
      setLoading(false);
    }
  };

  // Submit Patient Login
  const handlePatientLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientLoginPhone.trim()) {
      setErrorMsg('Please enter your mobile phone number.');
      return;
    }

    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: patientLoginPhone,
          password: patientLoginPassword,
          role: 'patient'
        })
      });

      const data = await res.json();
      if (!res.ok) {
        const errorText = (data.errors && data.errors.length > 0)
          ? data.errors.map((e: any) => e.message).join(' • ')
          : (data.error || data.message || 'Login failed');
        throw new Error(errorText);
      }

      if (data.token) {
        localStorage.setItem('mediq_token', data.token);
      }

      setSuccessMsg('Login successful! Redirecting...');
      setTimeout(() => {
        onLoginSuccess(data.user);
      }, 400);
    } catch (err: any) {
      setErrorMsg(err.message || 'Unable to connect to server');
    } finally {
      setLoading(false);
    }
  };

  // Submit Patient Registration
  const handlePatientRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientRegName.trim() || !patientRegPhone.trim() || !patientRegPassword.trim()) {
      setErrorMsg('Please complete all required fields (Name, Phone, Password).');
      return;
    }

    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await fetch('/api/auth/register/patient', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: patientRegName,
          phone: patientRegPhone,
          password: patientRegPassword,
          age: Number(patientRegAge) || 30,
          gender: patientRegGender,
          village: patientRegVillage
        })
      });

      const data = await res.json();
      if (!res.ok) {
        const errorText = (data.errors && data.errors.length > 0)
          ? data.errors.map((e: any) => e.message).join(' • ')
          : (data.error || data.message || 'Registration failed');
        throw new Error(errorText);
      }

      if (data.token) {
        localStorage.setItem('mediq_token', data.token);
      }

      setSuccessMsg('Account created successfully in SQLite! Opening Patient Dashboard...');
      setTimeout(() => {
        onLoginSuccess(data.user);
      }, 600);
    } catch (err: any) {
      setErrorMsg(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  // Submit Doctor Login
  const handleDoctorLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!doctorLoginId.trim()) {
      setErrorMsg('Please enter your Medical Registration ID or Phone Number.');
      return;
    }

    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: doctorLoginId,
          password: doctorLoginPassword,
          role: 'doctor'
        })
      });

      const data = await res.json();
      if (!res.ok) {
        const errorText = (data.errors && data.errors.length > 0)
          ? data.errors.map((e: any) => e.message).join(' • ')
          : (data.error || data.message || 'Doctor login failed');
        throw new Error(errorText);
      }

      if (data.token) {
        localStorage.setItem('mediq_token', data.token);
      }

      setSuccessMsg('Doctor authenticated! Redirecting...');
      setTimeout(() => {
        onLoginSuccess(data.user);
      }, 400);
    } catch (err: any) {
      setErrorMsg(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  // Submit Doctor Registration
  const handleDoctorRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !doctorRegName.trim() ||
      !doctorRegMedicalId.trim() ||
      !doctorRegPassword.trim() ||
      !doctorRegSpecialization.trim() ||
      !doctorRegLocation.trim() ||
      !doctorRegPhone.trim()
    ) {
      setErrorMsg('Please fill in all doctor registration fields.');
      return;
    }

    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await fetch('/api/auth/register/doctor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: doctorRegName,
          medicalId: doctorRegMedicalId,
          password: doctorRegPassword,
          specialization: doctorRegSpecialization,
          location: doctorRegLocation,
          contactNumber: doctorRegPhone
        })
      });

      const data = await res.json();
      if (!res.ok) {
        const errorText = (data.errors && data.errors.length > 0)
          ? data.errors.map((e: any) => e.message).join(' • ')
          : (data.error || data.message || 'Doctor registration failed');
        throw new Error(errorText);
      }

      if (data.token) {
        localStorage.setItem('mediq_token', data.token);
      }

      setSuccessMsg('Doctor profile registered & verified in database! Redirecting...');
      setTimeout(() => {
        onLoginSuccess(data.user);
      }, 600);
    } catch (err: any) {
      setErrorMsg(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-6 animate-fadeIn py-2 sm:py-6 font-sans">
      
      {/* Main Role Selection & Auth Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden">
        
        {/* Brand Header */}
        <div className="bg-gradient-to-r from-emerald-900 via-teal-900 to-cyan-950 text-white p-6 sm:p-7 text-center relative border-b border-emerald-800/40">
          <div className="flex items-center justify-center gap-2 mb-2">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center shadow-inner">
              <HeartPulse className="w-5 h-5 text-emerald-400" />
            </div>
            <span className="font-extrabold text-2xl tracking-tight text-white">MediQ</span>
          </div>
          <h1 className="text-sm sm:text-base font-bold text-emerald-100">
            AI Symptom Checker & Teleconsultation Queue
          </h1>
          <p className="text-xs text-emerald-300/80 mt-1">
            Secure Authentication with Persistent SQLite Database & Scrypt Hashing
          </p>

          {/* Database Badge */}
          <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-950/60 border border-emerald-500/30 text-[11px] text-emerald-300 font-mono">
            <Database className="w-3 h-3 text-emerald-400" />
            <span>SQLite Embedded DB (Active & Hashed)</span>
          </div>
        </div>

        {/* 1. Primary Role Selection Tabs */}
        <div className="p-3.5 bg-slate-950/80 border-b border-slate-800">
          <div className="grid grid-cols-2 p-1 bg-slate-900 rounded-2xl gap-1.5 border border-slate-800">
            {/* Patient Role Button */}
            <button
              id="role-tab-patient"
              type="button"
              onClick={() => {
                setSelectedRole('patient');
                setErrorMsg('');
                setSuccessMsg('');
              }}
              className={`py-3 px-4 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer ${
                selectedRole === 'patient'
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950 font-black'
                  : 'text-slate-400 hover:text-slate-200 font-semibold'
              }`}
            >
              <User className="w-4 h-4" />
              <span>Patient (मरीज़)</span>
            </button>

            {/* Doctor Role Button */}
            <button
              id="role-tab-doctor"
              type="button"
              onClick={() => {
                setSelectedRole('doctor');
                setErrorMsg('');
                setSuccessMsg('');
              }}
              className={`py-3 px-4 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer ${
                selectedRole === 'doctor'
                  ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-950 font-black'
                  : 'text-slate-400 hover:text-slate-200 font-semibold'
              }`}
            >
              <Stethoscope className="w-4 h-4" />
              <span>Doctor (चिकित्सक)</span>
            </button>
          </div>

          {/* 2. Sub-Tabs: Login vs Register (New Account) */}
          <div className="flex items-center justify-center gap-2 mt-3 pt-1">
            <button
              type="button"
              onClick={() => {
                setAuthMode('login');
                setErrorMsg('');
                setSuccessMsg('');
              }}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                authMode === 'login'
                  ? 'bg-slate-800 text-teal-300 border border-teal-500/40 shadow-xs'
                  : 'text-slate-400 hover:text-slate-300'
              }`}
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Login to Existing Account</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setAuthMode('register');
                setErrorMsg('');
                setSuccessMsg('');
              }}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                authMode === 'register'
                  ? 'bg-slate-800 text-teal-300 border border-teal-500/40 shadow-xs'
                  : 'text-slate-400 hover:text-slate-300'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Register New Account</span>
            </button>
          </div>
        </div>

        {/* Form Body Container */}
        <div className="p-6 sm:p-8 space-y-6">

          {/* Error Message Notification */}
          {errorMsg && (
            <div className="p-3.5 bg-rose-950/70 border border-rose-800 text-rose-200 rounded-xl text-xs font-medium flex items-start gap-2 animate-fadeIn">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Success Message Notification */}
          {successMsg && (
            <div className="p-3.5 bg-emerald-950/70 border border-emerald-700 text-emerald-200 rounded-xl text-xs font-medium flex items-start gap-2 animate-fadeIn">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* ========================================================= */}
          {/* 1. PATIENT: LOGIN VIEW */}
          {/* ========================================================= */}
          {selectedRole === 'patient' && authMode === 'login' && (
            <form id="patient-login-form" onSubmit={handlePatientLogin} className="space-y-4 animate-fadeIn">
              <div className="border-b border-slate-800 pb-2">
                <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  <User className="w-4 h-4 text-emerald-400" />
                  <span>Patient Login / मरीज़ लॉगिन</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Sign in with your registered 10-digit mobile number and password.
                </p>
              </div>

              {/* Phone Number Field */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-300">Mobile Phone Number (10 Digits)</label>
                <div className="relative">
                  <span className="absolute left-3 top-3 text-xs font-semibold text-slate-400">+91</span>
                  <input
                    id="patient-login-phone"
                    type="tel"
                    required
                    value={patientLoginPhone}
                    onChange={(e) => setPatientLoginPhone(e.target.value)}
                    placeholder="98765 43210"
                    className="w-full pl-11 pr-10 py-2.5 text-sm bg-slate-950 border border-slate-700 rounded-xl font-mono text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <Phone className="w-4 h-4 text-slate-500 absolute right-3 top-3" />
                </div>
              </div>

              {/* Password Field */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-300">Password / पासवर्ड</label>
                  <span className="text-[11px] text-slate-400">Demo default: <code className="text-emerald-300">password123</code></span>
                </div>
                <div className="relative">
                  <input
                    id="patient-login-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={patientLoginPassword}
                    onChange={(e) => setPatientLoginPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full pl-10 pr-10 py-2.5 text-sm bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3 text-slate-400 hover:text-slate-200 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Submit Button */}
              <button
                id="patient-login-submit-btn"
                type="submit"
                disabled={loading}
                className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs sm:text-sm rounded-xl shadow-lg flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-[0.99] disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Verifying Credentials...</span>
                  </>
                ) : (
                  <>
                    <LogIn className="w-4 h-4" />
                    <span>Login / लॉगिन करें</span>
                  </>
                )}
              </button>
            </form>
          )}

          {/* ========================================================= */}
          {/* 2. PATIENT: REGISTER VIEW */}
          {/* ========================================================= */}
          {selectedRole === 'patient' && authMode === 'register' && (
            <form id="patient-register-form" onSubmit={handlePatientRegister} className="space-y-4 animate-fadeIn">
              <div className="border-b border-slate-800 pb-2">
                <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-emerald-400" />
                  <span>Register New Patient Account / नया मरीज़ पंजीकरण</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Creates your secure profile with an automated Ayushman Bharat ABHA Health ID.
                </p>
              </div>

              {/* Full Name */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-300">Full Name / पूरा नाम *</label>
                <div className="relative">
                  <input
                    id="patient-reg-name"
                    type="text"
                    required
                    value={patientRegName}
                    onChange={(e) => setPatientRegName(e.target.value)}
                    placeholder="e.g. Ramesh Chandra"
                    className="w-full pl-9 pr-3 py-2.5 text-xs sm:text-sm bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <User className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                </div>
              </div>

              {/* Phone & Age row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-300">Mobile Phone Number *</label>
                  <div className="relative">
                    <span className="absolute left-3 top-3 text-xs font-semibold text-slate-400">+91</span>
                    <input
                      id="patient-reg-phone"
                      type="tel"
                      required
                      value={patientRegPhone}
                      onChange={(e) => setPatientRegPhone(e.target.value)}
                      placeholder="98765 00000"
                      className="w-full pl-11 pr-3 py-2.5 text-xs sm:text-sm bg-slate-950 border border-slate-700 rounded-xl font-mono text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-300">Age / उम्र</label>
                  <div className="relative">
                    <input
                      id="patient-reg-age"
                      type="number"
                      min={1}
                      max={110}
                      value={patientRegAge}
                      onChange={(e) => setPatientRegAge(e.target.value)}
                      placeholder="35"
                      className="w-full pl-9 pr-3 py-2.5 text-xs sm:text-sm bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <Calendar className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                  </div>
                </div>
              </div>

              {/* Gender & Village row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-300">Gender / लिंग</label>
                  <select
                    id="patient-reg-gender"
                    value={patientRegGender}
                    onChange={(e) => setPatientRegGender(e.target.value as any)}
                    className="w-full px-3 py-2.5 text-xs sm:text-sm bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="Female">Female (महिला)</option>
                    <option value="Male">Male (पुरुष)</option>
                    <option value="Other">Other (अन्य)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-300">Village / Locality</label>
                  <div className="relative">
                    <input
                      id="patient-reg-village"
                      type="text"
                      value={patientRegVillage}
                      onChange={(e) => setPatientRegVillage(e.target.value)}
                      placeholder="e.g. Rampur Village"
                      className="w-full pl-9 pr-3 py-2.5 text-xs sm:text-sm bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <MapPin className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                  </div>
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-300">Create Secure Password *</label>
                <div className="relative">
                  <input
                    id="patient-reg-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={patientRegPassword}
                    onChange={(e) => setPatientRegPassword(e.target.value)}
                    placeholder="At least 4 characters"
                    className="w-full pl-10 pr-10 py-2.5 text-xs sm:text-sm bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3 text-slate-400 hover:text-slate-200 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Submit Registration */}
              <button
                id="patient-register-submit-btn"
                type="submit"
                disabled={loading}
                className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs sm:text-sm rounded-xl shadow-lg flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-[0.99] disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Saving to SQLite Database...</span>
                  </>
                ) : (
                  <>
                    <UserPlus className="w-4 h-4" />
                    <span>Create Account & Start / खाता बनाएं</span>
                  </>
                )}
              </button>
            </form>
          )}

          {/* ========================================================= */}
          {/* 3. DOCTOR: LOGIN VIEW */}
          {/* ========================================================= */}
          {selectedRole === 'doctor' && authMode === 'login' && (
            <form id="doctor-login-form" onSubmit={handleDoctorLogin} className="space-y-4 animate-fadeIn">
              <div className="border-b border-slate-800 pb-2">
                <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  <Stethoscope className="w-4 h-4 text-cyan-400" />
                  <span>Doctor Login / चिकित्सक लॉगिन</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Sign in with your Medical Registration ID (or registered Phone) and password.
                </p>
              </div>

              {/* Medical ID or Phone Field */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-300">Medical Registration ID or Phone Number</label>
                <div className="relative">
                  <input
                    id="doctor-login-id"
                    type="text"
                    required
                    value={doctorLoginId}
                    onChange={(e) => setDoctorLoginId(e.target.value)}
                    placeholder="e.g. MCI-UP-2018-84920 or 9988776655"
                    className="w-full pl-9 pr-3 py-2.5 text-xs sm:text-sm bg-slate-950 border border-slate-700 rounded-xl font-mono text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                  <BadgeCheck className="w-4 h-4 text-cyan-400 absolute left-3 top-3" />
                </div>
              </div>

              {/* Password Field */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-300">Password / पासवर्ड</label>
                  <span className="text-[11px] text-slate-400">Demo default: <code className="text-cyan-300">password123</code></span>
                </div>
                <div className="relative">
                  <input
                    id="doctor-login-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={doctorLoginPassword}
                    onChange={(e) => setDoctorLoginPassword(e.target.value)}
                    placeholder="Enter doctor password"
                    className="w-full pl-10 pr-10 py-2.5 text-sm bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3 text-slate-400 hover:text-slate-200 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Submit Button */}
              <button
                id="doctor-login-submit-btn"
                type="submit"
                disabled={loading}
                className="w-full py-3.5 px-4 bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs sm:text-sm rounded-xl shadow-lg flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-[0.99] disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Verifying Doctor Credentials...</span>
                  </>
                ) : (
                  <>
                    <LogIn className="w-4 h-4" />
                    <span>Doctor Login / चिकित्सक लॉगिन</span>
                  </>
                )}
              </button>
            </form>
          )}

          {/* ========================================================= */}
          {/* 4. DOCTOR: REGISTER VIEW */}
          {/* ========================================================= */}
          {selectedRole === 'doctor' && authMode === 'register' && (
            <form id="doctor-register-form" onSubmit={handleDoctorRegister} className="space-y-4 animate-fadeIn">
              <div className="border-b border-slate-800 pb-2">
                <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-cyan-400" />
                  <span>Doctor Registration / चिकित्सक पंजीकरण</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Register with your Medical Council credentials, clinic locality, and specialty.
                </p>
              </div>

              {/* Full Name */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-300">Doctor Full Name / चिकित्सक का पूरा नाम *</label>
                <div className="relative">
                  <input
                    id="doctor-reg-name"
                    type="text"
                    required
                    value={doctorRegName}
                    onChange={(e) => setDoctorRegName(e.target.value)}
                    placeholder="e.g. Dr. Priya Sharma"
                    className="w-full pl-9 pr-3 py-2.5 text-xs sm:text-sm bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                  <User className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                </div>
              </div>

              {/* Medical ID & Contact Number */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-300">Medical Registration ID (NMC/State) *</label>
                  <div className="relative">
                    <input
                      id="doctor-reg-medical-id"
                      type="text"
                      required
                      value={doctorRegMedicalId}
                      onChange={(e) => setDoctorRegMedicalId(e.target.value)}
                      placeholder="e.g. NMC-2023-78491"
                      className="w-full pl-9 pr-3 py-2.5 text-xs sm:text-sm bg-slate-950 border border-slate-700 rounded-xl font-mono text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                    <BadgeCheck className="w-4 h-4 text-cyan-400 absolute left-3 top-3" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-300">Contact Number (10 Digits) *</label>
                  <div className="relative">
                    <span className="absolute left-3 top-3 text-xs font-semibold text-slate-400">+91</span>
                    <input
                      id="doctor-reg-phone"
                      type="tel"
                      required
                      value={doctorRegPhone}
                      onChange={(e) => setDoctorRegPhone(e.target.value)}
                      placeholder="98765 11111"
                      className="w-full pl-11 pr-3 py-2.5 text-xs sm:text-sm bg-slate-950 border border-slate-700 rounded-xl font-mono text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>
                </div>
              </div>

              {/* Specialization Selection */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-300">Medical Specialization / विशेषज्ञता *</label>
                <select
                  id="doctor-reg-specialty"
                  value={doctorRegSpecialization}
                  onChange={(e) => setDoctorRegSpecialization(e.target.value)}
                  className="w-full px-3 py-2.5 text-xs sm:text-sm bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                >
                  <option value="General Medicine & Tele-Emergency MO">General Medicine & Tele-Emergency MO</option>
                  <option value="Pediatrics & Child Health">Pediatrics & Child Health (बाल रोग)</option>
                  <option value="Pulmonology & Respiratory Medicine">Pulmonology & Respiratory Medicine (दमा/फेफड़े)</option>
                  <option value="Gynecology & Maternal Health">Gynecology & Maternal Health (स्त्री रोग)</option>
                  <option value="Orthopedics & Joint Specialist">Orthopedics & Joint Specialist (हड्डी रोग)</option>
                  <option value="Gastroenterology & Abdominal Health">Gastroenterology & Abdominal Health (पेट रोग)</option>
                  <option value="Emergency Medicine & Trauma Specialist">Emergency Medicine & Trauma Specialist</option>
                </select>
                <p className="text-[11px] text-slate-400">
                  Used by the AI triage engine to intelligently match and route incoming rural patients.
                </p>
              </div>

              {/* Location / PHC Clinic Name */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-300">Clinic / Hospital Location *</label>
                <div className="relative">
                  <input
                    id="doctor-reg-location"
                    type="text"
                    required
                    value={doctorRegLocation}
                    onChange={(e) => setDoctorRegLocation(e.target.value)}
                    placeholder="e.g. Rampur Primary Health Centre (PHC)"
                    className="w-full pl-9 pr-3 py-2.5 text-xs sm:text-sm bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                  <Building2 className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-300">Create Secure Password *</label>
                <div className="relative">
                  <input
                    id="doctor-reg-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={doctorRegPassword}
                    onChange={(e) => setDoctorRegPassword(e.target.value)}
                    placeholder="At least 4 characters"
                    className="w-full pl-10 pr-10 py-2.5 text-xs sm:text-sm bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3 text-slate-400 hover:text-slate-200 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Submit Registration */}
              <button
                id="doctor-register-submit-btn"
                type="submit"
                disabled={loading}
                className="w-full py-3.5 px-4 bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs sm:text-sm rounded-xl shadow-lg flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-[0.99] disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Registering Doctor in Database...</span>
                  </>
                ) : (
                  <>
                    <UserPlus className="w-4 h-4" />
                    <span>Register Doctor Profile / डॉक्टर पंजीकरण करें</span>
                  </>
                )}
              </button>
            </form>
          )}

          {/* ========================================================= */}
          {/* Quick Demo 1-Click Access Box */}
          {/* ========================================================= */}
          <div className="bg-slate-950/90 border border-slate-800 rounded-2xl p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                Pre-Seeded Demo Accounts (Instant Test)
              </span>
              <span className="text-[10px] text-slate-400 font-mono">SQLite Seeded</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleQuickDemoLogin('patient', '9812345678', 'password123')}
                className="bg-slate-900 hover:bg-emerald-950/60 border border-slate-800 hover:border-emerald-600/50 p-2.5 rounded-xl text-left text-xs transition-all cursor-pointer group"
              >
                <div className="font-bold text-emerald-300 flex items-center justify-between">
                  <span>Sita Devi (Patient)</span>
                  <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-emerald-400" />
                </div>
                <div className="text-[11px] text-slate-400 font-mono">+91 98123 45678 • pass: password123</div>
              </button>

              <button
                type="button"
                onClick={() => handleQuickDemoLogin('doctor', 'MCI-UP-2018-84920', 'password123')}
                className="bg-slate-900 hover:bg-cyan-950/60 border border-slate-800 hover:border-cyan-600/50 p-2.5 rounded-xl text-left text-xs transition-all cursor-pointer group"
              >
                <div className="font-bold text-cyan-300 flex items-center justify-between">
                  <span>Dr. Suresh Verma (Doctor)</span>
                  <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-cyan-400" />
                </div>
                <div className="text-[11px] text-slate-400 font-mono">MCI-UP-2018-84920 • pass: password123</div>
              </button>
            </div>
          </div>

          {/* Security & Database Status Footer */}
          <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              Scrypt Hashed Passwords & Session Storage
            </span>
            <span className="text-slate-400 font-mono text-[10px]">
              mediq.db (ACID Ready)
            </span>
          </div>

        </div>

      </div>
    </div>
  );
};

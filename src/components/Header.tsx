import React, { useState } from 'react';
import { AppLanguage, UserRoleMode, AppUser } from '../types';
import { UI_TRANSLATIONS } from '../data/mockData';
import { 
  Stethoscope, 
  Users, 
  Video, 
  UserCheck, 
  Activity, 
  AlertTriangle, 
  Globe, 
  Wifi, 
  WifiOff,
  PhoneCall,
  CheckCircle2,
  User,
  LogOut,
  Sparkles,
  LogIn
} from 'lucide-react';

interface HeaderProps {
  currentRole: UserRoleMode;
  onRoleChange: (role: UserRoleMode) => void;
  language: AppLanguage;
  onLanguageChange: (lang: AppLanguage) => void;
  isOnline: boolean;
  onToggleOnline?: () => void;
  activeEmergencyCount: number;
  onTriggerEmergency: () => void;
  currentUser?: AppUser | null;
  onLogout?: () => void;
  onSwitchRole?: (role: 'patient' | 'doctor') => void;
  showLandingAuth?: boolean;
  onGoToLogin?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentRole,
  onRoleChange,
  language,
  onLanguageChange,
  isOnline,
  onToggleOnline,
  activeEmergencyCount,
  onTriggerEmergency,
  currentUser,
  onLogout,
  onSwitchRole,
  showLandingAuth,
  onGoToLogin
}) => {
  const [showEmergencyModal, setShowEmergencyModal] = useState(false);
  const [emergencyDispatched, setEmergencyDispatched] = useState(false);

  const t = UI_TRANSLATIONS[language] || UI_TRANSLATIONS.en;

  const handleConfirmEmergency = () => {
    onTriggerEmergency();
    setEmergencyDispatched(true);
    setTimeout(() => {
      setShowEmergencyModal(false);
      setEmergencyDispatched(false);
    }, 3000);
  };

  return (
    <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-40 shadow-md">
      {/* Top Banner for Emergency Alert */}
      <div className="bg-gradient-to-r from-red-700 via-rose-700 to-red-800 text-white text-xs py-1.5 px-4 flex flex-wrap items-center justify-between font-medium">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 animate-pulse text-amber-300" />
          <span>{t.emergencyBanner}</span>
        </div>
        <button
          onClick={() => setShowEmergencyModal(true)}
          className="bg-white text-red-700 hover:bg-red-50 px-2.5 py-0.5 rounded font-bold transition-all flex items-center gap-1 shadow-sm text-xs cursor-pointer"
        >
          <PhoneCall className="w-3.5 h-3.5" />
          {t.emergencyBtn}
        </button>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          
          {/* Logo & Clinic Branding */}
          <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-start">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-teal-600 flex items-center justify-center text-white shadow-lg shadow-teal-900/40 font-bold">
                <Stethoscope className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-bold tracking-tight text-slate-100">{t.appTitle}</h1>
                </div>
                <p className="text-xs text-slate-400">{t.appSubtitle}</p>
              </div>
            </div>

            {/* Online / Offline Pill */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onToggleOnline}
                title="Click to simulate 2G Offline / Online Mode"
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border cursor-pointer transition-all ${
                  isOnline 
                    ? 'bg-emerald-950/80 text-emerald-400 border-emerald-800/80 hover:bg-emerald-900/60' 
                    : 'bg-amber-950/90 text-amber-300 border-amber-600/80 hover:bg-amber-900/60'
                }`}
              >
                {isOnline ? <Wifi className="w-3.5 h-3.5 text-emerald-400" /> : <WifiOff className="w-3.5 h-3.5 text-amber-400" />}
                <span className="hidden sm:inline">{isOnline ? t.offlineStatus : t.offlineLocal}</span>
              </button>
            </div>
          </div>

          {/* Navigation Controls, User Profile Badge & Role Switcher */}
          <div className="flex items-center flex-wrap gap-2 w-full md:w-auto justify-center md:justify-end">
            
            {/* User Profile / Active Role Pill */}
            {currentUser ? (
              <div className="flex items-center gap-2.5 bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs">
                <div className={`w-2.5 h-2.5 rounded-full ${currentUser.role === 'doctor' ? 'bg-indigo-400' : 'bg-teal-400'}`} />
                <div className="text-left leading-tight">
                  <span className="font-bold text-slate-100 block text-xs">{currentUser.name}</span>
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${currentUser.role === 'doctor' ? 'text-indigo-300' : 'text-teal-300'}`}>
                    {currentUser.role === 'doctor' ? 'Doctor Portal' : 'Patient Portal'}
                  </span>
                </div>
                {onLogout && (
                  <button
                    type="button"
                    onClick={onLogout}
                    title="Logout / Sign Out"
                    className="ml-1 text-slate-400 hover:text-rose-300 bg-slate-900/60 hover:bg-rose-950/60 border border-slate-700 hover:border-rose-700/60 px-2 py-1 rounded-lg text-[11px] font-bold cursor-pointer transition-all flex items-center gap-1"
                  >
                    <LogOut className="w-3 h-3 text-rose-400" />
                    <span className="hidden sm:inline">Logout</span>
                  </button>
                )}
              </div>
            ) : null}

            {/* Language Selector */}
            <div className="flex items-center bg-slate-800 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs">
              <Globe className="w-3.5 h-3.5 text-slate-400 mr-1.5" />
              <select
                value={language}
                onChange={(e) => onLanguageChange(e.target.value as AppLanguage)}
                className="bg-transparent text-slate-200 focus:outline-none cursor-pointer"
              >
                <option value="en" className="bg-slate-900">English</option>
                <option value="hi" className="bg-slate-900">हिन्दी (Hindi)</option>
                <option value="ta" className="bg-slate-900">தமிழ் (Tamil)</option>
                <option value="te" className="bg-slate-900">తెలుగు (Telugu)</option>
                <option value="mr" className="bg-slate-900">मराठी (Marathi)</option>
                <option value="bn" className="bg-slate-900">বাংলা (Bengali)</option>
              </select>
            </div>

            {/* Navigation Tabs - Strictly Isolated by Active Role */}
            <nav className="flex items-center bg-slate-800/90 p-1 rounded-xl border border-slate-700 overflow-x-auto text-xs">
              
              {/* Show Login Tab when on login page or unauthenticated */}
              {(!currentUser || showLandingAuth) && (
                <button
                  onClick={() => {
                    if (onGoToLogin) onGoToLogin();
                    else onRoleChange('patient');
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer whitespace-nowrap ${
                    showLandingAuth
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
                  }`}
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Login</span>
                </button>
              )}

              {/* Show Patient Tab ONLY when logged in as Patient and not on login page */}
              {currentUser?.role === 'patient' && !showLandingAuth && (
                <button
                  onClick={() => onRoleChange('patient')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer whitespace-nowrap ${
                    currentRole === 'patient'
                      ? 'bg-teal-600 text-white shadow-sm'
                      : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
                  }`}
                >
                  <User className="w-3.5 h-3.5" />
                  <span>Patient Portal</span>
                </button>
              )}

              {/* Show Doctor Tab ONLY when logged in as Doctor and not on login page */}
              {currentUser?.role === 'doctor' && !showLandingAuth && (
                <button
                  onClick={() => onRoleChange('doctor')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer whitespace-nowrap ${
                    currentRole === 'doctor'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
                  }`}
                >
                  <Stethoscope className="w-3.5 h-3.5" />
                  <span>Doctor Portal</span>
                </button>
              )}

              {/* Show Queue Board ONLY when logged in and not on login page */}
              {currentUser && !showLandingAuth && (
                <button
                  onClick={() => onRoleChange('queue')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer whitespace-nowrap relative ${
                    currentRole === 'queue'
                      ? 'bg-teal-600 text-white shadow-sm'
                      : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Queue Board</span>
                  {activeEmergencyCount > 0 && (
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-ping absolute top-1 right-1" />
                  )}
                </button>
              )}
            </nav>

          </div>
        </div>
      </div>

      {/* Emergency Modal */}
      {showEmergencyModal && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border-2 border-red-600 rounded-2xl max-w-md w-full p-6 text-slate-100 shadow-2xl">
            <div className="w-12 h-12 bg-red-950 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-700">
              <AlertTriangle className="w-7 h-7 animate-bounce" />
            </div>
            
            {!emergencyDispatched ? (
              <>
                <h3 className="text-xl font-bold text-center text-red-400 mb-2">
                  Emergency 108 Ambulance Dispatch
                </h3>
                <p className="text-sm text-slate-300 text-center mb-6 leading-relaxed">
                  Are you triggering an immediate Red-Flag Emergency for severe trauma, cardiac arrest, respiratory failure, or unconsciousness at Rampur PHC?
                </p>

                <div className="bg-red-950/50 border border-red-800/80 rounded-xl p-3 text-xs text-red-200 mb-6 space-y-1">
                  <p className="font-semibold">Automated Emergency Pipeline Actions:</p>
                  <p>• Immediate queue bypass token (EMG-001) generated.</p>
                  <p>• Dispatch signal broadcasted to District 108 Ambulance Unit.</p>
                  <p>• Phone alert pushed to Duty Medical Officer on call.</p>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setShowEmergencyModal(false)}
                    className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmEmergency}
                    className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-red-900/50 transition-all cursor-pointer flex items-center justify-center gap-2"
                  >
                    <PhoneCall className="w-4 h-4" />
                    CONFIRM 108 ALERT
                  </button>
                </div>
              </>
            ) : (
              <div className="text-center py-4 space-y-3">
                <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto animate-pulse" />
                <h3 className="text-lg font-bold text-emerald-400">108 Ambulance Dispatched!</h3>
                <p className="text-xs text-slate-300">
                  ETA: 12 minutes to Rampur Primary Health Centre. Medical Officer notified.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
};

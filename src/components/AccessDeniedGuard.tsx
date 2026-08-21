import React from 'react';
import { ShieldAlert, LogOut, ArrowLeft, Lock } from 'lucide-react';
import { AppUser, UserRoleMode } from '../types';

interface AccessDeniedGuardProps {
  currentUser: AppUser | null;
  attemptedRole: UserRoleMode;
  onReturnToAllowedPortal: () => void;
  onLogout: () => void;
}

export const AccessDeniedGuard: React.FC<AccessDeniedGuardProps> = ({
  currentUser,
  attemptedRole,
  onReturnToAllowedPortal,
  onLogout
}) => {
  const isAttemptingDoctor = attemptedRole === 'doctor';

  return (
    <div className="max-w-xl mx-auto py-12 px-4 animate-fadeIn font-sans">
      <div className="bg-slate-900 border-2 border-rose-600/60 rounded-3xl p-8 text-center space-y-6 shadow-2xl">
        <div className="w-16 h-16 bg-rose-950/80 border border-rose-500/50 rounded-2xl flex items-center justify-center mx-auto text-rose-400 shadow-inner">
          <ShieldAlert className="w-8 h-8 animate-pulse" />
        </div>

        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-950/60 border border-rose-500/40 text-rose-300 text-xs font-bold font-mono">
            <Lock className="w-3.5 h-3.5" />
            <span>ROLE ACCESS RESTRICTION</span>
          </div>

          <h2 className="text-xl sm:text-2xl font-black text-white">
            {isAttemptingDoctor ? 'Doctor Portal Restricted' : 'Patient Self-Intake Restricted'}
          </h2>

          <p className="text-xs sm:text-sm text-slate-300 max-w-md mx-auto leading-relaxed">
            {isAttemptingDoctor ? (
              <>
                You are currently signed in as a <span className="font-bold text-teal-400">Patient ({currentUser?.name || 'Registered Patient'})</span>. The Doctor Consultation Portal is restricted to verified Primary Health Centre (PHC) Medical Officers.
              </>
            ) : (
              <>
                You are currently signed in as a <span className="font-bold text-indigo-400">Medical Officer ({currentUser?.name || 'Doctor'})</span>. To conduct patient self-intakes or access a patient profile, please switch to a patient account.
              </>
            )}
          </p>
        </div>

        <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 text-xs text-slate-400 text-left space-y-1.5">
          <div className="font-bold text-slate-200 flex items-center gap-1.5">
            <span>Current Active Session:</span>
          </div>
          <p>• Account Name: <strong className="text-slate-200">{currentUser?.name || 'Unknown'}</strong></p>
          <p>• Assigned Role: <strong className="text-slate-200 capitalize">{currentUser?.role || 'Guest'}</strong></p>
          <p>• Portal Boundary: <strong className="text-emerald-400">Isolated & Strictly Separated</strong></p>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={onReturnToAllowedPortal}
            className="w-full sm:w-auto bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs px-5 py-3 rounded-xl flex items-center justify-center gap-2 shadow-md cursor-pointer transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return to {currentUser?.role === 'doctor' ? 'Doctor Portal' : 'Patient Dashboard'}</span>
          </button>

          <button
            type="button"
            onClick={onLogout}
            className="w-full sm:w-auto bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs px-5 py-3 rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-colors"
          >
            <LogOut className="w-4 h-4 text-rose-400" />
            <span>Sign Out & Switch Role</span>
          </button>
        </div>
      </div>
    </div>
  );
};

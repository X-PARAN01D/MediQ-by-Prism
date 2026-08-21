import React, { useEffect } from 'react';
import { Video, PhoneOff, Stethoscope, ShieldCheck, Activity } from 'lucide-react';
import { TeleconsultSession } from '../services/teleconsultService';

interface IncomingCallNotificationModalProps {
  session: TeleconsultSession;
  onAccept: () => void;
  onDecline: () => void;
}

export const IncomingCallNotificationModal: React.FC<IncomingCallNotificationModalProps> = ({
  session,
  onAccept,
  onDecline
}) => {

  // Play gentle web audio chime on ring
  useEffect(() => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const playChime = () => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
        osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.3); // A5
        gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.6);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.6);
      };

      playChime();
      const chimeInterval = setInterval(playChime, 2500);
      return () => {
        clearInterval(chimeInterval);
        audioCtx.close();
      };
    } catch (e) {
      // Audio autoplay policy fallback
    }
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      <div className="bg-slate-900 border-2 border-teal-500/80 rounded-3xl p-6 sm:p-8 max-w-md w-full text-white shadow-2xl text-center space-y-6 relative overflow-hidden ring-4 ring-teal-500/20">
        
        {/* Glowing Animated Pulse Waves */}
        <div className="absolute -top-12 -right-12 w-36 h-36 bg-teal-500/20 rounded-full blur-2xl animate-pulse"></div>
        <div className="absolute -bottom-12 -left-12 w-36 h-36 bg-indigo-500/20 rounded-full blur-2xl animate-pulse"></div>

        {/* Doctor Icon Ring */}
        <div className="relative mx-auto w-24 h-24">
          <div className="absolute inset-0 rounded-full bg-teal-500/30 animate-ping"></div>
          <div className="relative w-24 h-24 rounded-full bg-gradient-to-tr from-teal-700 to-indigo-700 border-4 border-white/20 flex items-center justify-center text-4xl shadow-xl">
            👨‍⚕️
          </div>
        </div>

        {/* Title & Calling Details */}
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-1.5 bg-teal-500/20 border border-teal-400/40 text-teal-300 text-xs px-3 py-1 rounded-full font-bold uppercase tracking-wider">
            <Activity className="w-3.5 h-3.5 animate-spin" />
            <span>Incoming Doctor Consultation</span>
          </div>

          <h3 className="text-2xl font-black tracking-tight text-white pt-2">
            {session.doctorName}
          </h3>

          <p className="text-xs text-teal-300 font-medium">
            {session.doctorSpecialty || 'Medical Officer (In-Charge)'} • {session.doctorHospital || 'Rampur Primary Health Centre'}
          </p>

          <div className="pt-2">
            <span className="inline-block bg-slate-800 border border-slate-700 text-slate-300 px-3 py-1 rounded-xl text-xs font-mono">
              Queue Token: <strong className="text-teal-300 font-bold">{session.tokenId}</strong>
            </span>
          </div>
        </div>

        {/* Security & ABDM Notice */}
        <div className="bg-slate-800/80 rounded-2xl p-3 border border-slate-700/60 text-[11px] text-slate-300 flex items-center justify-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>Encrypted WebRTC P2P Video Call • Ayushman Bharat PHC Desk</span>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <button
            type="button"
            onClick={onDecline}
            className="w-full bg-slate-800 hover:bg-slate-700 text-rose-300 hover:text-white border border-slate-700 py-3.5 px-4 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-all"
          >
            <PhoneOff className="w-4 h-4 text-rose-400" />
            <span>Decline</span>
          </button>

          <button
            type="button"
            onClick={onAccept}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-3.5 px-4 rounded-2xl text-xs font-black flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-emerald-600/40 transition-all scale-105 hover:scale-108 animate-pulse"
          >
            <Video className="w-4 h-4" />
            <span>Accept Call</span>
          </button>
        </div>

      </div>
    </div>
  );
};

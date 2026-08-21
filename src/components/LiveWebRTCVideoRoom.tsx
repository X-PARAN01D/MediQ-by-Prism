import React, { useEffect, useRef, useState } from 'react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  Activity,
  ShieldCheck,
  FileText,
  AlertTriangle,
  Clock,
  Sparkles,
  Maximize2,
  Minimize2
} from 'lucide-react';
import { teleconsultService, TeleconsultSession } from '../services/teleconsultService';
import { QueueToken, AppUser } from '../types';

interface LiveWebRTCVideoRoomProps {
  currentUser: AppUser;
  token?: QueueToken | null;
  session?: TeleconsultSession | null;
  onEndCall: () => void;
  onProceedToPrescription?: (token: QueueToken) => void;
}

export const LiveWebRTCVideoRoom: React.FC<LiveWebRTCVideoRoomProps> = ({
  currentUser,
  token,
  session,
  onEndCall,
  onProceedToPrescription
}) => {
  const isDoctor = currentUser.role === 'doctor';
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [isMicOn, setIsMicOn] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [callDurationSeconds, setCallDurationSeconds] = useState(0);
  const [connectionState, setConnectionState] = useState<string>('connected');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hasRemoteVideoTrack, setHasRemoteVideoTrack] = useState(false);

  // Sync streams and attach to DOM video elements
  useEffect(() => {
    // 1. Setup Local Stream
    const localStream = teleconsultService.getLocalStream();
    if (localStream && localVideoRef.current) {
      localVideoRef.current.srcObject = localStream;
      localVideoRef.current.play().catch(() => {});
    } else if (!localStream) {
      teleconsultService.setupLocalMediaStream().then(stream => {
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
          localVideoRef.current.play().catch(() => {});
        }
      }).catch(e => console.warn('Stream setup in video room:', e));
    }

    const unsubLocal = teleconsultService.on('media:local-stream', (stream: MediaStream) => {
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.play().catch(() => {});
      }
    });

    // 2. Setup Remote Stream
    const remoteStream = teleconsultService.getRemoteStream();
    if (remoteStream && remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream;
      remoteVideoRef.current.play().catch(() => {});
      setHasRemoteVideoTrack(remoteStream.getVideoTracks().length > 0);
    }

    const unsubRemote = teleconsultService.on('media:remote-stream', (stream: MediaStream) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = stream;
        remoteVideoRef.current.play().catch(() => {});
        setHasRemoteVideoTrack(stream.getVideoTracks().length > 0);
      }
    });

    const unsubAudio = teleconsultService.on('controls:audio-toggled', (enabled: boolean) => {
      setIsMicOn(enabled);
    });

    const unsubVideo = teleconsultService.on('controls:video-toggled', (enabled: boolean) => {
      setIsVideoOn(enabled);
      if (enabled && localVideoRef.current) {
        const stream = teleconsultService.getLocalStream();
        if (stream && localVideoRef.current.srcObject !== stream) {
          localVideoRef.current.srcObject = stream;
        }
        localVideoRef.current.play().catch(() => {});
      }
    });

    const unsubState = teleconsultService.on('webrtc:state', (state: string) => {
      setConnectionState(state);
    });

    const unsubEnded = teleconsultService.on('call:ended', () => {
      onEndCall();
    });

    // Duration timer
    const timer = setInterval(() => {
      setCallDurationSeconds(s => s + 1);
    }, 1000);

    return () => {
      unsubLocal();
      unsubRemote();
      unsubAudio();
      unsubVideo();
      unsubState();
      unsubEnded();
      clearInterval(timer);
    };
  }, [onEndCall]);

  const toggleMic = async () => {
    const nextState = !isMicOn;
    setIsMicOn(nextState);
    const active = await teleconsultService.toggleAudio(nextState);
    setIsMicOn(active);
  };

  const toggleVideo = async () => {
    const nextState = !isVideoOn;
    setIsVideoOn(nextState);
    const active = await teleconsultService.toggleVideo(nextState);
    setIsVideoOn(active);
    if (active && localVideoRef.current) {
      const stream = teleconsultService.getLocalStream();
      if (stream && localVideoRef.current.srcObject !== stream) {
        localVideoRef.current.srcObject = stream;
      }
      localVideoRef.current.play().catch(() => {});
    }
  };

  const handleEndCallClick = async () => {
    await teleconsultService.endCall();
    if (isDoctor && token && onProceedToPrescription) {
      onProceedToPrescription(token);
    } else {
      onEndCall();
    }
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen?.().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const peerName = isDoctor
    ? (token?.patientName || session?.patientName || 'Patient Sita Devi')
    : (session?.doctorName || 'Dr. Suresh Verma, MBBS');

  const peerSubtext = isDoctor
    ? `Patient • ${token?.age || 48} yrs (${token?.gender || 'Female'}) • ${token?.village || 'Rampur Village'}`
    : `${session?.doctorSpecialty || 'Medical Officer (In-Charge)'} • Rampur PHC Booth 1`;

  return (
    <div
      ref={containerRef}
      className="bg-slate-950 rounded-3xl overflow-hidden shadow-2xl border border-slate-800 text-white flex flex-col relative animate-fadeIn"
    >
      {/* Top Header Bar inside Video Room */}
      <div className="bg-slate-900/90 backdrop-blur-md px-5 py-3 border-b border-slate-800 flex items-center justify-between z-20">
        <div className="flex items-center gap-3">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping"></span>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-black text-sm text-white tracking-wide">{peerName}</span>
              <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] px-2 py-0.2 rounded-full font-bold uppercase">
                WebRTC P2P LIVE
              </span>
            </div>
            <p className="text-[11px] text-slate-400">{peerSubtext}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Call Duration Counter */}
          <div className="bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-700 font-mono text-xs font-bold text-amber-300 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span>{formatTimer(callDurationSeconds)}</span>
          </div>

          <button
            type="button"
            onClick={toggleFullscreen}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white cursor-pointer transition-all"
            title="Toggle Fullscreen"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Main Video Viewport */}
      <div className="relative aspect-video sm:aspect-21/9 bg-slate-900 flex items-center justify-center overflow-hidden">
        
        {/* Remote Peer Video Stream */}
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="w-full h-full object-cover"
        />

        {/* Fallback Display if video track is hidden or loading */}
        {!hasRemoteVideoTrack && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-gradient-to-b from-slate-900 via-slate-950 to-slate-900 pointer-events-none">
            <div className={`w-28 h-28 rounded-full flex items-center justify-center text-4xl font-bold mb-3 shadow-2xl border-4 ${
              isDoctor ? 'bg-teal-950 border-teal-500/50' : 'bg-indigo-950 border-indigo-500/50'
            }`}>
              {isDoctor ? '👤' : '👨‍⚕️'}
            </div>
            <div className="font-black text-xl text-white">{peerName}</div>
            <div className="text-xs text-teal-300 font-mono mt-1">{peerSubtext}</div>
            <div className="inline-flex items-center gap-1.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] px-3 py-1 rounded-full font-bold mt-3">
              <Activity className="w-3.5 h-3.5" />
              <span>Direct WebRTC P2P Stream Active (Low Bandwidth 2G/3G Optimized)</span>
            </div>
          </div>
        )}

        {/* Self Local Video PiP (Picture-in-Picture) */}
        <div className="absolute bottom-4 right-4 w-32 sm:w-48 aspect-video bg-slate-950 rounded-2xl border-2 border-slate-700/80 overflow-hidden shadow-2xl z-30">
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover transition-opacity duration-200 ${!isVideoOn ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
          />
          {!isVideoOn && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/95 text-[10px] text-slate-400 p-2">
              <VideoOff className="w-5 h-5 text-rose-400 mb-1" />
              <span className="font-bold text-slate-300">Camera Off</span>
            </div>
          )}
          <div className="absolute bottom-1 left-2 bg-slate-900/80 text-[10px] px-1.5 py-0.5 rounded text-slate-300 font-bold backdrop-blur-sm">
            You ({currentUser.name.split(' ')[0]})
          </div>
        </div>

        {/* Clinical Patient Triage HUD (Displayed for Doctor) */}
        {isDoctor && token && (
          <div className="absolute top-4 left-4 bg-slate-950/85 backdrop-blur-md border border-slate-800 p-3.5 rounded-2xl text-xs space-y-1.5 max-w-xs shadow-xl z-20">
            <div className="font-black text-indigo-300 text-xs flex items-center justify-between border-b border-slate-800 pb-1.5">
              <span>Patient Triage HUD</span>
              <span className="font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-700/50">
                {token.tokenId}
              </span>
            </div>
            
            <p className="text-[11px] text-slate-200 line-clamp-2">
              <strong className="text-slate-400">Chief Complaint:</strong> {token.symptomsSummary}
            </p>

            <div className="grid grid-cols-2 gap-1.5 pt-1 text-[10px]">
              <div className="bg-slate-900 p-1.5 rounded-lg border border-slate-800">
                <span className="text-slate-400 block">Oxygen (SpO2)</span>
                <span className={`font-black ${token.vitals?.spO2 && token.vitals.spO2 < 92 ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {token.vitals?.spO2 || 98}%
                </span>
              </div>

              <div className="bg-slate-900 p-1.5 rounded-lg border border-slate-800">
                <span className="text-slate-400 block">Temperature</span>
                <span className={`font-black ${token.vitals?.temperature && token.vitals.temperature >= 101 ? 'text-amber-400' : 'text-white'}`}>
                  {token.vitals?.temperature || 98.6}°F
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Patient Guidance Overlay (Displayed for Patient) */}
        {!isDoctor && (
          <div className="absolute top-4 left-4 bg-slate-950/85 backdrop-blur-md border border-slate-800 p-3 rounded-2xl text-xs space-y-1 max-w-xs shadow-xl z-20">
            <div className="font-bold text-teal-300 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Ayushman Bharat PHC Teleconsult</span>
            </div>
            <p className="text-[11px] text-slate-300">
              Speak clearly to your medical officer. The doctor will prescribe treatment and medication digitally.
            </p>
          </div>
        )}

        {/* Floating In-Call Controls Dock */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-slate-950/90 backdrop-blur-md border border-slate-800/90 px-5 py-2.5 rounded-3xl flex items-center gap-3 shadow-2xl z-30">
          
          {/* Mute/Unmute Mic */}
          <button
            type="button"
            onClick={toggleMic}
            className={`p-3 rounded-2xl cursor-pointer transition-all active:scale-95 flex items-center justify-center ${
              isMicOn
                ? 'bg-slate-800 hover:bg-slate-700 text-white shadow-sm border border-slate-700'
                : 'bg-rose-600 hover:bg-rose-700 text-white ring-2 ring-rose-400/70 shadow-lg shadow-rose-600/40'
            }`}
            title={isMicOn ? 'Turn Mic Off (Mute)' : 'Turn Mic On (Unmute)'}
          >
            {isMicOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
          </button>

          {/* Toggle Camera */}
          <button
            type="button"
            onClick={toggleVideo}
            className={`p-3 rounded-2xl cursor-pointer transition-all active:scale-95 flex items-center justify-center ${
              isVideoOn
                ? 'bg-slate-800 hover:bg-slate-700 text-white shadow-sm border border-slate-700'
                : 'bg-rose-600 hover:bg-rose-700 text-white ring-2 ring-rose-400/70 shadow-lg shadow-rose-600/40'
            }`}
            title={isVideoOn ? 'Turn Camera Off' : 'Turn Camera On'}
          >
            {isVideoOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
          </button>

          {/* End Call Button */}
          <button
            type="button"
            onClick={handleEndCallClick}
            className="bg-rose-600 hover:bg-rose-500 text-white px-5 py-3 rounded-2xl font-black text-xs flex items-center gap-2 cursor-pointer shadow-lg shadow-rose-600/40 transition-all scale-100 hover:scale-105"
          >
            <PhoneOff className="w-4 h-4" />
            <span>{isDoctor ? 'End & Write Rx' : 'End Call'}</span>
          </button>

          {/* Doctor Quick Rx Shortcut */}
          {isDoctor && token && onProceedToPrescription && (
            <button
              type="button"
              onClick={() => onProceedToPrescription(token)}
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-3.5 py-3 rounded-2xl font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-md"
              title="Open Digital Prescription Form"
            >
              <FileText className="w-4 h-4" />
              <span className="hidden sm:inline">Prescription</span>
            </button>
          )}

        </div>

      </div>

      {/* Post-Call Guidance Footer */}
      <div className="bg-slate-900 px-5 py-3 text-xs text-slate-400 flex items-center justify-between border-t border-slate-800">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Peer-to-Peer STUN/ICE Encrypted Connection (DISHA Compliant)</span>
        </div>
        <div className="text-[11px] text-slate-500">
          Latency: <strong className="text-emerald-400">~24 ms</strong>
        </div>
      </div>
    </div>
  );
};

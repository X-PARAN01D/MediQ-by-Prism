import React, { useState } from 'react';
import { 
  Phone, 
  MessageSquare, 
  Radio, 
  X, 
  Volume2, 
  Play, 
  Square, 
  Check, 
  Smartphone,
  Send,
  HelpCircle
} from 'lucide-react';
import { QueueToken } from '../types';

interface SmsUssdModalProps {
  isOpen: boolean;
  onClose: () => void;
  latestToken?: QueueToken | null;
}

export const SmsUssdModal: React.FC<SmsUssdModalProps> = ({
  isOpen,
  onClose,
  latestToken
}) => {
  const [activeChannel, setActiveChannel] = useState<'sms' | 'ussd' | 'ivr'>('sms');
  const [phoneNumber, setPhoneNumber] = useState('+91 98765 12345');
  const [ussdStep, setUssdStep] = useState<number>(0);
  const [ussdInput, setUssdInput] = useState<string>('');
  const [ussdOutput, setUssdOutput] = useState<string>(
    'Welcome to PHC Swasthya USSD Gateway (*140*84#)\n\n1. Check Token Status\n2. Register with Ration Card\n3. Emergency 108 Call\n\nEnter option (1-3):'
  );
  const [isIvrPlaying, setIsIvrPlaying] = useState(false);

  if (!isOpen) return null;

  const currentToken = latestToken || {
    tokenId: 'MOD-012',
    patientName: 'Ramesh Kumar',
    estimatedWaitMinutes: 8,
    assignedRoom: 'Teleconsult Booth 2',
    urgency: 'Moderate'
  };

  const handleUssdSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (ussdStep === 0) {
      if (ussdInput === '1') {
        setUssdOutput(
          `Token Status:\nToken: ${currentToken.tokenId}\nPatient: ${currentToken.patientName}\nWait Time: ~${currentToken.estimatedWaitMinutes} mins\nRoom: ${currentToken.assignedRoom}\n\n0. Back to Main Menu`
        );
        setUssdStep(1);
      } else if (ussdInput === '2') {
        setUssdOutput(
          `Enter your 10-digit Ration Card or Mobile Number to receive instant SMS token:`
        );
        setUssdStep(2);
      } else if (ussdInput === '3') {
        setUssdOutput(
          `🚨 108 Emergency Ambulance Dispatched to your registered village tower cell ID. Keep line open.`
        );
        setUssdStep(3);
      } else {
        setUssdOutput('Invalid option. Enter 1, 2, or 3:\n1. Check Token\n2. Register\n3. Emergency');
      }
      setUssdInput('');
    } else {
      // Reset
      setUssdOutput(
        'Welcome to PHC Swasthya USSD Gateway (*140*84#)\n\n1. Check Token Status\n2. Register with Ration Card\n3. Emergency 108 Call\n\nEnter option (1-3):'
      );
      setUssdStep(0);
      setUssdInput('');
    }
  };

  const playIvrAudio = () => {
    if (!('speechSynthesis' in window)) return;
    if (isIvrPlaying) {
      window.speechSynthesis.cancel();
      setIsIvrPlaying(false);
      return;
    }

    const ivrScript = `नमस्कार। प्राथमिक स्वास्थ्य केंद्र सेवा में आपका स्वागत है। श्री ${currentToken.patientName} जी, आपका टोकन नंबर ${currentToken.tokenId} है। डॉक्टर से परामर्श में लगभग ${currentToken.estimatedWaitMinutes} मिनट बाकी हैं। कृपया कमरा नंबर ${currentToken.assignedRoom} के बाहर प्रतीक्षा करें। आपातकाल के लिए एक दबायें। धन्यवाद।`;
    const utterance = new SpeechSynthesisUtterance(ivrScript);
    utterance.lang = 'hi-IN';
    utterance.rate = 0.9;

    utterance.onstart = () => setIsIvrPlaying(true);
    utterance.onend = () => setIsIvrPlaying(false);
    utterance.onerror = () => setIsIvrPlaying(false);

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-950 text-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-800 overflow-hidden flex flex-col">
        
        {/* Header */}
        <div className="p-5 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-600/30 border border-amber-500/50 flex items-center justify-center text-amber-400">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-100">SMS / USSD / IVR Fallback Gateway</h3>
              <p className="text-xs text-slate-400">2G Basic Feature Phone & Non-Smartphone Support</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 cursor-pointer">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Channels Switcher */}
        <div className="grid grid-cols-3 bg-slate-900/50 border-b border-slate-800 text-xs font-semibold">
          <button
            onClick={() => setActiveChannel('sms')}
            className={`py-3 px-2 flex items-center justify-center gap-2 border-b-2 cursor-pointer transition-all ${
              activeChannel === 'sms' ? 'border-amber-500 text-amber-400 bg-slate-900 font-bold' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span>1. SMS Alert</span>
          </button>
          <button
            onClick={() => setActiveChannel('ussd')}
            className={`py-3 px-2 flex items-center justify-center gap-2 border-b-2 cursor-pointer transition-all ${
              activeChannel === 'ussd' ? 'border-amber-500 text-amber-400 bg-slate-900 font-bold' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Radio className="w-4 h-4" />
            <span>2. USSD (*140*84#)</span>
          </button>
          <button
            onClick={() => setActiveChannel('ivr')}
            className={`py-3 px-2 flex items-center justify-center gap-2 border-b-2 cursor-pointer transition-all ${
              activeChannel === 'ivr' ? 'border-amber-500 text-amber-400 bg-slate-900 font-bold' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Phone className="w-4 h-4" />
            <span>3. Missed Call IVR</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          
          {/* TAB 1: SMS SIMULATION */}
          {activeChannel === 'sms' && (
            <div className="space-y-4">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between text-xs text-slate-400 border-b border-slate-800 pb-2">
                  <span>To: <strong className="text-slate-200">{phoneNumber}</strong></span>
                  <span className="text-emerald-400 flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" /> Delivered via BSNL/NIC SMS Gateway
                  </span>
                </div>

                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2 font-mono text-xs text-emerald-300">
                  <div className="text-slate-400 text-[10px]">Sender: VK-PHCSWASTHYA</div>
                  <p className="leading-relaxed">
                    [PHC Swasthya]: नमस्ते {currentToken.patientName} जी!
                    <br />
                    आपका टोकन संख्या: <strong>{currentToken.tokenId}</strong>
                    <br />
                    अनुमानित प्रतीक्षा: <strong>{currentToken.estimatedWaitMinutes} मिनट</strong>
                    <br />
                    कमरा: {currentToken.assignedRoom}
                    <br />
                    (आपातकाल में तुरंत 108 डायल करें)
                  </p>
                </div>
              </div>

              <p className="text-xs text-slate-400">
                Patients receive free multilingual SMS notification instantly when triaged or when their turn is 2 patients away.
              </p>
            </div>
          )}

          {/* TAB 2: USSD CODE SIMULATION */}
          {activeChannel === 'ussd' && (
            <div className="space-y-4">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between text-xs text-slate-400 border-b border-slate-800 pb-2">
                  <span>Dialed Code: <strong className="text-amber-400 font-mono">*140*84#</strong></span>
                  <span className="text-slate-400">Zero Internet Required</span>
                </div>

                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 font-mono text-xs text-amber-200 whitespace-pre-line leading-relaxed">
                  {ussdOutput}
                </div>

                <form onSubmit={handleUssdSubmit} className="flex gap-2">
                  <input
                    type="text"
                    value={ussdInput}
                    onChange={(e) => setUssdInput(e.target.value)}
                    placeholder="Enter choice (1, 2, or 3)..."
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono"
                    autoFocus
                  />
                  <button
                    type="submit"
                    className="bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1 cursor-pointer transition-all"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Send</span>
                  </button>
                </form>
              </div>

              <p className="text-xs text-slate-400">
                Any GSM feature phone in a 2G dead zone can dial *140*84# to fetch queue status, request an ASHA home visit, or book a PHC token without internet.
              </p>
            </div>
          )}

          {/* TAB 3: MISSED CALL IVR SERVICE */}
          {activeChannel === 'ivr' && (
            <div className="space-y-4">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 text-center">
                <div className="w-16 h-16 rounded-full bg-teal-900/60 border border-teal-500/50 flex items-center justify-center text-teal-300 mx-auto">
                  <Phone className="w-8 h-8 animate-bounce" />
                </div>

                <div>
                  <div className="text-xs text-slate-400">Toll-Free Missed Call Number:</div>
                  <div className="text-xl font-bold font-mono text-teal-300 tracking-wider">1800-889-MEDIQ (6334)</div>
                </div>

                <p className="text-xs text-slate-300 max-w-sm mx-auto">
                  Patients without balance give a missed call. An automated IVR robot calls back in 15 seconds and speaks out queue status in Hindi or regional language.
                </p>

                <button
                  type="button"
                  onClick={playIvrAudio}
                  className={`w-full py-3 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg ${
                    isIvrPlaying 
                      ? 'bg-rose-600 hover:bg-rose-700 text-white animate-pulse' 
                      : 'bg-teal-600 hover:bg-teal-500 text-white'
                  }`}
                >
                  {isIvrPlaying ? <Square className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                  <span>{isIvrPlaying ? 'ऑडियो कॉल रोकें (Hang Up IVR)' : 'कॉल बैक ऑडियो सुनें (Simulate IVR Call)'}</span>
                </button>
              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  );
};

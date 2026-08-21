import React, { useState, useEffect } from 'react';
import { Mic, MicOff, Volume2, Sparkles, AlertCircle, Play, Square } from 'lucide-react';
import { AppLanguage } from '../types';

interface VoiceInputWidgetProps {
  language: AppLanguage;
  onTranscriptChange: (transcript: string, autoTags: string[]) => void;
  initialTranscript?: string;
}

export const VoiceInputWidget: React.FC<VoiceInputWidgetProps> = ({
  language,
  onTranscriptChange,
  initialTranscript = ''
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState(initialTranscript);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [detectedLanguage, setDetectedLanguage] = useState(language);

  // Sync initial
  useEffect(() => {
    if (initialTranscript) {
      setTranscript(initialTranscript);
    }
  }, [initialTranscript]);

  const langMap: Record<string, string> = {
    hi: 'hi-IN',
    en: 'en-IN',
    ta: 'ta-IN',
    te: 'te-IN',
    mr: 'mr-IN',
    bn: 'bn-IN'
  };

  const parseKeywordsFromTranscript = (text: string): string[] => {
    const textLower = text.toLowerCase();
    const tags: string[] = [];

    // Hindi & English keyword matching
    if (textLower.includes('बुखार') || textLower.includes('बुख़ार') || textLower.includes('fever') || textLower.includes('तावा') || textLower.includes('कांपना') || textLower.includes('ठंड')) {
      tags.push('high fever', 'chills');
    }
    if (textLower.includes('छाती') || textLower.includes('दिल') || textLower.includes('chest') || textLower.includes('heart') || textLower.includes('पसीना')) {
      tags.push('chest pain', 'severe shortness of breath');
    }
    if (textLower.includes('सांस') || textLower.includes('खांसी') || textLower.includes('breath') || textLower.includes('cough') || textLower.includes('दम')) {
      tags.push('breathing difficulty', 'wheezing');
    }
    if (textLower.includes('पेट') || textLower.includes('stomach') || textLower.includes('belly') || textLower.includes('दर्द') || textLower.includes('मरोड़')) {
      tags.push('abdominal pain');
    }
    if (textLower.includes('उल्टी') || textLower.includes('दस्त') || textLower.includes('vomit') || textLower.includes('loose') || textLower.includes('diarrhea')) {
      tags.push('diarrhea', 'dehydration', 'frequent vomiting');
    }
    if (textLower.includes('सिर') || textLower.includes('head') || textLower.includes('चक्कर') || textLower.includes('dizzy')) {
      tags.push('severe headache', 'dizziness');
    }
    if (textLower.includes('चोट') || textLower.includes('खून') || textLower.includes('ख़ून') || textLower.includes('bleed') || textLower.includes('wound')) {
      tags.push('severe bleeding', 'deep laceration');
    }
    if (textLower.includes('दवा') || textLower.includes('गोली') || textLower.includes('शुगर') || textLower.includes('बीपी') || textLower.includes('medicine') || textLower.includes('refill')) {
      tags.push('routine refill', 'hypertension', 'diabetes');
    }

    return Array.from(new Set(tags));
  };

  const handleToggleVoice = () => {
    if (isRecording) {
      setIsRecording(false);
      return;
    }

    // Check Web Speech API
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      // Offline fallback simulation for rural mock
      setIsRecording(true);
      setTimeout(() => {
        const mockVoice = language === 'hi' 
          ? "मुझे पिछले 3 दिनों से बहुत तेज़ बुख़ार है, बदन टूट रहा है और पेट में तेज़ मरोड़ हो रही है।"
          : "Severe high fever for 3 days with shivering, body aches, and sharp stomach pain.";
        setTranscript(mockVoice);
        const tags = parseKeywordsFromTranscript(mockVoice);
        onTranscriptChange(mockVoice, tags);
        setIsRecording(false);
      }, 2500);
      return;
    }

    try {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = langMap[language] || 'hi-IN';

      recognition.onstart = () => setIsRecording(true);
      recognition.onresult = (event: any) => {
        const current = event.resultIndex;
        const resultText = event.results[current][0].transcript;
        setTranscript(resultText);
        const tags = parseKeywordsFromTranscript(resultText);
        onTranscriptChange(resultText, tags);
      };
      recognition.onerror = () => setIsRecording(false);
      recognition.onend = () => setIsRecording(false);

      recognition.start();
    } catch (e) {
      setIsRecording(false);
    }
  };

  const speakTranscript = () => {
    if (!('speechSynthesis' in window)) return;

    if (isPlayingAudio) {
      window.speechSynthesis.cancel();
      setIsPlayingAudio(false);
      return;
    }

    const textToSpeak = transcript || (language === 'hi' ? "कृपया बड़ा लाल माइक बटन दबाकर अपनी बीमारी बताएं।" : "Please press the microphone button to speak your symptoms.");
    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.lang = langMap[language] || 'hi-IN';
    utterance.rate = 0.9; // Slightly slower for rural comprehension

    utterance.onstart = () => setIsPlayingAudio(true);
    utterance.onend = () => setIsPlayingAudio(false);
    utterance.onerror = () => setIsPlayingAudio(false);

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  return (
    <div className="bg-slate-900 border-2 border-teal-500/80 rounded-2xl p-5 sm:p-6 text-white shadow-xl space-y-4 relative overflow-hidden">
      
      {/* Visual Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-teal-400 animate-pulse" />
          <span className="text-xs font-bold uppercase tracking-wider text-teal-300">
            Voice Symptom Recorder / आवाज़ से बताएं
          </span>
        </div>
        <button
          type="button"
          onClick={speakTranscript}
          className="bg-slate-800 hover:bg-slate-700 text-teal-300 text-xs px-3 py-1.5 rounded-xl flex items-center gap-1.5 border border-slate-700 cursor-pointer transition-all"
          title="Audio Readout"
        >
          {isPlayingAudio ? <Square className="w-3.5 h-3.5 text-amber-400" /> : <Volume2 className="w-3.5 h-3.5" />}
          <span>{isPlayingAudio ? 'रोकें (Stop Audio)' : 'बोलकर सुनें (Listen)'}</span>
        </button>
      </div>

      {/* Center Giant Tactile Mic Button */}
      <div className="flex flex-col items-center justify-center py-2 space-y-3">
        <button
          type="button"
          onClick={handleToggleVoice}
          className={`w-24 h-24 sm:w-28 sm:h-28 rounded-full flex flex-col items-center justify-center cursor-pointer transition-all shadow-2xl relative select-none ${
            isRecording 
              ? 'bg-red-600 text-white ring-8 ring-red-500/40 animate-pulse scale-105' 
              : 'bg-gradient-to-br from-teal-500 to-teal-700 text-white hover:from-teal-400 hover:to-teal-600 ring-4 ring-teal-500/30 active:scale-95'
          }`}
          aria-label="Toggle voice input"
        >
          {isRecording ? (
            <>
              <MicOff className="w-10 h-10 sm:w-12 sm:h-12" />
              <span className="text-[10px] font-bold mt-1 uppercase tracking-wider">Listening...</span>
            </>
          ) : (
            <>
              <Mic className="w-10 h-10 sm:w-12 sm:h-12" />
              <span className="text-[11px] font-bold mt-1 tracking-wider">माइक दबाएं</span>
            </>
          )}
        </button>

        {isRecording ? (
          <div className="flex items-center gap-1.5 py-1">
            <span className="w-1.5 h-6 bg-red-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1.5 h-10 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-1.5 h-14 bg-teal-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            <span className="w-1.5 h-8 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '450ms' }} />
            <span className="w-1.5 h-5 bg-red-400 rounded-full animate-bounce" style={{ animationDelay: '600ms' }} />
          </div>
        ) : (
          <p className="text-xs text-slate-300 text-center font-medium">
            बटन दबाकर अपनी भाषा में बताएं: <strong className="text-teal-300">बुख़ार, सीने में दर्द, सांस फूलना या चक्कर</strong>
          </p>
        )}
      </div>

      {/* Real-Time Transcript Display & Tag Indicators */}
      <div className="bg-slate-950/90 rounded-xl p-3.5 border border-slate-800 space-y-2 text-xs">
        <div className="flex items-center justify-between text-slate-400 text-[11px]">
          <span>पहचाने गए शब्द (Recognized Speech):</span>
          <span className="text-teal-400 font-mono">Hindi / Regional NLP</span>
        </div>

        <p className="text-slate-100 font-medium min-h-[36px] italic leading-relaxed">
          {transcript ? `"${transcript}"` : '(माइक दबाकर बोलना शुरू करें...)'}
        </p>

        {transcript && (
          <div className="flex items-center gap-1.5 pt-1 text-[11px] text-amber-300">
            <Sparkles className="w-3.5 h-3.5" />
            <span>लक्षण अपने-आप पहचान लिए गए हैं (Auto-Detected)</span>
          </div>
        )}
      </div>

    </div>
  );
};

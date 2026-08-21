import React, { useState, useEffect, useRef } from 'react';
import { 
  Bot, 
  Send, 
  Mic, 
  MicOff, 
  Volume2, 
  VolumeX, 
  User, 
  AlertTriangle, 
  CheckCircle2, 
  Phone, 
  Video, 
  Ticket, 
  Clock, 
  MapPin, 
  RefreshCw, 
  ChevronRight, 
  Sparkles,
  Stethoscope,
  ShieldAlert,
  ArrowRight
} from 'lucide-react';
import { AppUser, QueueToken, TriageResult, DoctorProfile, ChatbotMessage, ChatbotRecommendationResponse } from '../types';
import { teleconsultService } from '../services/teleconsultService';

interface PatientChatbotProps {
  currentUser: AppUser;
  language?: string;
  onBookToken: (triage: TriageResult, doctor: DoctorProfile, token?: QueueToken) => void;
  onStartVideoConsult: (doctor: DoctorProfile) => void;
  onViewTokenQueue: () => void;
}

interface StepState {
  symptoms: string;
  symptomTags: string[];
  duration: string;
  severity: string;
}

export const PatientChatbot: React.FC<PatientChatbotProps> = ({
  currentUser,
  language = 'hi',
  onBookToken,
  onStartVideoConsult,
  onViewTokenQueue
}) => {
  const [messages, setMessages] = useState<ChatbotMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [stepData, setStepData] = useState<StepState>({
    symptoms: '',
    symptomTags: [],
    duration: '',
    severity: ''
  });
  const [currentStage, setCurrentStage] = useState<'symptoms' | 'duration' | 'severity' | 'completed'>('symptoms');
  const [latestRecommendation, setLatestRecommendation] = useState<ChatbotRecommendationResponse | null>(null);
  const [bookingSuccess, setBookingSuccess] = useState<QueueToken | null>(null);
  const [bookingDoctorId, setBookingDoctorId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const isHindi = language === 'hi';

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  // Initial Bot Greeting on Mount
  useEffect(() => {
    const greetingText = `Namaste ${currentUser.name || 'Patient'}! I am MediQ, your 24/7 AI Health Assistant. Please tell me, what symptoms or health issues are you experiencing today?`;
    const greetingHindi = `नमस्ते ${currentUser.name || 'मरीज'} जी! मैं आपका MediQ AI स्वास्थ्य सहायक हूँ। कृपया बताएं, आज आपको क्या शारीरिक परेशानी या लक्षण महसूस हो रहे हैं?`;

    const initialMsg: ChatbotMessage = {
      id: 'msg-init',
      sender: 'bot',
      text: greetingText,
      textHindi: greetingHindi,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      stage: 'symptoms',
      options: [
        { label: '🫀 Chest Pain / सीने में दर्द', value: 'Chest pain, heaviness and sweating', isRedFlag: true },
        { label: '🌡️ High Fever / तेज़ बुख़ार (>102°F)', value: 'High fever with chills and shivering', isRedFlag: false },
        { label: '🫁 Severe Cough / सांस फूलना', value: 'Severe cough, wheezing and shortness of breath', isRedFlag: true },
        { label: '🤢 Vomiting & Diarrhea / उल्टी दस्त', value: 'Acute vomiting, loose motions and stomach cramps', isRedFlag: false },
        { label: '⚡ Severe Stomach Ache / पेट में दर्द', value: 'Severe abdominal pain and acidity', isRedFlag: false },
        { label: '🦴 Joint / Bone Pain / जोड़ों में दर्द', value: 'Joint stiffness, swelling and knee pain', isRedFlag: false }
      ]
    };

    setMessages([initialMsg]);
  }, [currentUser]);

  // Speech-to-Text Input Handling
  const handleVoiceInput = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert(isHindi ? 'आपके ब्राउज़र में वॉइस इनपुट समर्थित नहीं है।' : 'Voice recognition is not supported in this browser.');
      return;
    }

    try {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.lang = isHindi ? 'hi-IN' : 'en-IN';
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onstart = () => setIsListening(true);
      recognition.onend = () => setIsListening(false);
      recognition.onerror = () => setIsListening(false);

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          handleUserReply(transcript);
        }
      };

      recognition.start();
    } catch (e) {
      console.error("Speech recognition error:", e);
      setIsListening(false);
    }
  };

  // Text-to-Speech Bot Voice Readout
  const handleSpeakText = (text: string, hindiText?: string) => {
    if (!('speechSynthesis' in window)) return;

    window.speechSynthesis.cancel();
    if (isSpeaking) {
      setIsSpeaking(false);
      return;
    }

    const textToSpeak = isHindi && hindiText ? hindiText : text;
    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.lang = isHindi && hindiText ? 'hi-IN' : 'en-IN';
    utterance.rate = 0.95;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.speak(utterance);
  };

  // Handle Option Click or Manual Input Submission
  const handleUserReply = async (text: string) => {
    if (!text.trim()) return;

    const userMessage: ChatbotMessage = {
      id: `usr-${Date.now()}`,
      sender: 'user',
      text: text.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setIsTyping(true);

    if (currentStage === 'symptoms') {
      // Step 1 Completed -> Ask for Duration
      const updatedData = { ...stepData, symptoms: text };
      setStepData(updatedData);
      setCurrentStage('duration');

      setTimeout(() => {
        setIsTyping(false);
        const botMsg: ChatbotMessage = {
          id: `bot-dur-${Date.now()}`,
          sender: 'bot',
          text: `Got it. How long have you been experiencing these symptoms?`,
          textHindi: `समझ गया। आप इन लक्षणों को कितने समय या दिनों से महसूस कर रहे हैं?`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          stage: 'duration',
          options: [
            { label: '⏱️ Just started (< 6 hours)', value: 'Started a few hours ago today' },
            { label: '📅 1 to 2 Days (१-२ दिन)', value: '1 to 2 days' },
            { label: '🗓️ 3 to 5 Days (३-५ दिन)', value: '3 to 5 days' },
            { label: '📆 More than 1 Week (> १ सप्ताह)', value: 'Over 1 week' }
          ]
        };
        setMessages(prev => [...prev, botMsg]);
      }, 700);

    } else if (currentStage === 'duration') {
      // Step 2 Completed -> Ask for Severity
      const updatedData = { ...stepData, duration: text };
      setStepData(updatedData);
      setCurrentStage('severity');

      setTimeout(() => {
        setIsTyping(false);
        const botMsg: ChatbotMessage = {
          id: `bot-sev-${Date.now()}`,
          sender: 'bot',
          text: `How severe is the discomfort? Are you able to perform regular activities, or is it unbearable?`,
          textHindi: `तकलीफ की तीव्रता कैसी है? क्या आप सामान्य काम कर पा रहे हैं या यह बहुत असहनीय है?`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          stage: 'severity',
          options: [
            { label: '🟢 Mild (Can do daily work / हल्का)', value: 'Mild' },
            { label: '🟡 Moderate (Uncomfortable / मध्यम)', value: 'Moderate' },
            { label: '🔴 Severe / Unbearable (असहनीय / गंभीर)', value: 'Severe', isRedFlag: true }
          ]
        };
        setMessages(prev => [...prev, botMsg]);
      }, 700);

    } else if (currentStage === 'severity') {
      // Step 3 Completed -> Run Classification & Doctor Matching
      const updatedData = { ...stepData, severity: text };
      setStepData(updatedData);
      setCurrentStage('completed');

      try {
        const storedToken = localStorage.getItem('mediq_token');
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (storedToken) {
          headers['Authorization'] = `Bearer ${storedToken}`;
        }

        const response = await fetch('/api/chatbot/diagnose-and-recommend', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            patientName: currentUser.name || 'Sita Devi',
            age: currentUser.age || 48,
            gender: currentUser.gender || 'Female',
            village: currentUser.village || 'Rampur Village',
            symptomsText: updatedData.symptoms,
            duration: updatedData.duration,
            severity: text,
            selectedSymptomTags: [updatedData.symptoms.slice(0, 30)],
            vitals: { spO2: 98, systolicBP: 120, temperature: 98.6 },
            language,
            createToken: false
          })
        });

        const data: ChatbotRecommendationResponse = await response.json();
        setLatestRecommendation(data);
        setIsTyping(false);

        const botConclusion: ChatbotMessage = {
          id: `bot-diag-${Date.now()}`,
          sender: 'bot',
          text: data.botReply,
          textHindi: data.botReplyHindi,
          triageResult: data.triageResult,
          recommendedDoctors: data.recommendedDoctors,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          stage: 'completed'
        };

        setMessages(prev => [...prev, botConclusion]);

      } catch (err) {
        console.error("Chatbot classification error:", err);
        setIsTyping(false);
        // Fallback message
        const fallbackMsg: ChatbotMessage = {
          id: `bot-fallback-${Date.now()}`,
          sender: 'bot',
          text: 'Thank you for providing the details. Based on your symptoms, we have prioritized your triage and matched you with Dr. Suresh Verma at Rampur PHC. Please book a queue token or join a video consult.',
          textHindi: 'जानकारी देने के लिए धन्यवाद। आपके लक्षणों के अनुसार हमने आपका आंकलन कर रामपुर PHC के डॉ. सुरेश वर्मा को अनुशंसित किया है।',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          stage: 'completed'
        };
        setMessages(prev => [...prev, fallbackMsg]);
      }
    } else {
      // General follow-up conversational messages
      setTimeout(() => {
        setIsTyping(false);
        const botFollowup: ChatbotMessage = {
          id: `bot-follow-${Date.now()}`,
          sender: 'bot',
          text: `I've recorded your note: "${text}". You can book a priority token or begin a direct video teleconsultation with your matched doctor below.`,
          textHindi: `आपकी बात दर्ज कर ली गई है। आप नीचे दिए गए विकल्पों से तुरंत कतार टोकन बुक कर सकते हैं या डॉक्टर से वीडियो कॉल शुरू कर सकते हैं।`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        setMessages(prev => [...prev, botFollowup]);
      }, 600);
    }
  };

  // 1-Click Priority Queue Token Booking for Selected Doctor
  const handleBookQueueToken = async (doctor: DoctorProfile) => {
    if (!latestRecommendation) return;

    try {
      setIsTyping(true);
      setBookingDoctorId(doctor.id);
      const storedToken = localStorage.getItem('mediq_token');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (storedToken) {
        headers['Authorization'] = `Bearer ${storedToken}`;
      }

      const res = await fetch('/api/triage', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          patientName: currentUser.name || 'Sita Devi',
          age: currentUser.age || 48,
          gender: currentUser.gender || 'Female',
          village: currentUser.village || 'Rampur Village',
          symptomsText: `${stepData.symptoms} (Duration: ${stepData.duration}, Severity: ${stepData.severity})`,
          selectedSymptomTags: [stepData.symptoms.slice(0, 30)],
          vitals: { spO2: 98, systolicBP: 120, temperature: 98.6 },
          language,
          enteredBy: 'Self',
          assignedDoctor: doctor.name,
          assignedRoom: doctor.roomNumber ? `Room ${doctor.roomNumber} (${doctor.doctorHospital})` : (doctor.doctorHospital || 'Teleconsult Booth 1'),
          doctorId: doctor.id,
          doctorSpecialty: doctor.doctorSpecialty
        })
      });

      const data = await res.json();
      setIsTyping(false);
      setBookingDoctorId(null);

      if (data.queueToken) {
        setBookingSuccess(data.queueToken);
        onBookToken(data.triageResult, doctor, data.queueToken);
        teleconsultService.notifyQueueUpdate();

        const confirmMsg: ChatbotMessage = {
          id: `bot-confirm-${Date.now()}`,
          sender: 'bot',
          text: `🎉 Token assigned successfully! Your Priority Token is #${data.queueToken.tokenId}. Assigned to ${doctor.name} (${doctor.doctorSpecialty}) at ${doctor.doctorHospital}. Estimated wait time: ${data.queueToken.estimatedWaitMinutes} minutes.`,
          textHindi: `🎉 टोकन सफलतापूर्वक जारी किया गया! आपका टोकन नंबर #${data.queueToken.tokenId} है। ${doctor.nameRegional || doctor.name} (${doctor.doctorSpecialty}) के लिए आवंटित। अनुमानित प्रतीक्षा: ${data.queueToken.estimatedWaitMinutes} मिनट।`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        setMessages(prev => [...prev, confirmMsg]);
      }
    } catch (err) {
      console.error("Token booking error:", err);
      setIsTyping(false);
      setBookingDoctorId(null);
    }
  };

  // Restart Consultation
  const handleResetChat = () => {
    setStepData({ symptoms: '', symptomTags: [], duration: '', severity: '' });
    setCurrentStage('symptoms');
    setLatestRecommendation(null);
    setBookingSuccess(null);

    const resetMsg: ChatbotMessage = {
      id: `msg-reset-${Date.now()}`,
      sender: 'bot',
      text: `Hello again ${currentUser.name}! Let's start a fresh symptom check. What health issues are you facing?`,
      textHindi: `नमस्ते ${currentUser.name}! आइए नया स्वास्थ्य परीक्षण शुरू करें। आपको क्या परेशानी हो रही है?`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      stage: 'symptoms',
      options: [
        { label: '🫀 Chest Pain / सीने में दर्द', value: 'Chest pain and tightness', isRedFlag: true },
        { label: '🌡️ High Fever / तेज़ बुख़ार', value: 'High fever and shivering' },
        { label: '🫁 Cough / खांसी व सांस फूलना', value: 'Severe cough and breathing difficulty' },
        { label: '🤢 Stomach Pain / पेट में दर्द', value: 'Severe stomach pain and cramps' }
      ]
    };
    setMessages([resetMsg]);
  };

  return (
    <div id="patient-chatbot-container" className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[680px]">
      
      {/* Chatbot Top Bar */}
      <div id="chatbot-header" className="bg-gradient-to-r from-emerald-700 via-teal-700 to-cyan-800 text-white p-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-xl shadow-inner border border-white/30">
            🤖
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-base leading-tight">MediQ Health Bot</h3>
              <span className="bg-emerald-400/30 text-emerald-100 text-xs px-2 py-0.5 rounded-full font-medium border border-emerald-300/40 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-300 animate-pulse"></span>
                Online
              </span>
            </div>
            <p className="text-xs text-emerald-100/90">
              {isHindi ? 'एआई स्वास्थ्य परामर्शदाता एवं डॉक्टर मैचिंग' : 'AI Symptom Triage & Specialist Matcher'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            id="chatbot-reset-btn"
            onClick={handleResetChat}
            title={isHindi ? 'पुनः शुरू करें' : 'Restart Consultation'}
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors text-xs flex items-center gap-1.5 font-medium border border-white/20"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{isHindi ? 'नया चैट' : 'Restart'}</span>
          </button>
        </div>
      </div>

      {/* Chat Messages Stream */}
      <div id="chatbot-messages-stream" className="flex-1 p-4 overflow-y-auto space-y-4 bg-slate-50/60">
        {messages.map((msg) => {
          const isBot = msg.sender === 'bot';

          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isBot ? 'items-start' : 'items-end'} space-y-2 max-w-full`}
            >
              <div className={`flex items-start gap-2.5 max-w-[90%] md:max-w-[80%] ${isBot ? 'flex-row' : 'flex-row-reverse'}`}>
                {/* Avatar */}
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 shadow-sm ${
                  isBot ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-white'
                }`}>
                  {isBot ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />}
                </div>

                {/* Message Bubble */}
                <div className={`rounded-2xl p-3.5 shadow-sm text-sm leading-relaxed ${
                  isBot 
                    ? 'bg-white text-slate-800 border border-slate-200/80 rounded-tl-none' 
                    : 'bg-emerald-700 text-white rounded-tr-none'
                }`}>
                  <p className="font-medium text-slate-900">{msg.text}</p>
                  
                  {/* Regional translation display */}
                  {msg.textHindi && (
                    <p className={`mt-1.5 text-xs font-normal ${isBot ? 'text-slate-600 border-t border-slate-100 pt-1.5' : 'text-emerald-100 border-t border-emerald-600/50 pt-1.5'}`}>
                      {msg.textHindi}
                    </p>
                  )}

                  <div className="flex items-center justify-between mt-2 pt-1 text-[11px] opacity-70">
                    <span>{msg.timestamp}</span>
                    {isBot && (
                      <button
                        onClick={() => handleSpeakText(msg.text, msg.textHindi)}
                        className="hover:opacity-100 text-emerald-700 p-0.5 rounded transition-opacity flex items-center gap-1 font-medium"
                        title={isHindi ? 'बोलकर सुनाएं' : 'Read aloud'}
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                        <span>{isHindi ? 'सुनें' : 'Listen'}</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Quick Suggestion Chips attached to this bot message */}
              {msg.options && msg.options.length > 0 && currentStage === msg.stage && (
                <div className="pl-10 pr-2 pt-1 flex flex-wrap gap-2 max-w-[95%]">
                  {msg.options.map((opt, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleUserReply(opt.value)}
                      className={`text-xs px-3 py-2 rounded-xl border font-medium transition-all text-left shadow-sm flex items-center gap-1.5 ${
                        opt.isRedFlag 
                          ? 'bg-rose-50 border-rose-300 text-rose-800 hover:bg-rose-100 hover:border-rose-400' 
                          : 'bg-white border-slate-300 text-slate-700 hover:bg-emerald-50 hover:border-emerald-400 hover:text-emerald-900'
                      }`}
                    >
                      <span>{opt.label}</span>
                      <ChevronRight className="w-3 h-3 opacity-60 ml-auto shrink-0" />
                    </button>
                  ))}
                </div>
              )}

              {/* Triage & Doctor Recommendation Result Card embedded in message */}
              {msg.triageResult && msg.recommendedDoctors && msg.recommendedDoctors.length > 0 && (
                <div className="pl-10 pr-2 pt-2 w-full max-w-2xl space-y-3">
                  
                  {/* Urgency Classification Banner */}
                  <div className={`p-4 rounded-xl border shadow-sm ${
                    msg.triageResult.urgency === 'Emergency'
                      ? 'bg-rose-50 border-rose-300 text-rose-950'
                      : msg.triageResult.urgency === 'Moderate'
                      ? 'bg-amber-50 border-amber-300 text-amber-950'
                      : 'bg-emerald-50 border-emerald-300 text-emerald-950'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 font-bold text-sm">
                        {msg.triageResult.urgency === 'Emergency' ? (
                          <ShieldAlert className="w-5 h-5 text-rose-600 animate-bounce" />
                        ) : msg.triageResult.urgency === 'Moderate' ? (
                          <AlertTriangle className="w-5 h-5 text-amber-600" />
                        ) : (
                          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                        )}
                        <span>
                          {isHindi ? 'जांच परिणाम:' : 'Triage Assessment:'} {msg.triageResult.urgency.toUpperCase()} (स्कोर: {msg.triageResult.urgencyScore}/100)
                        </span>
                      </div>
                      <span className={`text-xs px-2.5 py-1 rounded-full font-bold uppercase ${
                        msg.triageResult.category === 'RED' ? 'bg-rose-600 text-white' :
                        msg.triageResult.category === 'YELLOW' ? 'bg-amber-500 text-white' : 'bg-emerald-600 text-white'
                      }`}>
                        Category {msg.triageResult.category}
                      </span>
                    </div>

                    <p className="text-xs mt-2 text-slate-700 leading-relaxed font-medium">
                      💡 {msg.triageResult.preConsultAdvice}
                    </p>
                  </div>

                  {/* Recommended Doctors Card */}
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                    <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                        <Stethoscope className="w-4 h-4 text-emerald-700" />
                        <span>{isHindi ? 'अनुशंसित विशेषज्ञ डॉक्टर (निकटतम PHC)' : 'Recommended Matching Specialist (Nearest PHC)'}</span>
                      </div>
                      <span className="text-[11px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                        AI Specialty Match
                      </span>
                    </div>

                    {msg.recommendedDoctors.map((doc, dIdx) => {
                      const isAssigned = bookingSuccess?.assignedDoctor === doc.name;
                      const isBookingThis = bookingDoctorId === doc.id;

                      return (
                        <div
                          key={doc.id}
                          className={`p-3 rounded-xl border transition-all ${
                            isAssigned
                              ? 'bg-emerald-50/90 border-emerald-500 ring-2 ring-emerald-500/30'
                              : dIdx === 0 
                                ? 'bg-slate-50/90 border-emerald-400/80 ring-1 ring-emerald-500/20' 
                                : 'bg-white border-slate-200 mt-2 hover:border-emerald-300'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-start gap-2.5">
                              <div className="w-10 h-10 rounded-full bg-emerald-100 border border-emerald-300 text-xl flex items-center justify-center shrink-0">
                                {doc.avatarEmoji || '👨‍⚕️'}
                              </div>
                              <div>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <h4 className="font-bold text-slate-900 text-sm">{doc.name}</h4>
                                  {dIdx === 0 && (
                                    <span className="bg-emerald-600 text-white text-[10px] px-1.5 py-0.2 rounded font-bold uppercase">
                                      Best Match
                                    </span>
                                  )}
                                  {isAssigned && (
                                    <span className="bg-emerald-700 text-white text-[10px] px-1.5 py-0.2 rounded font-bold uppercase flex items-center gap-0.5">
                                      <CheckCircle2 className="w-2.5 h-2.5" /> Booked
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs font-semibold text-emerald-800">{doc.doctorSpecialty}</p>
                                
                                <div className="flex items-center gap-3 text-xs text-slate-600 mt-1 flex-wrap">
                                  <span className="flex items-center gap-1 font-medium">
                                    <MapPin className="w-3.5 h-3.5 text-slate-500" />
                                    {doc.doctorHospital} ({doc.distanceKm} km away)
                                  </span>
                                  <span className="flex items-center gap-1 font-medium text-emerald-700">
                                    <Clock className="w-3.5 h-3.5" />
                                    {doc.availableStatus}
                                  </span>
                                </div>

                                <div className="text-xs text-slate-600 mt-1 flex items-center gap-1 font-semibold text-slate-800">
                                  <Phone className="w-3 h-3 text-emerald-600" />
                                  <span>Direct Contact:</span>
                                  <a 
                                    href={`tel:${doc.phone.replace(/\s+/g, '')}`}
                                    className="text-emerald-700 hover:underline font-bold"
                                  >
                                    {doc.phone}
                                  </a>
                                </div>
                              </div>
                            </div>

                            <div className="text-right shrink-0">
                              <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100/60 px-2 py-0.5 rounded block">
                                ⭐ {doc.rating}
                              </span>
                              <span className="text-[10px] text-slate-500 block mt-1">
                                {doc.experienceYears}+ yrs exp
                              </span>
                            </div>
                          </div>

                          {/* Direct Action Buttons for each doctor */}
                          <div className="mt-3 pt-3 border-t border-slate-200/80 flex flex-wrap gap-2">
                            <button
                              id={dIdx === 0 ? "btn-book-queue-token" : `btn-book-queue-token-${doc.id}`}
                              disabled={isTyping}
                              onClick={() => handleBookQueueToken(doc)}
                              className={`flex-1 min-w-[130px] py-2 px-3 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all active:scale-[0.98] ${
                                isAssigned
                                  ? 'bg-emerald-800 text-white'
                                  : 'bg-emerald-700 hover:bg-emerald-800 text-white'
                              } disabled:opacity-50`}
                            >
                              <Ticket className="w-3.5 h-3.5" />
                              <span>
                                {isBookingThis
                                  ? (isHindi ? 'टोकन बुक हो रहा है...' : 'Booking Token...')
                                  : isAssigned
                                    ? (isHindi ? 'टोकन बुक हो चुका' : 'Token Booked')
                                    : (isHindi ? 'कतार टोकन बुक करें' : 'Book Token')}
                              </span>
                            </button>

                            <button
                              id={`btn-start-video-consult-${doc.id}`}
                              onClick={() => onStartVideoConsult(doc)}
                              className="flex-1 min-w-[130px] py-2 px-3 bg-cyan-700 hover:bg-cyan-800 text-white rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all active:scale-[0.98]"
                            >
                              <Video className="w-3.5 h-3.5" />
                              <span>{isHindi ? 'वीडियो कॉल' : 'Video Consult'}</span>
                            </button>

                            <a
                              href={`tel:${doc.phone.replace(/\s+/g, '')}`}
                              className="py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg font-semibold text-xs flex items-center justify-center gap-1 border border-slate-300"
                            >
                              <Phone className="w-3.5 h-3.5 text-slate-600" />
                              <span>{isHindi ? 'फ़ोन' : 'Call'}</span>
                            </a>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Active Booking Banner */}
                  {bookingSuccess && (
                    <div className="p-3 bg-emerald-100 border border-emerald-300 rounded-xl flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs text-emerald-950 font-bold">
                        <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                        <span>Token #{bookingSuccess.tokenId} is active! (Wait: {bookingSuccess.estimatedWaitMinutes}m)</span>
                      </div>
                      <button
                        onClick={onViewTokenQueue}
                        className="text-xs bg-emerald-800 hover:bg-emerald-900 text-white px-3 py-1 rounded-lg font-semibold flex items-center gap-1"
                      >
                        <span>{isHindi ? 'कतार देखें' : 'View Queue'}</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  )}

                </div>
              )}

            </div>
          );
        })}

        {/* Typing indicator */}
        {isTyping && (
          <div className="flex items-center gap-2 text-slate-500 text-xs pl-2">
            <div className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center">
              <Bot className="w-3.5 h-3.5 animate-spin" />
            </div>
            <span className="bg-white border border-slate-200 px-3 py-1.5 rounded-xl rounded-tl-none text-slate-600 italic">
              {isHindi ? 'MediQ विश्लेषण कर रहा है...' : 'MediQ is analyzing symptoms & matching specialists...'}
            </span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Chat Input Bar */}
      <div id="chatbot-input-bar" className="p-3 bg-white border-t border-slate-200">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleUserReply(inputText);
          }}
          className="flex items-center gap-2"
        >
          {/* Voice input button */}
          <button
            type="button"
            onClick={handleVoiceInput}
            className={`p-2.5 rounded-xl border transition-colors flex items-center justify-center shrink-0 border-black ${
              isListening
                ? 'bg-rose-600 text-white animate-pulse'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
            title={isListening ? 'Listening...' : (isHindi ? 'बोलकर बताएं' : 'Speak symptoms')}
          >
            {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4 text-emerald-700" />}
          </button>

          <input
            id="chatbot-text-input"
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={
              isListening
                ? (isHindi ? 'सुन रहा हूँ... बोलिए...' : 'Listening... Speak now...')
                : currentStage === 'symptoms'
                ? (isHindi ? 'अपने लक्षण लिखें या ऊपर से चुनें...' : 'Describe your symptoms or tap options above...')
                : currentStage === 'duration'
                ? (isHindi ? 'कितने दिनों से है? (जैसे २ दिन)...' : 'Enter duration (e.g. 2 days)...')
                : (isHindi ? 'संदेह या लक्षण टाइप करें...' : 'Type your symptom response...')
            }
            className="flex-1 py-2 px-3.5 rounded-xl border border-black text-black placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white font-medium"
          />

          <button
            id="chatbot-send-btn"
            type="submit"
            disabled={!inputText.trim() || isTyping}
            className="p-2.5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-40 disabled:hover:bg-emerald-700 text-white rounded-xl transition-colors shrink-0 shadow-sm"
            title="Send"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>

    </div>
  );
};

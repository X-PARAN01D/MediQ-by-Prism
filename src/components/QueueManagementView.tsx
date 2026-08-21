import React, { useState } from 'react';
import { QueueToken, AppLanguage } from '../types';
import { 
  Volume2, 
  UserCheck, 
  Clock, 
  AlertOctagon, 
  CheckCircle2, 
  Smartphone, 
  RefreshCw, 
  Search,
  Building,
  UserX,
  Play
} from 'lucide-react';

interface QueueManagementViewProps {
  queueTokens: QueueToken[];
  onCallNext: () => void;
  language: AppLanguage;
}

export const QueueManagementView: React.FC<QueueManagementViewProps> = ({
  queueTokens,
  onCallNext,
  language
}) => {
  const [filter, setFilter] = useState<'All' | 'Waiting' | 'In Consult' | 'Emergency'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'queueDisplay' | 'smsFallback'>('queueDisplay');

  // Filter tokens
  const activeTokens = queueTokens.filter(t => {
    if (filter === 'Waiting') return t.status === 'Waiting';
    if (filter === 'In Consult') return t.status === 'In Consult';
    if (filter === 'Emergency') return t.urgency === 'Emergency';
    return t.status !== 'Completed' && t.status !== 'Cancelled';
  }).filter(t => 
    t.patientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.tokenId.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.village.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const nowCalling = queueTokens.find(t => t.status === 'In Consult') || null;
  const emergencyTokens = queueTokens.filter(t => t.urgency === 'Emergency' && t.status !== 'Completed');
  const waitingTokens = queueTokens.filter(t => t.status === 'Waiting');

  const speakAnnouncement = (token: QueueToken) => {
    if ('speechSynthesis' in window) {
      const text = language === 'hi'
        ? `टोकन नंबर ${token.tokenId}, मरीज़ ${token.patientName}, कृपया कमरा नंबर ${token.assignedRoom} में जाएं।`
        : `Token Number ${token.tokenId}, Patient ${token.patientName}, please proceed to ${token.assignedRoom}.`;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = language === 'hi' ? 'hi-IN' : 'en-US';
      window.speechSynthesis.speak(utterance);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      
      {/* Top Banner & Control Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-white shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-amber-900/60 text-amber-300 text-xs px-2.5 py-0.5 rounded-full border border-amber-700/50 font-semibold">
              Live PHC Display
            </span>
            <span className="text-xs text-slate-400">Rampur Primary Health Centre</span>
          </div>
          <h2 className="text-2xl font-bold tracking-tight">Digital Queue & Waiting Room Board</h2>
          <p className="text-sm text-slate-300 mt-1 max-w-2xl">
            Real-time token management for rural clinics. Emergency tokens automatically bypass the queue.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setActiveTab(activeTab === 'queueDisplay' ? 'smsFallback' : 'queueDisplay')}
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 border border-slate-700 cursor-pointer transition-all"
          >
            <Smartphone className="w-4 h-4 text-amber-400" />
            <span>{activeTab === 'queueDisplay' ? 'View Feature Phone SMS Fallback' : 'Return to Queue Board'}</span>
          </button>

          <button
            onClick={() => {
              onCallNext();
              if (nowCalling) speakAnnouncement(nowCalling);
            }}
            className="bg-teal-600 hover:bg-teal-700 text-white px-5 py-2.5 rounded-xl text-xs font-bold shadow-lg shadow-teal-900/40 flex items-center gap-2 transition-all cursor-pointer"
          >
            <Play className="w-4 h-4" />
            <span>Call Next Patient</span>
          </button>
        </div>
      </div>

      {activeTab === 'queueDisplay' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* NOW CALLING PROMINENT DISPLAY BOARD */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-slate-900 border-2 border-teal-500 rounded-2xl p-6 text-white shadow-xl text-center relative overflow-hidden">
              <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-teal-950 text-teal-400 px-2.5 py-1 rounded-full text-[11px] font-bold border border-teal-800">
                <span className="w-2 h-2 rounded-full bg-teal-400 animate-ping" />
                NOW CONSULTING / वर्तमान टोकन
              </div>

              {nowCalling ? (
                <div className="py-4 space-y-4">
                  <span className="text-xs font-mono uppercase text-slate-400 tracking-widest block">TOKEN NUMBER</span>
                  <span className="text-6xl font-black font-mono tracking-tight text-teal-300 drop-shadow-md">
                    {nowCalling.tokenId}
                  </span>

                  <div className="space-y-1">
                    <h3 className="text-xl font-bold text-white">{nowCalling.patientName}</h3>
                    <p className="text-xs text-slate-300">{nowCalling.age} years ({nowCalling.gender}) • {nowCalling.village}</p>
                  </div>

                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-slate-800 text-amber-300 border border-slate-700">
                    <span>Priority: {nowCalling.urgency}</span>
                  </div>

                  <div className="bg-slate-800/80 rounded-xl p-3 text-xs text-slate-200 flex justify-between items-center border border-slate-700">
                    <div className="text-left">
                      <span className="text-slate-400 block text-[10px]">ROOM / BOOTH</span>
                      <span className="font-bold text-teal-400 text-sm">{nowCalling.assignedRoom}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-slate-400 block text-[10px]">DOCTOR</span>
                      <span className="font-bold text-slate-200">{nowCalling.assignedDoctor}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => speakAnnouncement(nowCalling)}
                    className="w-full bg-teal-800/80 hover:bg-teal-700 text-teal-100 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 border border-teal-600 cursor-pointer transition-all"
                  >
                    <Volume2 className="w-4 h-4 text-teal-300" />
                    <span>Broadcast Audio Announcement (ध्वनि घोषणा)</span>
                  </button>
                </div>
              ) : (
                <div className="py-12 space-y-3">
                  <UserX className="w-12 h-12 text-slate-600 mx-auto" />
                  <h3 className="text-base font-semibold text-slate-400">No Patient Currently in Consultation</h3>
                  <p className="text-xs text-slate-500">Click "Call Next Patient" to advance the queue.</p>
                </div>
              )}
            </div>

            {/* Emergency Bypassed Queue Card */}
            {emergencyTokens.length > 0 && (
              <div className="bg-red-950/40 border-2 border-red-600 rounded-2xl p-5 text-red-100 shadow-lg space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-red-400 font-bold text-sm">
                    <AlertOctagon className="w-5 h-5 text-red-500 animate-pulse" />
                    <span>EMERGENCY BYPASS QUEUE ({emergencyTokens.length})</span>
                  </div>
                  <span className="text-[10px] bg-red-800 text-white px-2 py-0.5 rounded font-bold">PRIORITY 1</span>
                </div>

                <div className="space-y-2">
                  {emergencyTokens.map(et => (
                    <div key={et.tokenId} className="bg-red-900/60 border border-red-700 rounded-xl p-3 text-xs flex justify-between items-center">
                      <div>
                        <span className="font-mono font-bold text-sm text-red-200 block">{et.tokenId} - {et.patientName}</span>
                        <p className="text-[11px] text-red-300 mt-0.5">{et.symptomsSummary}</p>
                      </div>
                      <span className="bg-red-600 text-white font-bold px-2 py-1 rounded text-[11px] shrink-0">
                        BYPASSING
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Queue Metrics Summary */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm text-center">
                <span className="text-xs text-slate-500 block font-medium">Waiting Patients</span>
                <span className="text-2xl font-bold text-slate-900 mt-1 block">{waitingTokens.length}</span>
              </div>
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm text-center">
                <span className="text-xs text-slate-500 block font-medium">Avg Wait Time</span>
                <span className="text-2xl font-bold text-teal-700 mt-1 block">
                  ~{waitingTokens.length > 0 ? Math.round(waitingTokens.reduce((a, b) => a + b.estimatedWaitMinutes, 0) / waitingTokens.length) : 0} m
                </span>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: ACTIVE QUEUE TABLE */}
          <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
            
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Building className="w-5 h-5 text-teal-600" />
                Active Queue Directory ({activeTokens.length})
              </h3>

              {/* Filters */}
              <div className="flex items-center gap-2 text-xs">
                {['All', 'Waiting', 'In Consult', 'Emergency'].map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f as any)}
                    className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                      filter === f
                        ? 'bg-slate-900 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search patient, token (e.g. MOD-012), or village..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-teal-500"
              />
            </div>

            {/* Token Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="p-3">Token</th>
                    <th className="p-3">Patient Name</th>
                    <th className="p-3">Urgency</th>
                    <th className="p-3">Est. Wait</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {activeTokens.length > 0 ? (
                    activeTokens.map(token => (
                      <tr key={token.tokenId} className="hover:bg-slate-50 transition-colors">
                        <td className="p-3 font-mono font-bold text-slate-900">{token.tokenId}</td>
                        <td className="p-3">
                          <span className="font-semibold text-slate-800 block">{token.patientName}</span>
                          <span className="text-[10px] text-slate-500">{token.village}</span>
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded-full font-semibold text-[10px] ${
                            token.urgency === 'Emergency'
                              ? 'bg-red-100 text-red-800 border border-red-200'
                              : token.urgency === 'Moderate'
                              ? 'bg-amber-100 text-amber-800 border border-amber-200'
                              : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          }`}>
                            {token.urgency}
                          </span>
                        </td>
                        <td className="p-3 font-medium text-slate-700">
                          {token.estimatedWaitMinutes === 0 ? 'Now' : `~${token.estimatedWaitMinutes} min`}
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            token.status === 'In Consult'
                              ? 'bg-teal-600 text-white animate-pulse'
                              : token.status === 'Waiting'
                              ? 'bg-slate-200 text-slate-700'
                              : 'bg-emerald-600 text-white'
                          }`}>
                            {token.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-slate-400">
                        No active queue tokens match your search criteria.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

          </div>

        </div>
      ) : (
        /* Feature Phone SMS / IVR Fallback View */
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
          <div>
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-amber-600" />
              SMS & IVR Fallback Gateway (For Non-Smartphone Feature Phone Users)
            </h3>
            <p className="text-xs text-slate-600 mt-1">
              In remote rural villages where smartphones or internet are unavailable, patients receive SMS text alerts or automated IVR phone calls with token numbers and wait time updates via USSD / SMS gateway.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="border border-slate-200 rounded-2xl p-5 bg-slate-50 space-y-3">
              <span className="text-xs font-bold text-slate-900 uppercase tracking-wider block">Simulated Feature Phone Display (Nokia / Feature Phone)</span>
              
              <div className="bg-slate-900 text-emerald-400 font-mono text-xs p-4 rounded-xl border-4 border-slate-700 shadow-inner space-y-2">
                <p className="text-[10px] text-slate-400 border-b border-slate-800 pb-1">[INBOX SMS] - From: PHC-SWASTHYA</p>
                <p>TOKEN ASSIGNED: MOD-012</p>
                <p>NAME: Sunita Devi</p>
                <p>PHC: Rampur Primary Health</p>
                <p>POS IN QUEUE: 2</p>
                <p>EST WAIT: ~8 MINS</p>
                <p className="text-[10px] text-slate-300 pt-1">Reply 'CANCEL' to leave queue, or 'STATUS' for live update.</p>
              </div>
            </div>

            <div className="space-y-3 text-xs text-slate-700">
              <div className="font-bold text-slate-900 text-sm">How SMS/IVR Fallback Works in SIH 2026 PS-03:</div>
              <ul className="list-disc list-inside space-y-1.5 leading-relaxed text-slate-600">
                <li><strong className="text-slate-800">USSD / Toll-Free IVR:</strong> Dialing <code className="bg-slate-100 px-1 rounded text-slate-900 font-mono">*140*84#</code> allows feature phone users to submit voice/keypad symptoms in Hindi.</li>
                <li><strong className="text-slate-800">Automated SMS Alerts:</strong> Dispatches instant SMS when token moves to top 3 position.</li>
                <li><strong className="text-slate-800">Voice Missed Call Service:</strong> Patient gives a missed call to PHC hotline to receive automated audio readout of token status.</li>
              </ul>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

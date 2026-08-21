import React, { useState } from 'react';
import { PHCClusterData, AppLanguage } from '../types';
import { PHC_CLUSTERS } from '../data/mockData';
import { 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid, 
  BarChart, 
  Bar, 
  Legend 
} from 'recharts';
import { 
  Activity, 
  AlertTriangle, 
  TrendingUp, 
  ShieldAlert, 
  Users, 
  Building, 
  ArrowRight,
  Sparkles,
  MapPin
} from 'lucide-react';

interface OutbreakAnalyticsViewProps {
  language: AppLanguage;
}

export const OutbreakAnalyticsView: React.FC<OutbreakAnalyticsViewProps> = () => {
  const [selectedPhc, setSelectedPhc] = useState<PHCClusterData>(PHC_CLUSTERS[0]);

  // Chart trend data transform
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const trendChartData = days.map((day, idx) => ({
    day,
    Fever: selectedPhc.feverTrend[idx],
    Diarrhea: selectedPhc.gastroTrend[idx],
    Respiratory: selectedPhc.respiratoryTrend[idx]
  }));

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      
      {/* Top Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-white shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-red-900/60 text-red-300 text-xs px-2.5 py-0.5 rounded-full border border-red-700/50 font-semibold">
              Predictive Epidemiology
            </span>
            <span className="text-xs text-slate-400">District Disease Surveillance</span>
          </div>
          <h2 className="text-2xl font-bold tracking-tight">Disease Outbreak & PHC Load Balancing Maps</h2>
          <p className="text-sm text-slate-300 mt-1 max-w-2xl">
            Aggregates anonymized symptom intake data across rural Primary Health Centres to auto-flag localized disease spikes (e.g. Dengue, Cholera) and reallocate doctor shifts.
          </p>
        </div>

        <div className="bg-red-950/80 border border-red-800/80 rounded-xl p-3 text-xs text-red-200 flex items-center gap-3">
          <ShieldAlert className="w-6 h-6 text-red-400 shrink-0 animate-pulse" />
          <div>
            <span className="font-bold text-red-300 block">Active Outbreak Alert (Rampur PHC):</span>
            <span>+48% fever spike over 7 days. High Dengue NS1 suspicion.</span>
          </div>
        </div>
      </div>

      {/* Regional PHC Cluster Grid Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {PHC_CLUSTERS.map(cluster => (
          <div
            key={cluster.phcId}
            onClick={() => setSelectedPhc(cluster)}
            className={`bg-white rounded-2xl border p-5 cursor-pointer transition-all ${
              selectedPhc.phcId === cluster.phcId
                ? 'border-teal-600 ring-2 ring-teal-500 shadow-md bg-teal-50/20'
                : 'border-slate-200 hover:border-slate-300 hover:shadow'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-500 uppercase">{cluster.district}</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                cluster.outbreakRisk === 'High'
                  ? 'bg-red-100 text-red-800 border border-red-300'
                  : cluster.outbreakRisk === 'Moderate'
                  ? 'bg-amber-100 text-amber-800 border border-amber-300'
                  : 'bg-emerald-100 text-emerald-800'
              }`}>
                {cluster.outbreakRisk} Risk
              </span>
            </div>

            <h3 className="font-bold text-slate-900 text-sm mb-1">{cluster.name}</h3>
            <p className="text-xs text-slate-600 mb-3 truncate">Top: {cluster.topSymptom}</p>

            <div className="grid grid-cols-2 gap-2 text-xs pt-3 border-t border-slate-100">
              <div>
                <span className="text-slate-400 block text-[10px]">Queue Length</span>
                <span className="font-bold text-slate-900 text-sm">{cluster.currentQueueLength} Patients</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">Active Doctors</span>
                <span className="font-bold text-teal-700 text-sm">{cluster.activeDoctors} MOs</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Main Charts & Doctor Load Balancing Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Recharts Time-Series Graph */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-teal-600" />
                7-Day Symptom Trend Analysis - {selectedPhc.name}
              </h3>
              <p className="text-xs text-slate-500">Daily patient intake count grouped by symptom category</p>
            </div>
          </div>

          <div className="h-72 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="day" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={11} />
                <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#fff', borderRadius: '12px', fontSize: '12px' }} />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Line type="monotone" dataKey="Fever" stroke="#ef4444" strokeWidth={3} dot={{ r: 4 }} />
                <Line type="monotone" dataKey="Diarrhea" stroke="#f59e0b" strokeWidth={2} />
                <Line type="monotone" dataKey="Respiratory" stroke="#0d9488" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Right Column: AI Load Balancing & Resource Recommendations */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-slate-100 shadow-lg space-y-4">
            <div className="flex items-center gap-2 text-teal-400 font-bold text-sm border-b border-slate-800 pb-2">
              <Sparkles className="w-5 h-5" />
              <span>AI Doctor Load-Balancing & Resource Re-allocation</span>
            </div>

            <div className="bg-slate-800/90 rounded-xl p-3.5 text-xs text-slate-200 space-y-2 border border-slate-700">
              <span className="font-bold text-amber-300 block">Recommended Action Plan:</span>
              <p className="leading-relaxed">
                Sitapur Main PHC currently has 4 active Medical Officers with low queue wait times (~10 mins), while Rampur PHC is overloaded with 14 patients per doctor.
              </p>
            </div>

            <div className="bg-teal-950/60 border border-teal-800/80 rounded-xl p-3.5 text-xs text-teal-200 space-y-2">
              <div className="font-bold text-teal-300 flex items-center gap-1.5">
                <Users className="w-4 h-4" />
                <span>Automated Doctor Shift Re-assignment:</span>
              </div>
              <div className="flex items-center justify-between bg-slate-900 p-2.5 rounded-lg border border-teal-900">
                <span>Sitapur Main PHC</span>
                <ArrowRight className="w-4 h-4 text-teal-400" />
                <span className="font-bold text-amber-300">Rampur PHC (+1 MO)</span>
              </div>
              <p className="text-[11px] text-teal-300">Decreases Rampur wait time from 42 mins to ~18 mins.</p>
            </div>

            <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-3 text-xs text-slate-300 space-y-1">
              <span className="font-semibold text-slate-100 block">District Health Officer (DHO) Broadcast:</span>
              <p>• Dispatch 200 NS1 Dengue Rapid Test Kits to Rampur PHC.</p>
              <p>• Issue water testing alert for Kheri Village Panchayat.</p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

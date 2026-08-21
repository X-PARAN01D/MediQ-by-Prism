import React, { useState } from 'react';
import { 
  Wifi, 
  WifiOff, 
  RefreshCw, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  Database,
  CloudUpload
} from 'lucide-react';
import { OfflineSyncItem } from '../types';

interface OfflineSyncBadgeProps {
  isOnline: boolean;
  onToggleOnline: () => void;
  syncQueue: OfflineSyncItem[];
  onSyncNow: () => void;
}

export const OfflineSyncBadge: React.FC<OfflineSyncBadgeProps> = ({
  isOnline,
  onToggleOnline,
  syncQueue,
  onSyncNow
}) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [showDrawer, setShowDrawer] = useState(false);

  const pendingCount = syncQueue.filter(item => item.status === 'pending').length;

  const handleManualSync = () => {
    setIsSyncing(true);
    setTimeout(() => {
      onSyncNow();
      setIsSyncing(false);
    }, 1500);
  };

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        {/* Toggle Online / Offline Simulation */}
        <button
          type="button"
          onClick={onToggleOnline}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-all cursor-pointer shadow-sm ${
            isOnline 
              ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60 hover:bg-emerald-900/60' 
              : 'bg-amber-950/90 text-amber-300 border-amber-600/70 hover:bg-amber-900/60'
          }`}
          title="Click to simulate 2G Offline / Online Mode"
        >
          {isOnline ? (
            <>
              <Wifi className="w-3.5 h-3.5 text-emerald-400" />
              <span>Online (Cloud Sync)</span>
            </>
          ) : (
            <>
              <WifiOff className="w-3.5 h-3.5 text-amber-400" />
              <span>Offline (2G Local Storage)</span>
            </>
          )}
        </button>

        {/* Pending Queue Count & Sync Button */}
        {pendingCount > 0 && (
          <button
            type="button"
            onClick={handleManualSync}
            disabled={isSyncing}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500 text-slate-950 hover:bg-amber-400 transition-all cursor-pointer shadow-sm animate-pulse"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Syncing...' : `${pendingCount} Pending Sync`}</span>
          </button>
        )}
      </div>
    </div>
  );
};

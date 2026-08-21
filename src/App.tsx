import React, { useState, useEffect } from 'react';
import { UserRoleMode, AppLanguage, QueueToken, Patient, TriageResult, Prescription, AppUser } from './types';
import { INITIAL_QUEUE_TOKENS, INITIAL_PATIENTS } from './data/mockData';
import { Header } from './components/Header';
import { LandingAuthView } from './components/LandingAuthView';
import { PatientDashboardView } from './components/PatientDashboardView';
import { DoctorDashboardView } from './components/DoctorDashboardView';
import { QueueManagementView } from './components/QueueManagementView';
import { AccessDeniedGuard } from './components/AccessDeniedGuard';
import { IncomingCallNotificationModal } from './components/IncomingCallNotificationModal';
import { teleconsultService, TeleconsultSession } from './services/teleconsultService';
import { getNextSequentialTokenId } from './utils/triageEngine';

export default function App() {
  // Current Logged-In User state (null by default so landing auth page is the starting page)
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [currentRole, setCurrentRole] = useState<UserRoleMode>('patient');
  const [language, setLanguage] = useState<AppLanguage>('hi');
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [showLandingAuth, setShowLandingAuth] = useState<boolean>(true);
  const [authChecking, setAuthChecking] = useState<boolean>(true);

  // Live Teleconsultation Call State
  const [incomingCallSession, setIncomingCallSession] = useState<TeleconsultSession | null>(null);
  const [activeCallSession, setActiveCallSession] = useState<TeleconsultSession | null>(null);

  // Queue Tokens and Patient state
  const [queueTokens, setQueueTokens] = useState<QueueToken[]>([]);
  const [activePatient, setActivePatient] = useState<Patient | null>(null);

  // Gracefully handle session loss / 401 unauthorized
  const handleSessionLoss = () => {
    console.warn('[App] Authentication session expired or unauthorized. Returning to landing.');
    localStorage.removeItem('mediq_token');
    setCurrentUser(null);
    setShowLandingAuth(true);
    setQueueTokens([]);
  };

  // Sync queue from backend API based on authenticated role
  const fetchQueueFromBackend = async () => {
    try {
      const storedToken = localStorage.getItem('mediq_token');
      if (!storedToken) {
        setQueueTokens([]);
        return;
      }

      const headers: Record<string, string> = {
        'Authorization': `Bearer ${storedToken}`
      };

      // Doctors fetch the full clinical queue; Patients fetch strictly their own status
      if (currentUser?.role === 'doctor') {
        const res = await fetch('/api/queue', { headers });
        if (res.status === 401) {
          handleSessionLoss();
          return;
        }
        if (res.ok) {
          const data = await res.json();
          if (data.allTokens) {
            setQueueTokens(data.allTokens);
          }
        }
      } else if (currentUser?.role === 'patient') {
        const res = await fetch('/api/queue/my-status', { headers });
        if (res.status === 401) {
          handleSessionLoss();
          return;
        }
        if (res.ok) {
          const data = await res.json();
          if (data.myToken) {
            setQueueTokens([data.myToken]);
          } else {
            setQueueTokens([]);
          }
        }
      }
    } catch (e) {
      // Keep local state if server offline
    }
  };

  // Trigger queue fetch when user logs in or role updates
  useEffect(() => {
    if (currentUser) {
      fetchQueueFromBackend();
    }
  }, [currentUser]);

  // Periodic real-time polling for Doctor portal queue (every 3 seconds)
  useEffect(() => {
    if (currentUser?.role === 'doctor') {
      fetchQueueFromBackend();
      const pollInterval = setInterval(() => {
        fetchQueueFromBackend();
      }, 3000);
      return () => {
        clearInterval(pollInterval);
      };
    }
  }, [currentUser?.role, currentUser?.id]);

  // Connect to Teleconsultation WebSocket Signaling Server when user is logged in
  useEffect(() => {
    if (currentUser) {
      teleconsultService.connect({
        userId: currentUser.id || `user_${currentUser.phone || Date.now()}`,
        role: currentUser.role,
        name: currentUser.name,
        patientId: currentUser.patientId,
        phone: currentUser.phone
      });

      const unsubIncoming = teleconsultService.on('call:incoming', (session: TeleconsultSession) => {
        if (currentUser.role === 'patient') {
          setIncomingCallSession(session);
        }
      });

      const unsubConnected = teleconsultService.on('call:connected', (session: TeleconsultSession) => {
        setActiveCallSession(session);
        setIncomingCallSession(null);
      });

      const unsubEnded = teleconsultService.on('call:ended', () => {
        setActiveCallSession(null);
        setIncomingCallSession(null);
      });

      const unsubQueueUpdate = teleconsultService.on('queue:update_needed', () => {
        fetchQueueFromBackend();
      });

      return () => {
        unsubIncoming();
        unsubConnected();
        unsubEnded();
        unsubQueueUpdate();
      };
    }
  }, [currentUser]);

  // Check stored session on initial mount
  useEffect(() => {
    const checkSession = async () => {
      const storedToken = localStorage.getItem('mediq_token');
      if (storedToken) {
        try {
          const res = await fetch('/api/auth/me', {
            headers: { Authorization: `Bearer ${storedToken}` }
          });
          if (res.ok) {
            const data = await res.json();
            if (data.user) {
              setCurrentUser(data.user);
              setCurrentRole(data.user.role || 'patient');
              setShowLandingAuth(false);
            }
          } else {
            localStorage.removeItem('mediq_token');
            setShowLandingAuth(true);
          }
        } catch (e) {
          // If server unreachable, keep landing auth
          setShowLandingAuth(true);
        }
      } else {
        setShowLandingAuth(true);
      }
      setAuthChecking(false);
    };

    checkSession();
    fetchQueueFromBackend();

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    const handleUnauthorizedEvent = () => handleSessionLoss();

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('mediq:unauthorized', handleUnauthorizedEvent);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('mediq:unauthorized', handleUnauthorizedEvent);
    };
  }, []);

  const activeEmergencyCount = queueTokens.filter(q => q.urgency === 'Emergency' && q.status !== 'Completed').length;

  const handleLoginSuccess = (user: AppUser) => {
    setCurrentUser(user);
    setShowLandingAuth(false);
    if (user.role === 'doctor') {
      setCurrentRole('doctor');
    } else {
      setCurrentRole('patient');
    }
    setTimeout(() => {
      fetchQueueFromBackend();
    }, 100);
  };

  const handleLogout = async () => {
    const token = localStorage.getItem('mediq_token');
    if (token) {
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token })
        });
      } catch (e) {}
      localStorage.removeItem('mediq_token');
    }
    setCurrentUser(null);
    setShowLandingAuth(true);
    fetchQueueFromBackend();
  };

  const handleRoleNavigation = (role: UserRoleMode) => {
    setCurrentRole(role);
    if (!currentUser) {
      setShowLandingAuth(true);
      return;
    }
    setShowLandingAuth(false);
  };

  const handleGoToLogin = () => {
    setShowLandingAuth(true);
  };

  const handleTriageComplete = (result: TriageResult, newQueueToken: QueueToken) => {
    setQueueTokens(prev => [newQueueToken, ...prev]);
    if (newQueueToken.urgency === 'Emergency') {
      setCurrentRole('queue');
    }
  };

  const handleCallNext = async () => {
    try {
      const storedToken = localStorage.getItem('mediq_token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (storedToken) {
        headers['Authorization'] = `Bearer ${storedToken}`;
      }

      const res = await fetch('/api/queue/call-next', {
        method: 'POST',
        headers,
        body: JSON.stringify({ doctorName: currentUser?.name || 'Dr. Suresh Verma', roomName: 'Teleconsult Booth 1' })
      });

      if (res.status === 401) {
        handleSessionLoss();
        return;
      }

      if (res.ok) {
        const data = await res.json();
        if (data.nowCalling) {
          setQueueTokens(prev => prev.map(t => {
            if (t.tokenId === data.nowCalling.tokenId) {
              return { ...t, status: 'In Consult' };
            }
            if (t.status === 'In Consult') {
              return { ...t, status: 'Completed' };
            }
            return t;
          }));
        }
      } else {
        localAdvanceQueue();
      }
    } catch (err) {
      localAdvanceQueue();
    }
  };

  const localAdvanceQueue = () => {
    setQueueTokens(prev => {
      let updated = [...prev];
      updated = updated.map(t => t.status === 'In Consult' ? { ...t, status: 'Completed' } : t);
      
      const nextWaiting = updated.find(t => t.status === 'Waiting');
      if (nextWaiting) {
        return updated.map(t => t.tokenId === nextWaiting.tokenId ? { ...t, status: 'In Consult' } : t);
      }
      return updated;
    });
  };

  const handleSelectPatientToConsult = (token: QueueToken) => {
    setQueueTokens(prev => prev.map(t => {
      if (t.tokenId === token.tokenId) {
        return { ...t, status: 'In Consult' };
      }
      if (t.status === 'In Consult') {
        return { ...t, status: 'Completed' };
      }
      return t;
    }));
  };

  const handleSavePrescription = async (rxData: Partial<Prescription>) => {
    try {
      const storedToken = localStorage.getItem('mediq_token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (storedToken) {
        headers['Authorization'] = `Bearer ${storedToken}`;
      }

      const inConsultToken = queueTokens.find(q => q.status === 'In Consult');
      const res = await fetch('/api/consult/prescription', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          tokenId: inConsultToken?.tokenId,
          doctorName: rxData.doctorName || currentUser?.name || 'Dr. Suresh Verma',
          patientName: rxData.patientName || inConsultToken?.patientName || 'Patient',
          patientId: inConsultToken?.patientId,
          diagnosis: rxData.diagnosis || 'Clinical Consult & Follow-up',
          medications: rxData.medications || [],
          advice: rxData.advice || '',
          followUpDays: rxData.followUpDays || 7,
          ...rxData
        })
      });

      if (res.status === 401) {
        handleSessionLoss();
        return;
      }
    } catch (e) {
      // Proceed gracefully
    }

    setQueueTokens(prev => prev.map(t => t.status === 'In Consult' ? { ...t, status: 'Completed' } : t));
  };

  const handleTriggerEmergencyAlert = async () => {
    try {
      const storedToken = localStorage.getItem('mediq_token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (storedToken) {
        headers['Authorization'] = `Bearer ${storedToken}`;
      }

      const res = await fetch('/api/queue/emergency-alert', {
        method: 'POST',
        headers,
        body: JSON.stringify({ details: 'Critical Red Flag Alert' })
      });

      if (res.status === 401) {
        handleSessionLoss();
        return;
      }
    } catch (e) {}

    // Add Emergency Token
    const emgTokenId = getNextSequentialTokenId('Emergency', queueTokens);
    const emgToken: QueueToken = {
      tokenId: emgTokenId,
      patientId: 'PHC-UP-84923',
      patientName: 'Gopal Yadav (Emergency)',
      age: 61,
      gender: 'Male',
      village: 'Sitapur PHC Circle',
      urgency: 'Emergency',
      category: 'RED',
      urgencyScore: 98,
      symptomsSummary: 'CRITICAL 108 ALERT: Severe trauma / chest pain reported',
      status: 'In Consult',
      assignedDoctor: 'Dr. Anita Roy (Emergency MO)',
      assignedRoom: 'Trauma Resuscitation Bay 1',
      estimatedWaitMinutes: 0,
      createdAt: new Date().toISOString(),
      triageResultId: 'trg_emg'
    };

    setQueueTokens(prev => [emgToken, ...prev]);
    setCurrentRole('queue');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col selection:bg-teal-500 selection:text-white">
      {/* Header Navigation */}
      <Header
        currentRole={currentRole}
        onRoleChange={handleRoleNavigation}
        language={language}
        onLanguageChange={setLanguage}
        isOnline={isOnline}
        onToggleOnline={() => setIsOnline(prev => !prev)}
        activeEmergencyCount={activeEmergencyCount}
        onTriggerEmergency={handleTriggerEmergencyAlert}
        currentUser={currentUser}
        onLogout={handleLogout}
        showLandingAuth={showLandingAuth}
        onGoToLogin={handleGoToLogin}
      />

      {/* Main Body View */}
      <main className="flex-1 p-4 sm:p-6 lg:p-8 text-white">
        
        {showLandingAuth ? (
          <LandingAuthView
            onLoginSuccess={handleLoginSuccess}
            language={language}
          />
        ) : (
          <>
            {/* 1. PATIENT PORTAL (Guarded: Only accessible by Patient accounts) */}
            {currentRole === 'patient' && (
              currentUser?.role === 'patient' ? (
                <PatientDashboardView
                  currentUser={currentUser}
                  queueTokens={queueTokens}
                  onTriageComplete={handleTriageComplete}
                  language={language}
                  activeCallSession={activeCallSession}
                  onClearActiveCallSession={() => setActiveCallSession(null)}
                />
              ) : (
                <AccessDeniedGuard
                  currentUser={currentUser}
                  attemptedRole="patient"
                  onReturnToAllowedPortal={() => setCurrentRole('doctor')}
                  onLogout={handleLogout}
                />
              )
            )}

            {/* 2. DOCTOR PORTAL (Guarded: Only accessible by Doctor accounts) */}
            {currentRole === 'doctor' && (
              currentUser?.role === 'doctor' ? (
                <DoctorDashboardView
                  currentUser={currentUser}
                  queueTokens={queueTokens}
                  onCallNext={handleCallNext}
                  onSelectPatientToConsult={handleSelectPatientToConsult}
                  onSavePrescription={handleSavePrescription}
                  language={language}
                />
              ) : (
                <AccessDeniedGuard
                  currentUser={currentUser}
                  attemptedRole="doctor"
                  onReturnToAllowedPortal={() => setCurrentRole('patient')}
                  onLogout={handleLogout}
                />
              )
            )}

            {/* 3. SHARED QUEUE MONITOR */}
            {currentRole === 'queue' && (
              <QueueManagementView
                queueTokens={queueTokens}
                onCallNext={handleCallNext}
                language={language}
              />
            )}
          </>
        )}

      </main>

      {/* Incoming Call Notification Modal for Patient */}
      {incomingCallSession && (
        <IncomingCallNotificationModal
          session={incomingCallSession}
          onAccept={() => {
            teleconsultService.respondToCall(incomingCallSession.id, true);
            setActiveCallSession(incomingCallSession);
            setIncomingCallSession(null);
            setCurrentRole('patient');
          }}
          onDecline={() => {
            teleconsultService.respondToCall(incomingCallSession.id, false);
            setIncomingCallSession(null);
          }}
        />
      )}

      {/* Footer */}
      <footer className="border-t border-slate-800 bg-slate-900 py-4 px-6 text-center text-xs text-slate-400">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>MediQ AI Symptom Triage & Teleconsultation Queue</span>
          <span className="text-teal-400 font-semibold">Dual Role-Based Flow (Patient & Doctor) + Live Queue & WebRTC</span>
        </div>
      </footer>
    </div>
  );
}

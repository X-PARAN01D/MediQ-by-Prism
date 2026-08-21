import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import {
  dbGetVideoCallRequests,
  dbGetVideoCallRequestById,
  dbInsertVideoCallRequest,
  dbUpdateVideoCallRequest,
  dbGetLiveCallSessions,
  dbGetLiveCallSessionById,
  dbInsertLiveCallSession,
  dbUpdateLiveCallSession,
  dbUpdateQueueTokenStatus,
  dbGetQueueTokenById,
  dbTransaction,
  withDbRetry,
  db
} from './db';

export interface LiveCallSession {
  id: string; // e.g. call_MOD-014_1730000000000
  tokenId: string;
  patientId: string;
  patientName: string;
  patientPhone?: string;
  doctorId: string;
  doctorName: string;
  doctorSpecialty?: string;
  doctorHospital?: string;
  status: 'ringing' | 'connected' | 'ended';
  startedAt?: number;
  endedAt?: number;
  createdAt: string;
}

export interface VideoCallRequest {
  id: string; // e.g. req_MOD-014_1730000000000
  tokenId: string;
  patientId: string;
  patientName: string;
  patientPhone?: string;
  age?: number;
  gender?: string;
  village?: string;
  symptomsSummary?: string;
  urgency?: 'Emergency' | 'Moderate' | 'Minor';
  vitals?: {
    bloodPressure?: string;
    pulseRate?: number;
    temperature?: number;
    spO2?: number;
  };
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled';
  rejectionReason?: string;
  requestedAt: string;
  acceptedByDoctor?: {
    doctorId: string;
    doctorName: string;
    doctorSpecialty?: string;
    doctorHospital?: string;
  };
  sessionId?: string;
}

interface SocketClient {
  ws: WebSocket;
  userId: string;
  role: 'patient' | 'doctor';
  name: string;
  phone?: string;
  patientId?: string;
  activeSessionId?: string;
}

// Connected WebSocket Clients (Live Network Connections)
const connectedClients = new Map<WebSocket, SocketClient>();

// ----------------------------------------------------
// Database-Backed Accessor Helpers (Single Source of Truth)
// ----------------------------------------------------

export function getPendingVideoCallRequests(): VideoCallRequest[] {
  return withDbRetry(() => {
    return dbGetVideoCallRequests().filter(r => r.status === 'pending');
  });
}

export function getVideoCallRequest(id: string): VideoCallRequest | null {
  return withDbRetry(() => {
    return dbGetVideoCallRequestById(id);
  });
}

export function getLiveCallSession(id: string): LiveCallSession | null {
  return withDbRetry(() => {
    return dbGetLiveCallSessionById(id);
  });
}

export function getActiveSessionForEntity(query: string): LiveCallSession | null {
  return withDbRetry(() => {
    const clean = query.trim().toLowerCase();
    const all = dbGetLiveCallSessions();
    return all.find(s =>
      s.status !== 'ended' && (
        s.id.toLowerCase() === clean ||
        s.patientId.toLowerCase() === clean ||
        s.doctorId.toLowerCase() === clean ||
        s.tokenId.toLowerCase() === clean ||
        s.patientName.toLowerCase() === clean ||
        (s.patientPhone && s.patientPhone.includes(clean))
      )
    ) || null;
  });
}

// ----------------------------------------------------
// WebSocket Teleconsultation Signaling Setup
// ----------------------------------------------------

export function setupTeleconsultSignaling(server: Server) {
  const wss = new WebSocketServer({ server, path: '/ws/teleconsult' });

  wss.on('connection', (ws: WebSocket) => {
    ws.on('message', (messageRaw: string) => {
      try {
        const msg = JSON.parse(messageRaw.toString());
        const { type } = msg;

        switch (type) {
          // 1. Client Registration
          case 'register': {
            const client: SocketClient = {
              ws,
              userId: msg.userId || `user_${Date.now()}`,
              role: msg.role || 'patient',
              name: msg.name || 'Anonymous User',
              phone: msg.phone ? String(msg.phone).replace(/\D/g, '').slice(-10) : undefined,
              patientId: msg.patientId
            };
            connectedClients.set(ws, client);
            
            // Check SQLite if there is an active ringing/connected call for this patient or doctor
            const activeSessions = dbGetLiveCallSessions().filter(s => s.status !== 'ended');
            for (const session of activeSessions) {
              const isMatchingPatient = 
                (client.patientId && session.patientId === client.patientId) ||
                (client.phone && session.patientPhone && client.phone === session.patientPhone) ||
                (session.patientName.toLowerCase() === client.name.toLowerCase());
              
              const isMatchingDoctor = session.doctorId === client.userId || session.doctorName.toLowerCase() === client.name.toLowerCase();

              if (isMatchingPatient && (session.status === 'ringing' || session.status === 'connected')) {
                client.activeSessionId = session.id;
                ws.send(JSON.stringify({
                  type: session.status === 'connected' ? 'call:connected' : 'call:incoming',
                  session
                }));
              } else if (isMatchingDoctor && (session.status === 'ringing' || session.status === 'connected')) {
                client.activeSessionId = session.id;
              }
            }

            // Send pending requests directly from SQLite to doctor on connect
            if (client.role === 'doctor') {
              const pending = getPendingVideoCallRequests();
              ws.send(JSON.stringify({
                type: 'call:requests_list',
                requests: pending
              }));
            }

            // Send status of existing request to patient directly from SQLite
            if (client.role === 'patient') {
              const allReqs = dbGetVideoCallRequests();
              const existingReq = allReqs.find(
                r => (client.patientId && r.patientId === client.patientId) ||
                     (client.phone && r.patientPhone && r.patientPhone === client.phone) ||
                     (client.name && r.patientName.toLowerCase() === client.name.toLowerCase())
              );
              if (existingReq) {
                ws.send(JSON.stringify({
                  type: 'call:request_status_changed',
                  request: existingReq
                }));
              }
            }

            ws.send(JSON.stringify({
              type: 'registered',
              userId: client.userId,
              role: client.role
            }));
            break;
          }

          // 2. Fetch pending requests (for Doctors) - Read directly from DB
          case 'call:fetch_requests': {
            const pending = getPendingVideoCallRequests();
            ws.send(JSON.stringify({
              type: 'call:requests_list',
              requests: pending
            }));
            break;
          }

          // 3. Patient creates a Video Call Request (Persisted atomically to DB)
          case 'call:request': {
            const { tokenId, patientId, patientName, patientPhone, age, gender, village, symptomsSummary, urgency, vitals } = msg;
            
            if (!patientName || !patientPhone) {
              ws.send(JSON.stringify({ type: 'error', message: 'Patient name and phone are required to request a teleconsult call.' }));
              return;
            }

            const reqId = `req_${tokenId || 'GEN'}_${Date.now()}`;
            const newRequest: VideoCallRequest = {
              id: reqId,
              tokenId: tokenId || `TOK-${Date.now().toString().slice(-4)}`,
              patientId: patientId || `P-${Date.now().toString().slice(-5)}`,
              patientName: patientName,
              patientPhone: String(patientPhone).replace(/\D/g, '').slice(-10),
              age: Number(age) || 30,
              gender: gender || 'Other',
              village: village || 'Local Sub-Center',
              symptomsSummary: symptomsSummary || 'Seeking doctor teleconsultation',
              urgency: urgency || 'Moderate',
              vitals: vitals || {
                bloodPressure: '120/80',
                pulseRate: 78,
                temperature: 98.6,
                spO2: 98
              },
              status: 'pending',
              requestedAt: new Date().toISOString()
            };

            // Write to SQLite
            dbInsertVideoCallRequest(newRequest);

            // Confirm to Patient
            ws.send(JSON.stringify({
              type: 'call:request_created',
              request: newRequest
            }));

            // Broadcast new request & updated list directly from DB to all Doctors
            broadcastToRole('doctor', {
              type: 'call:incoming_request',
              request: newRequest
            });

            const pendingList = getPendingVideoCallRequests();
            broadcastToRole('doctor', {
              type: 'call:requests_list',
              requests: pendingList
            });
            break;
          }

          // 4. Doctor ACCEPTS Call Request (Atomic Multi-Table DB Transaction)
          case 'call:accept_request': {
            const client = connectedClients.get(ws);
            if (!client || client.role !== 'doctor') {
              ws.send(JSON.stringify({ type: 'error', message: 'Unauthorized. Only doctors can accept incoming teleconsult calls.' }));
              return;
            }

            const { requestId, doctorId, doctorName, doctorSpecialty, doctorHospital } = msg;
            
            const req = getVideoCallRequest(requestId);
            if (!req) {
              ws.send(JSON.stringify({ type: 'error', message: 'Call request not found.' }));
              return;
            }

            const sessionId = `call_${req.tokenId}_${Date.now()}`;
            const acceptedByDoctor = {
              doctorId: doctorId || client?.userId || 'doc_on_duty',
              doctorName: doctorName || client?.name || 'On-Duty Medical Officer',
              doctorSpecialty: doctorSpecialty || 'General Medical Officer',
              doctorHospital: doctorHospital || 'Primary Health Centre'
            };

            const session: LiveCallSession = {
              id: sessionId,
              tokenId: req.tokenId,
              patientId: req.patientId,
              patientName: req.patientName,
              patientPhone: req.patientPhone,
              doctorId: acceptedByDoctor.doctorId,
              doctorName: acceptedByDoctor.doctorName,
              doctorSpecialty: acceptedByDoctor.doctorSpecialty,
              doctorHospital: acceptedByDoctor.doctorHospital,
              status: 'connected',
              startedAt: Date.now(),
              createdAt: new Date().toISOString()
            };

            req.status = 'accepted';
            req.acceptedByDoctor = acceptedByDoctor;
            req.sessionId = sessionId;

            // Execute all updates in a single strict SQLite Transaction
            dbTransaction(() => {
              dbUpdateVideoCallRequest(req);
              dbInsertLiveCallSession(session);
              dbUpdateQueueTokenStatus(req.tokenId, 'In Consult', acceptedByDoctor.doctorName);
            });
            
            if (client) client.activeSessionId = sessionId;

            // Notify Doctor that session is connected & ready for WebRTC
            ws.send(JSON.stringify({
              type: 'call:connected',
              session,
              request: req
            }));

            // Notify Patient that call is accepted & connected
            for (const [targetWs, targetClient] of connectedClients.entries()) {
              if (targetClient.role === 'patient') {
                const isTarget =
                  (targetClient.patientId && targetClient.patientId === req.patientId) ||
                  (targetClient.phone && req.patientPhone && targetClient.phone === req.patientPhone) ||
                  (targetClient.name.toLowerCase() === req.patientName.toLowerCase());

                if (isTarget && targetWs.readyState === WebSocket.OPEN) {
                  targetClient.activeSessionId = sessionId;
                  targetWs.send(JSON.stringify({
                    type: 'call:connected',
                    session,
                    request: req
                  }));
                }
              }
            }

            // Broadcast updated pending requests list from DB to all doctors
            broadcastToRole('doctor', {
              type: 'call:requests_list',
              requests: getPendingVideoCallRequests()
            });
            break;
          }

          // 5. Doctor REJECTS Call Request
          case 'call:reject_request': {
            const client = connectedClients.get(ws);
            if (!client || client.role !== 'doctor') {
              ws.send(JSON.stringify({ type: 'error', message: 'Unauthorized. Only doctors can decline incoming teleconsult calls.' }));
              return;
            }

            const { requestId, reason, doctorName } = msg;
            const req = getVideoCallRequest(requestId);
            if (!req) {
              ws.send(JSON.stringify({ type: 'error', message: 'Call request not found.' }));
              return;
            }

            req.status = 'rejected';
            req.rejectionReason = reason || 'Doctor is currently occupied with an emergency triage. Please visit the PHC or re-request.';
            
            dbUpdateVideoCallRequest(req);

            // Notify Patient that request was rejected/declined
            for (const [targetWs, targetClient] of connectedClients.entries()) {
              if (targetClient.role === 'patient') {
                const isTarget =
                  (targetClient.patientId && targetClient.patientId === req.patientId) ||
                  (targetClient.phone && req.patientPhone && targetClient.phone === req.patientPhone) ||
                  (targetClient.name.toLowerCase() === req.patientName.toLowerCase());

                if (isTarget && targetWs.readyState === WebSocket.OPEN) {
                  targetWs.send(JSON.stringify({
                    type: 'call:rejected',
                    requestId,
                    reason: req.rejectionReason,
                    doctorName: doctorName || 'Primary Health Centre Doctor'
                  }));
                }
              }
            }

            // Confirm to Doctor and update pending list
            ws.send(JSON.stringify({
              type: 'call:request_rejected_ack',
              requestId
            }));

            broadcastToRole('doctor', {
              type: 'call:requests_list',
              requests: getPendingVideoCallRequests()
            });
            break;
          }

          // 6. Patient CANCELS Call Request
          case 'call:cancel_request': {
            const { requestId } = msg;
            const req = getVideoCallRequest(requestId);
            if (req) {
              req.status = 'cancelled';
              dbUpdateVideoCallRequest(req);
            }

            ws.send(JSON.stringify({
              type: 'call:request_cancelled_ack',
              requestId
            }));

            broadcastToRole('doctor', {
              type: 'call:requests_list',
              requests: getPendingVideoCallRequests()
            });
            break;
          }

          // 7. Doctor Direct Call Initiation (Outbound call to queue token)
          case 'call:initiate': {
            const client = connectedClients.get(ws);
            if (!client || client.role !== 'doctor') {
              ws.send(JSON.stringify({ type: 'error', message: 'Only authorized doctors can initiate consultations.' }));
              return;
            }

            const { tokenId, doctorId, doctorName, doctorSpecialty, doctorHospital, patientId, patientName, patientPhone } = msg;
            if (!tokenId) {
              ws.send(JSON.stringify({ type: 'error', message: 'tokenId is required to initiate call.' }));
              return;
            }

            // Look up DB token to ensure we have complete and accurate patient info
            const dbToken = dbGetQueueTokenById(tokenId);

            const effectivePatientId = patientId || dbToken?.patient_id || `P-${Date.now().toString().slice(-5)}`;
            const effectivePatientName = patientName || dbToken?.patient_name || 'Patient';
            const rawPhone = patientPhone || (dbToken ? (dbToken.contact_number || dbToken.phone) : undefined);
            const effectivePatientPhone = rawPhone ? String(rawPhone).replace(/\D/g, '').slice(-10) : undefined;

            const docName = doctorName || client.name || 'Medical Officer';
            const sessionId = `call_${tokenId}_${Date.now()}`;
            const session: LiveCallSession = {
              id: sessionId,
              tokenId: tokenId,
              patientId: effectivePatientId,
              patientName: effectivePatientName,
              patientPhone: effectivePatientPhone,
              doctorId: doctorId || client.userId,
              doctorName: docName,
              doctorSpecialty: doctorSpecialty || 'General Medical Officer',
              doctorHospital: doctorHospital || 'Primary Health Centre',
              status: 'ringing',
              createdAt: new Date().toISOString()
            };

            // Atomic save to SQLite
            dbTransaction(() => {
              dbUpdateQueueTokenStatus(tokenId, 'In Consult', docName);
              dbInsertLiveCallSession(session);
            });

            client.activeSessionId = sessionId;

            // Notify Doctor that call is ringing
            ws.send(JSON.stringify({
              type: 'call:ringing',
              session
            }));

            // Find Patient's WebSocket connection(s) and notify
            let patientNotified = false;
            for (const [targetWs, targetClient] of connectedClients.entries()) {
              if (targetClient.role === 'patient') {
                const targetPatientId = (targetClient.patientId || '').trim().toLowerCase();
                const targetUserId = (targetClient.userId || '').trim().toLowerCase();
                const targetName = (targetClient.name || '').trim().toLowerCase();
                const targetPhone = targetClient.phone ? String(targetClient.phone).replace(/\D/g, '').slice(-10) : '';

                const sessPatientId = (session.patientId || '').trim().toLowerCase();
                const sessName = (session.patientName || '').trim().toLowerCase();
                const sessPhone = session.patientPhone ? String(session.patientPhone).replace(/\D/g, '').slice(-10) : '';

                const isTarget = 
                  (targetPatientId && sessPatientId && targetPatientId === sessPatientId) ||
                  (targetUserId && sessPatientId && targetUserId === sessPatientId) ||
                  (targetPhone && sessPhone && targetPhone === sessPhone) ||
                  (targetName && sessName && (targetName === sessName || targetName.includes(sessName) || sessName.includes(targetName)));

                if (isTarget && targetWs.readyState === WebSocket.OPEN) {
                  targetClient.activeSessionId = sessionId;
                  targetWs.send(JSON.stringify({
                    type: 'call:incoming',
                    session
                  }));
                  patientNotified = true;
                }
              }
            }

            // Fallback: Notify calling doctor if the specific target patient is not connected
            if (!patientNotified) {
              ws.send(JSON.stringify({
                type: 'call:patient_offline',
                message: `Patient ${session.patientName} (${session.tokenId}) is not currently connected to live teleconsultation.`
              }));
            }
            break;
          }

          // 8. Patient Responds to Inbound Call (Accept / Decline)
          case 'call:respond': {
            const { sessionId, accept } = msg;
            const session = getLiveCallSession(sessionId);
            if (!session) {
              ws.send(JSON.stringify({ type: 'error', message: 'Call session not found or already ended.' }));
              return;
            }

            const client = connectedClients.get(ws);
            if (client) client.activeSessionId = sessionId;

            if (accept) {
              session.status = 'connected';
              session.startedAt = Date.now();
              dbUpdateLiveCallSession(session);

              // Notify both parties that call is connected
              broadcastToSession(sessionId, {
                type: 'call:connected',
                session
              });
            } else {
              session.status = 'ended';
              session.endedAt = Date.now();
              dbUpdateLiveCallSession(session);

              broadcastToSession(sessionId, {
                type: 'call:rejected',
                sessionId,
                reason: 'Patient declined or unavailable'
              });
            }
            break;
          }

          // 9. WebRTC Signaling: Offer
          case 'webrtc:offer': {
            const { sessionId, sdp } = msg;
            forwardToPeer(ws, sessionId, {
              type: 'webrtc:offer',
              sessionId,
              sdp
            });
            break;
          }

          // 10. WebRTC Signaling: Answer
          case 'webrtc:answer': {
            const { sessionId, sdp } = msg;
            forwardToPeer(ws, sessionId, {
              type: 'webrtc:answer',
              sessionId,
              sdp
            });
            break;
          }

          // 11. WebRTC Signaling: ICE Candidate
          case 'webrtc:ice': {
            const { sessionId, candidate } = msg;
            forwardToPeer(ws, sessionId, {
              type: 'webrtc:ice',
              sessionId,
              candidate
            });
            break;
          }

          // 12. End Call
          case 'call:end': {
            const { sessionId } = msg;
            const session = getLiveCallSession(sessionId);
            if (session) {
              session.status = 'ended';
              session.endedAt = Date.now();
              dbUpdateLiveCallSession(session);
            }

            broadcastToSession(sessionId, {
              type: 'call:ended',
              sessionId
            });
            break;
          }

          // 13. Real-Time Queue Update Broadcast Notification
          case 'queue:update_needed': {
            broadcastToAll({
              type: 'queue:update_needed',
              timestamp: Date.now()
            });
            break;
          }

          // Heartbeat Ping
          case 'ping': {
            ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
            break;
          }

          default:
            break;
        }
      } catch (err) {
        console.error('[Teleconsult WS Error]:', err);
      }
    });

    ws.on('close', () => {
      connectedClients.delete(ws);
    });
  });

  // Helper: Broadcast to all connected clients
  function broadcastToAll(payload: any) {
    for (const [clientWs] of connectedClients.entries()) {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify(payload));
      }
    }
  }

  // Helper: Broadcast to specific role (e.g. 'doctor')
  function broadcastToRole(role: 'patient' | 'doctor', payload: any) {
    for (const [clientWs, client] of connectedClients.entries()) {
      if (client.role === role && clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify(payload));
      }
    }
  }

  // Helper: Broadcast to all sockets attached to this call session
  function broadcastToSession(sessionId: string, payload: any) {
    const session = getLiveCallSession(sessionId);
    if (!session) return;

    for (const [clientWs, client] of connectedClients.entries()) {
      if (clientWs.readyState === WebSocket.OPEN) {
        const isParticipant =
          client.activeSessionId === sessionId ||
          client.userId === session.doctorId ||
          client.patientId === session.patientId ||
          client.name.toLowerCase() === session.patientName.toLowerCase() ||
          client.name.toLowerCase() === session.doctorName.toLowerCase();

        if (isParticipant) {
          clientWs.send(JSON.stringify(payload));
        }
      }
    }
  }

  // Helper: Forward message to the other peer in session
  function forwardToPeer(senderWs: WebSocket, sessionId: string, payload: any) {
    const session = getLiveCallSession(sessionId);
    if (!session) return;

    for (const [clientWs, client] of connectedClients.entries()) {
      if (clientWs !== senderWs && clientWs.readyState === WebSocket.OPEN) {
        const isParticipant =
          client.activeSessionId === sessionId ||
          client.userId === session.doctorId ||
          client.patientId === session.patientId ||
          client.name.toLowerCase() === session.patientName.toLowerCase() ||
          client.name.toLowerCase() === session.doctorName.toLowerCase();

        if (isParticipant) {
          clientWs.send(JSON.stringify(payload));
        }
      }
    }
  }

  console.log('[Teleconsult Signaling] WebSocket server initialized on /ws/teleconsult (Direct SQLite Persistence Active)');
  return { wss };
}

import { QueueToken } from '../types';

export interface TeleconsultSession {
  id: string;
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
  id: string;
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

type EventCallback = (...args: any[]) => void;

class TeleconsultService {
  private ws: WebSocket | null = null;
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private currentSession: TeleconsultSession | null = null;
  private currentRequest: VideoCallRequest | null = null;
  private pendingRequests: VideoCallRequest[] = [];
  private registeredUser: { userId: string; role: 'patient' | 'doctor'; name: string; patientId?: string; phone?: string } | null = null;
  private listeners: Map<string, Set<EventCallback>> = new Map();
  private isMuted = false;
  private isVideoOff = false;
  private isSyntheticMedia = false;
  private heartbeatInterval: any = null;
  private mediaSetupPromise: Promise<MediaStream> | null = null;
  private pendingIceCandidates: RTCIceCandidateInit[] = [];

  private rtcConfig: RTCConfiguration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' }
    ]
  };

  /**
   * Helper to return standard JSON headers + Bearer authorization token
   */
  private getAuthHeaders(): Record<string, string> {
    const token = localStorage.getItem('mediq_token') || '';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  /**
   * Handle 401 Session loss gracefully across teleconsult services
   */
  private handleAuthError(res: Response) {
    if (res.status === 401) {
      console.warn('[Teleconsult] 401 Unauthorized encountered. Dispatching session loss.');
      localStorage.removeItem('mediq_token');
      window.dispatchEvent(new CustomEvent('mediq:unauthorized'));
    }
  }

  // Event Subscription
  public on(event: string, callback: EventCallback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
    return () => this.off(event, callback);
  }

  public off(event: string, callback: EventCallback) {
    this.listeners.get(event)?.delete(callback);
  }

  private emit(event: string, ...args: any[]) {
    this.listeners.get(event)?.forEach(cb => {
      try {
        cb(...args);
      } catch (err) {
        console.error(`Error in event listener for ${event}:`, err);
      }
    });
  }

  // Connect to WebSocket Signaling Server
  public connect(user: { userId: string; role: 'patient' | 'doctor'; name: string; patientId?: string; phone?: string }) {
    this.registeredUser = user;

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      this.registerWithServer();
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/teleconsult`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('[Teleconsult] WebSocket Connected to Signaling Server');
        this.registerWithServer();
        this.emit('socket:connected');

        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = setInterval(() => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 20000);
      };

      this.ws.onmessage = async (event) => {
        try {
          const msg = JSON.parse(event.data);
          await this.handleSignalingMessage(msg);
        } catch (err) {
          console.error('[Teleconsult] Error parsing WS message:', err);
        }
      };

      this.ws.onclose = () => {
        console.log('[Teleconsult] WebSocket Disconnected. Reconnecting in 3s...');
        this.emit('socket:disconnected');
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
        setTimeout(() => {
          if (this.registeredUser) this.connect(this.registeredUser);
        }, 3000);
      };

      this.ws.onerror = (err) => {
        console.warn('[Teleconsult WS Error]:', err);
      };
    } catch (e) {
      console.error('[Teleconsult] Failed to initiate WebSocket:', e);
    }
  }

  private registerWithServer() {
    if (this.ws?.readyState === WebSocket.OPEN && this.registeredUser) {
      this.ws.send(JSON.stringify({
        type: 'register',
        ...this.registeredUser
      }));
    }
  }

  // Handle incoming signaling messages
  private async handleSignalingMessage(msg: any) {
    const { type } = msg;

    switch (type) {
      // 1. Pending Requests List (for Doctor)
      case 'call:requests_list': {
        this.pendingRequests = msg.requests || [];
        this.emit('requests:updated', this.pendingRequests);
        break;
      }

      // 2. New incoming call request (for Doctor)
      case 'call:incoming_request': {
        const req: VideoCallRequest = msg.request;
        if (!this.pendingRequests.some(r => r.id === req.id)) {
          this.pendingRequests = [req, ...this.pendingRequests];
        }
        this.emit('request:incoming', req);
        this.emit('requests:updated', this.pendingRequests);
        this.playNotificationChime();
        break;
      }

      // 3. Request Created Confirmation (for Patient)
      case 'call:request_created': {
        this.currentRequest = msg.request;
        this.emit('request:created', msg.request);
        this.emit('request:status_changed', msg.request);
        break;
      }

      // 4. Request Status Changed
      case 'call:request_status_changed': {
        this.currentRequest = msg.request;
        this.emit('request:status_changed', msg.request);
        break;
      }

      // 5. Inbound Direct Call from Doctor
      case 'call:incoming': {
        this.currentSession = msg.session;
        this.emit('call:incoming', msg.session);
        this.playNotificationChime();
        break;
      }

      case 'call:ringing': {
        this.currentSession = msg.session;
        this.emit('call:ringing', msg.session);
        break;
      }

      // 6. Connected Call Session (when Doctor Accepts request or Patient Accepts call)
      case 'call:connected': {
        this.currentSession = msg.session;
        if (msg.request) {
          this.currentRequest = msg.request;
        }
        // Remove from pending list
        this.pendingRequests = this.pendingRequests.filter(r => r.sessionId !== msg.session.id && r.id !== msg.request?.id);
        this.emit('requests:updated', this.pendingRequests);
        this.emit('call:connected', msg.session);

        // Doctor initiates WebRTC offer
        if (this.registeredUser?.role === 'doctor') {
          await this.initiateWebRTCOffer();
        }
        break;
      }

      // 7. Call Request Declined / Rejected
      case 'call:rejected': {
        if (this.currentRequest) {
          this.currentRequest = {
            ...this.currentRequest,
            status: 'rejected',
            rejectionReason: msg.reason || 'Doctor is unavailable or in emergency triage.'
          };
          this.emit('request:status_changed', this.currentRequest);
        }
        this.emit('call:rejected', msg);
        this.cleanupCallState();
        break;
      }

      // 8. Call Ended
      case 'call:ended': {
        this.emit('call:ended', msg);
        this.cleanupCallState();
        break;
      }

      // 9. WebRTC SDP Offer / Answer / ICE
      case 'webrtc:offer': {
        await this.handleWebRTCOffer(msg.sdp);
        break;
      }

      case 'webrtc:answer': {
        await this.handleWebRTCAnswer(msg.sdp);
        break;
      }

      case 'webrtc:ice': {
        await this.handleRemoteIceCandidate(msg.candidate);
        break;
      }

      // 10. Queue Synchronization Notification
      case 'queue:update_needed': {
        this.emit('queue:update_needed', msg);
        break;
      }

      default:
        break;
    }
  }

  /**
   * Broadcast a queue update notification across connected WebSockets
   */
  public notifyQueueUpdate() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'queue:update_needed', timestamp: Date.now() }));
    } else {
      // Emit locally if socket is offline/disconnected
      this.emit('queue:update_needed', { type: 'queue:update_needed', timestamp: Date.now() });
    }
  }

  // --- Patient Side: Request a Video Call ---
  public async requestVideoCall(data: {
    tokenId?: string;
    patientId?: string;
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
  }): Promise<VideoCallRequest> {
    const payload = {
      type: 'call:request',
      tokenId: data.tokenId || 'MOD-014',
      patientId: data.patientId || this.registeredUser?.patientId || `P-${Date.now().toString().slice(-5)}`,
      patientName: data.patientName || this.registeredUser?.name || 'Sunita Devi',
      patientPhone: data.patientPhone || this.registeredUser?.phone || '9876543210',
      age: data.age || 48,
      gender: data.gender || 'Female',
      village: data.village || 'Rampur Village',
      symptomsSummary: data.symptomsSummary || 'Seeking doctor teleconsultation',
      urgency: data.urgency || 'Moderate',
      vitals: data.vitals || {
        bloodPressure: '128/84',
        pulseRate: 92,
        temperature: 102.5,
        spO2: 96
      }
    };

    // Prepare local media stream in background so connection is fast upon accept
    this.setupLocalMediaStream().catch(err => console.warn('Stream setup:', err));

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }

    // Call REST endpoint
    try {
      const res = await fetch('/api/teleconsult/request', {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(payload)
      });
      if (res.status === 401) {
        this.handleAuthError(res);
      }
      const resData = await res.json();
      if (resData.request) {
        this.currentRequest = resData.request;
        this.emit('request:created', resData.request);
        this.emit('request:status_changed', resData.request);
        return resData.request;
      }
    } catch (e) {
      console.warn('REST request fallback failed:', e);
    }

    const fallbackRequest: VideoCallRequest = {
      id: `req_${payload.tokenId}_${Date.now()}`,
      tokenId: payload.tokenId,
      patientId: payload.patientId,
      patientName: payload.patientName,
      patientPhone: payload.patientPhone,
      age: payload.age,
      gender: payload.gender,
      village: payload.village,
      symptomsSummary: payload.symptomsSummary,
      urgency: payload.urgency as any,
      vitals: payload.vitals,
      status: 'pending',
      requestedAt: new Date().toISOString()
    };
    this.currentRequest = fallbackRequest;
    this.emit('request:created', fallbackRequest);
    return fallbackRequest;
  }

  // --- Patient Side: Cancel Request ---
  public async cancelVideoCallRequest(requestId?: string) {
    const id = requestId || this.currentRequest?.id;
    if (!id) return;

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'call:cancel_request',
        requestId: id
      }));
    }

    try {
      const res = await fetch('/api/teleconsult/cancel', {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ requestId: id })
      });
      if (res.status === 401) {
        this.handleAuthError(res);
      }
    } catch (e) {
      // ignore
    }

    if (this.currentRequest && this.currentRequest.id === id) {
      this.currentRequest = { ...this.currentRequest, status: 'cancelled' };
      this.emit('request:status_changed', this.currentRequest);
    }
  }

  // --- Doctor Side: Fetch Pending Requests ---
  public async fetchPendingRequests(): Promise<VideoCallRequest[]> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'call:fetch_requests' }));
    }

    try {
      const res = await fetch('/api/teleconsult/requests', {
        headers: this.getAuthHeaders()
      });
      if (res.status === 401) {
        this.handleAuthError(res);
        return [];
      }
      const data = await res.json();
      if (data.pendingRequests) {
        this.pendingRequests = data.pendingRequests;
        this.emit('requests:updated', this.pendingRequests);
        return data.pendingRequests;
      }
    } catch (err) {
      console.warn('Failed to fetch pending teleconsult requests:', err);
    }
    return this.pendingRequests;
  }

  // --- Doctor Side: Accept a Call Request ---
  public async acceptCallRequest(
    requestId: string,
    doctorInfo?: { doctorId?: string; doctorName?: string; doctorSpecialty?: string; doctorHospital?: string }
  ) {
    await this.setupLocalMediaStream();

    const doctorData = {
      doctorId: doctorInfo?.doctorId || this.registeredUser?.userId || 'doc_suresh_verma',
      doctorName: doctorInfo?.doctorName || this.registeredUser?.name || 'Dr. Suresh Verma',
      doctorSpecialty: doctorInfo?.doctorSpecialty || 'General Medical Officer',
      doctorHospital: doctorInfo?.doctorHospital || 'Rampur Primary Health Centre'
    };

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'call:accept_request',
        requestId,
        ...doctorData
      }));
    }

    try {
      const res = await fetch('/api/teleconsult/accept', {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({
          requestId,
          ...doctorData
        })
      });
      if (res.status === 401) {
        this.handleAuthError(res);
        return;
      }
      const data = await res.json();
      if (data.session) {
        this.currentSession = data.session;
        this.pendingRequests = this.pendingRequests.filter(r => r.id !== requestId);
        this.emit('requests:updated', this.pendingRequests);
        this.emit('call:connected', data.session);
        await this.initiateWebRTCOffer();
      }
    } catch (err) {
      console.warn('Error accepting call request via REST:', err);
    }
  }

  // --- Doctor Side: Reject a Call Request ---
  public async rejectCallRequest(requestId: string, reason?: string, doctorName?: string) {
    const rReason = reason || 'Doctor is currently occupied with emergency cases.';
    const dName = doctorName || this.registeredUser?.name || 'Dr. Suresh Verma';

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'call:reject_request',
        requestId,
        reason: rReason,
        doctorName: dName
      }));
    }

    try {
      const res = await fetch('/api/teleconsult/reject', {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({
          requestId,
          reason: rReason,
          doctorName: dName
        })
      });
      if (res.status === 401) {
        this.handleAuthError(res);
      }
    } catch (err) {
      // ignore
    }

    this.pendingRequests = this.pendingRequests.filter(r => r.id !== requestId);
    this.emit('requests:updated', this.pendingRequests);
  }

  // --- Doctor Side: Outbound Call Initiation ---
  public async initiateCall(token: QueueToken, doctorHospital = 'Rampur Primary Health Centre') {
    if (!this.registeredUser || this.registeredUser.role !== 'doctor') {
      throw new Error('Only doctors can initiate teleconsultation.');
    }

    await this.setupLocalMediaStream();

    const callPayload = {
      type: 'call:initiate',
      tokenId: token.tokenId,
      patientId: token.patientId,
      patientName: token.patientName,
      doctorId: this.registeredUser.userId,
      doctorName: this.registeredUser.name,
      doctorSpecialty: 'Medical Officer (In-Charge)',
      doctorHospital
    };

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(callPayload));
    } else {
      const res = await fetch('/api/teleconsult/initiate', {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(callPayload)
      });
      if (res.status === 401) {
        this.handleAuthError(res);
        return;
      }
      const data = await res.json();
      if (data.session) {
        this.currentSession = data.session;
        this.emit('call:ringing', data.session);
      }
    }
  }

  // --- Patient Side: Respond to Direct Inbound Call ---
  public async respondToCall(sessionId: string, accept: boolean) {
    if (accept) {
      await this.setupLocalMediaStream();
    }

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'call:respond',
        sessionId,
        accept
      }));
    } else {
      const res = await fetch('/api/teleconsult/respond', {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ sessionId, accept })
      });
      if (res.status === 401) {
        this.handleAuthError(res);
      }
    }

    if (!accept) {
      this.cleanupCallState();
    }
  }

  // --- End Call ---
  public async endCall() {
    const sessionId = this.currentSession?.id;
    const tokenId = this.currentSession?.tokenId;

    if (sessionId && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'call:end',
        sessionId
      }));
    }

    try {
      const res = await fetch('/api/teleconsult/end', {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ sessionId, tokenId })
      });
      if (res.status === 401) {
        this.handleAuthError(res);
      }
    } catch (e) {
      // ignore
    }

    this.cleanupCallState();
    this.emit('call:ended', { sessionId });
  }

  // Check if local media stream exists and has active tracks
  private hasActiveLocalTracks(): boolean {
    if (!this.localStream) return false;
    const tracks = this.localStream.getTracks();
    return tracks.length > 0 && tracks.some(t => t.readyState === 'live');
  }

  // Setup Local Media Stream (Physical camera/mic with animated fallback)
  public async setupLocalMediaStream(): Promise<MediaStream> {
    if (this.localStream && this.hasActiveLocalTracks()) {
      return this.localStream;
    }
    if (this.mediaSetupPromise) {
      return this.mediaSetupPromise;
    }

    this.mediaSetupPromise = (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            facingMode: 'user'
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true
          }
        });
        const oldStream = this.localStream;
        this.localStream = stream;
        this.isSyntheticMedia = false;
        this.emit('media:local-stream', stream);

        if (this.peerConnection) {
          await this.replaceLocalStreamTracks(stream);
        }

        if (oldStream && oldStream !== stream) {
          oldStream.getTracks().forEach(t => t.stop());
        }

        return stream;
      } catch (err) {
        console.warn('[Teleconsult] Camera/Mic access denied or unavailable. Generating fallback synthetic stream:', err);
        const canvasStream = this.createSyntheticMediaStream();
        const oldStream = this.localStream;
        this.localStream = canvasStream;
        this.isSyntheticMedia = true;
        this.emit('media:local-stream', canvasStream);

        if (this.peerConnection) {
          await this.replaceLocalStreamTracks(canvasStream);
        }

        if (oldStream && oldStream !== canvasStream) {
          oldStream.getTracks().forEach(t => t.stop());
        }

        return canvasStream;
      } finally {
        this.mediaSetupPromise = null;
      }
    })();

    return this.mediaSetupPromise;
  }

  /**
   * Replaces tracks on existing RTCRtpSender instances or adds tracks if not already present
   */
  public async replaceLocalStreamTracks(newStream: MediaStream): Promise<void> {
    if (!this.peerConnection) return;
    try {
      const senders = this.peerConnection.getSenders();
      const newVideoTrack = newStream.getVideoTracks()[0];
      const newAudioTrack = newStream.getAudioTracks()[0];

      // Handle video track replacement
      const videoSender = senders.find(s => s.track?.kind === 'video' || (s as any).kind === 'video');
      if (videoSender && newVideoTrack) {
        await videoSender.replaceTrack(newVideoTrack).catch(err => {
          console.warn('[Teleconsult] replaceTrack video error:', err);
        });
      } else if (newVideoTrack && !videoSender) {
        this.peerConnection.addTrack(newVideoTrack, newStream);
      }

      // Handle audio track replacement
      const audioSender = senders.find(s => s.track?.kind === 'audio' || (s as any).kind === 'audio');
      if (audioSender && newAudioTrack) {
        await audioSender.replaceTrack(newAudioTrack).catch(err => {
          console.warn('[Teleconsult] replaceTrack audio error:', err);
        });
      } else if (newAudioTrack && !audioSender) {
        this.peerConnection.addTrack(newAudioTrack, newStream);
      }
    } catch (err) {
      console.warn('[Teleconsult] Error replacing local stream tracks:', err);
    }
  }

  // Synthetic Media Stream Generator
  private createSyntheticMediaStream(): MediaStream {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');

    let frameCount = 0;
    const isDoc = this.registeredUser?.role === 'doctor';
    const labelName = this.registeredUser?.name || (isDoc ? 'Dr. Suresh Verma' : 'Patient Video Feed');

    const drawFrame = () => {
      if (!ctx) return;
      frameCount++;

      const grad = ctx.createLinearGradient(0, 0, 640, 480);
      if (isDoc) {
        grad.addColorStop(0, '#1e1b4b');
        grad.addColorStop(1, '#0f172a');
      } else {
        grad.addColorStop(0, '#042f2e');
        grad.addColorStop(1, '#0f172a');
      }
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 640, 480);

      const pulseSize = 90 + Math.sin(frameCount * 0.08) * 15;
      ctx.beginPath();
      ctx.arc(320, 210, pulseSize, 0, Math.PI * 2);
      ctx.strokeStyle = isDoc ? 'rgba(99, 102, 241, 0.4)' : 'rgba(20, 184, 166, 0.4)';
      ctx.lineWidth = 4;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(320, 210, 75, 0, Math.PI * 2);
      ctx.fillStyle = isDoc ? '#4338ca' : '#0f766e';
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 50px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(isDoc ? '👨‍⚕️' : '👤', 320, 210);

      ctx.font = 'bold 22px sans-serif';
      ctx.fillText(labelName, 320, 330);

      ctx.font = '14px sans-serif';
      ctx.fillStyle = isDoc ? '#a5b4fc' : '#5eead4';
      ctx.fillText(isDoc ? 'Doctor Teleconsult Desk • Live HD' : 'Patient Remote Booth • Live HD', 320, 360);

      requestAnimationFrame(drawFrame);
    };

    drawFrame();

    const videoStream = canvas.captureStream(30);

    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      gain.gain.value = 0.001;
      osc.connect(gain);
      const dst = audioCtx.createMediaStreamDestination();
      gain.connect(dst);
      osc.start();

      const audioTrack = dst.stream.getAudioTracks()[0];
      if (audioTrack) {
        videoStream.addTrack(audioTrack);
      }
    } catch (e) {
      console.warn('AudioContext not available');
    }

    return videoStream;
  }

  // Setup WebRTC Peer Connection
  private createPeerConnection(): RTCPeerConnection {
    if (this.peerConnection) {
      try {
        this.peerConnection.close();
      } catch (e) {
        // ignore
      }
      this.peerConnection = null;
    }

    const pc = new RTCPeerConnection(this.rtcConfig);
    this.peerConnection = pc;

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        try {
          pc.addTrack(track, this.localStream!);
        } catch (e) {
          console.warn('[Teleconsult] Error adding initial track to RTCPeerConnection:', e);
        }
      });
    }

    pc.ontrack = (event) => {
      console.log('[Teleconsult] Received remote track:', event.track.kind);
      if (event.streams && event.streams[0]) {
        this.remoteStream = event.streams[0];
        this.emit('media:remote-stream', event.streams[0]);
      } else {
        if (!this.remoteStream) {
          this.remoteStream = new MediaStream();
        }
        this.remoteStream.addTrack(event.track);
        this.emit('media:remote-stream', this.remoteStream);
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && this.ws?.readyState === WebSocket.OPEN && this.currentSession) {
        this.ws.send(JSON.stringify({
          type: 'webrtc:ice',
          sessionId: this.currentSession.id,
          candidate: event.candidate
        }));
      }
    };

    pc.onconnectionstatechange = () => {
      console.log('[Teleconsult] WebRTC Connection State:', pc.connectionState);
      this.emit('webrtc:state', pc.connectionState);
    };

    return pc;
  }

  private async initiateWebRTCOffer() {
    try {
      // 1. Ensure local media stream is ready and has active tracks before creating PeerConnection & Offer
      if (!this.localStream || !this.hasActiveLocalTracks()) {
        await this.setupLocalMediaStream();
      }

      const pc = this.createPeerConnection();

      // 2. Guarantee all tracks from this.localStream are attached via pc.addTrack() before createOffer
      if (this.localStream) {
        const senders = pc.getSenders();
        this.localStream.getTracks().forEach(track => {
          if (!senders.some(s => s.track === track)) {
            try {
              pc.addTrack(track, this.localStream!);
            } catch (e) {
              console.warn('[Teleconsult] Error attaching track before offer:', e);
            }
          }
        });
      }

      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
      await pc.setLocalDescription(offer);

      if (this.ws?.readyState === WebSocket.OPEN && this.currentSession) {
        this.ws.send(JSON.stringify({
          type: 'webrtc:offer',
          sessionId: this.currentSession.id,
          sdp: offer
        }));
      }
    } catch (err) {
      console.error('[Teleconsult] Error creating WebRTC Offer:', err);
    }
  }

  private async handleWebRTCOffer(sdp: RTCSessionDescriptionInit) {
    try {
      // 1. Await Local Media Before Peer Connection
      // Check if this.localStream exists and has active tracks. If not, await this.setupLocalMediaStream() before invoking this.createPeerConnection().
      if (!this.localStream || !this.hasActiveLocalTracks()) {
        await this.setupLocalMediaStream();
      }

      const pc = this.createPeerConnection();

      // 2. Ensure all tracks from this.localStream are added via pc.addTrack() before calling pc.createAnswer()
      if (this.localStream) {
        const senders = pc.getSenders();
        this.localStream.getTracks().forEach(track => {
          if (!senders.some(s => s.track === track)) {
            try {
              pc.addTrack(track, this.localStream!);
            } catch (e) {
              console.warn('[Teleconsult] Error attaching track before answer:', e);
            }
          }
        });
      }

      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      await this.processPendingIceCandidates();

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      if (this.ws?.readyState === WebSocket.OPEN && this.currentSession) {
        this.ws.send(JSON.stringify({
          type: 'webrtc:answer',
          sessionId: this.currentSession.id,
          sdp: answer
        }));
      }
    } catch (err) {
      console.error('[Teleconsult] Error handling WebRTC Offer:', err);
    }
  }

  private async handleWebRTCAnswer(sdp: RTCSessionDescriptionInit) {
    try {
      if (this.peerConnection) {
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
        await this.processPendingIceCandidates();
      }
    } catch (err) {
      console.error('[Teleconsult] Error setting remote description:', err);
    }
  }

  private async handleRemoteIceCandidate(candidate: RTCIceCandidateInit) {
    try {
      if (this.peerConnection && this.peerConnection.remoteDescription) {
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      } else {
        this.pendingIceCandidates.push(candidate);
      }
    } catch (err) {
      console.warn('[Teleconsult] Error adding ICE candidate:', err);
    }
  }

  private async processPendingIceCandidates() {
    if (!this.peerConnection || !this.peerConnection.remoteDescription) return;
    while (this.pendingIceCandidates.length > 0) {
      const candidate = this.pendingIceCandidates.shift();
      if (candidate) {
        try {
          await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.warn('[Teleconsult] Error adding queued ICE candidate:', e);
        }
      }
    }
  }

  // Play a soft notification chime
  private playNotificationChime() {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
      osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.12); // A5
      
      gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
      
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      
      osc.start();
      osc.stop(audioCtx.currentTime + 0.55);
    } catch (e) {
      // ignore
    }
  }

  // Controls with guarantee to never get stuck
  public async setAudioEnabled(enabled: boolean): Promise<boolean> {
    if (!this.localStream) {
      await this.setupLocalMediaStream();
    }

    if (this.localStream) {
      let audioTracks = this.localStream.getAudioTracks();
      
      // If no audio track exists, synthesize one so audio toggling works seamlessly
      if (audioTracks.length === 0) {
        try {
          const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
          if (audioCtx.state === 'suspended') {
            await audioCtx.resume().catch(() => {});
          }
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          gain.gain.value = 0.001;
          osc.connect(gain);
          const dst = audioCtx.createMediaStreamDestination();
          gain.connect(dst);
          osc.start();
          const newTrack = dst.stream.getAudioTracks()[0];
          if (newTrack) {
            this.localStream.addTrack(newTrack);
            if (this.peerConnection) {
              this.peerConnection.addTrack(newTrack, this.localStream);
            }
            audioTracks = [newTrack];
          }
        } catch (e) {
          console.warn('Unable to create synthetic audio track:', e);
        }
      }

      this.isMuted = !enabled;
      audioTracks.forEach(t => {
        t.enabled = enabled;
      });
      this.emit('controls:audio-toggled', enabled);
      return enabled;
    }

    this.isMuted = !enabled;
    this.emit('controls:audio-toggled', enabled);
    return enabled;
  }

  public async setVideoEnabled(enabled: boolean): Promise<boolean> {
    if (!this.localStream) {
      await this.setupLocalMediaStream();
    }

    if (this.localStream) {
      let videoTracks = this.localStream.getVideoTracks();

      // If no video track exists, create synthetic canvas stream track
      if (videoTracks.length === 0) {
        const synthetic = this.createSyntheticMediaStream();
        const newTrack = synthetic.getVideoTracks()[0];
        if (newTrack) {
          this.localStream.addTrack(newTrack);
          if (this.peerConnection) {
            this.peerConnection.addTrack(newTrack, this.localStream);
          }
          videoTracks = [newTrack];
        }
      }

      this.isVideoOff = !enabled;
      videoTracks.forEach(t => {
        t.enabled = enabled;
      });
      this.emit('controls:video-toggled', enabled);
      return enabled;
    }

    this.isVideoOff = !enabled;
    this.emit('controls:video-toggled', enabled);
    return enabled;
  }

  public async toggleAudio(forceTarget?: boolean): Promise<boolean> {
    const target = forceTarget !== undefined ? forceTarget : this.isMuted; // if currently muted, target is true (unmuted)
    return this.setAudioEnabled(target);
  }

  public async toggleVideo(forceTarget?: boolean): Promise<boolean> {
    const target = forceTarget !== undefined ? forceTarget : this.isVideoOff; // if currently video off, target is true (video on)
    return this.setVideoEnabled(target);
  }

  public isAudioActive(): boolean {
    if (!this.localStream) return !this.isMuted;
    const audioTracks = this.localStream.getAudioTracks();
    if (audioTracks.length === 0) return !this.isMuted;
    return audioTracks.some(t => t.enabled);
  }

  public isVideoActive(): boolean {
    if (!this.localStream) return !this.isVideoOff;
    const videoTracks = this.localStream.getVideoTracks();
    if (videoTracks.length === 0) return !this.isVideoOff;
    return videoTracks.some(t => t.enabled);
  }

  public getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  public getRemoteStream(): MediaStream | null {
    return this.remoteStream;
  }

  public getCurrentSession(): TeleconsultSession | null {
    return this.currentSession;
  }

  public getCurrentRequest(): VideoCallRequest | null {
    return this.currentRequest;
  }

  public getPendingRequests(): VideoCallRequest[] {
    return this.pendingRequests;
  }

  public isSynthetic(): boolean {
    return this.isSyntheticMedia;
  }

  /**
   * Switch from synthetic stream to hardware camera & mic (e.g. after user grants device permissions)
   */
  public async switchToHardwareMedia(): Promise<MediaStream | null> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user'
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true
        }
      });
      const oldStream = this.localStream;
      this.localStream = stream;
      this.isSyntheticMedia = false;
      this.emit('media:local-stream', stream);

      if (this.peerConnection) {
        await this.replaceLocalStreamTracks(stream);
      }

      if (oldStream && oldStream !== stream) {
        oldStream.getTracks().forEach(t => t.stop());
      }
      return stream;
    } catch (err) {
      console.warn('[Teleconsult] Unable to switch to hardware media stream:', err);
      return null;
    }
  }

  private cleanupCallState() {
    this.pendingIceCandidates = [];
    this.mediaSetupPromise = null;
    if (this.peerConnection) {
      try {
        this.peerConnection.close();
      } catch (e) {
        // ignore
      }
      this.peerConnection = null;
    }
    if (this.localStream) {
      this.localStream.getTracks().forEach(t => t.stop());
      this.localStream = null;
    }
    this.remoteStream = null;
    this.currentSession = null;
    this.isMuted = false;
    this.isVideoOff = false;
  }
}

export const teleconsultService = new TeleconsultService();

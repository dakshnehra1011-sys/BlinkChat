import type {
  ClientMessage,
  DataChannelMessage,
  IceCandidatePayload,
  ServerMessage,
} from '@blinkchat/shared';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getApiUrl, getWsUrl } from '../lib/api';

export type CallState = 'idle' | 'preview' | 'queued' | 'connecting' | 'connected' | 'ended';

export interface ChatMessage {
  id: string;
  senderId: string;
  content: string;
  timestamp: number;
  isSelf: boolean;
}

// Generate animated virtual media stream when physical camera is locked by another browser tab
function createFallbackMediaStream(audioTrack?: MediaStreamTrack | null): MediaStream {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 480;
  const ctx = canvas.getContext('2d');
  let frame = 0;

  const draw = () => {
    if (!ctx) return;
    frame++;
    const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    grad.addColorStop(0, '#090d16');
    grad.addColorStop(1, '#1e1b4b');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Glowing pulsating avatar
    const pulse = Math.sin(frame * 0.1) * 8;
    ctx.beginPath();
    ctx.arc(canvas.width / 2, canvas.height / 2 - 25, 60 + pulse, 0, Math.PI * 2);
    ctx.fillStyle = '#6366f1';
    ctx.fill();

    // User avatar emoji
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 44px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('👤', canvas.width / 2, canvas.height / 2 - 25);

    // Primary label
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText('Virtual Video Stream', canvas.width / 2, canvas.height / 2 + 65);

    // Subtitle
    ctx.fillStyle = '#94a3b8';
    ctx.font = '14px sans-serif';
    ctx.fillText('(Physical camera active in other tab)', canvas.width / 2, canvas.height / 2 + 95);
  };

  // Draw initial frame immediately
  draw();
  // Use setInterval so video continues streaming even when window loses focus
  const timer = setInterval(draw, 40); // 25 FPS

  const stream = canvas.captureStream(25);
  const videoTrack = stream.getVideoTracks()[0];
  if (videoTrack) {
    const originalStop = videoTrack.stop.bind(videoTrack);
    videoTrack.stop = () => {
      clearInterval(timer);
      originalStop();
    };
  }

  if (audioTrack) {
    stream.addTrack(audioTrack);
  }

  return stream;
}

// Ensure RTCIceCandidateInit has valid defined fields and valid m-line mapping
function buildSafeIceCandidate(cand: IceCandidatePayload): RTCIceCandidateInit {
  const init: RTCIceCandidateInit = {
    candidate: cand.candidate,
  };
  if (cand.sdpMid !== null && cand.sdpMid !== undefined && cand.sdpMid !== '') {
    init.sdpMid = cand.sdpMid;
  }
  if (cand.sdpMLineIndex !== null && cand.sdpMLineIndex !== undefined) {
    init.sdpMLineIndex = cand.sdpMLineIndex;
  }
  // If neither sdpMid nor sdpMLineIndex is provided, default to index 0 (bundled media line)
  if (init.sdpMid === undefined && init.sdpMLineIndex === undefined) {
    init.sdpMLineIndex = 0;
    init.sdpMid = '0';
  }
  if (cand.usernameFragment) {
    init.usernameFragment = cand.usernameFragment;
  }
  return init;
}

export function useWebRTC(token: string | null, userId: string | null) {
  const [callState, setCallState] = useState<CallState>('idle');
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoDisabled, setIsVideoDisabled] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [peerId, setPeerId] = useState<string | null>(null);
  const [isDirectConnection, setIsDirectConnection] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [statusMessage, setStatusMessage] = useState<string>('');

  const matchWsRef = useRef<WebSocket | null>(null);
  const signalingWsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const iceRecoveryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const iceRestartAttemptedRef = useRef(false);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const pendingIceCandidatesRef = useRef<IceCandidatePayload[]>([]);
  const outboundIceQueueRef = useRef<ClientMessage[]>([]);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream>(new MediaStream());
  const iceServersRef = useRef<RTCIceServer[]>([
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
  ]);

  const clientIdRef = useRef<string>(
    (() => {
      try {
        let id = sessionStorage.getItem('blinkchat_client_id');
        if (!id) {
          id = crypto.randomUUID();
          sessionStorage.setItem('blinkchat_client_id', id);
        }
        return id;
      } catch {
        return crypto.randomUUID();
      }
    })()
  );

  const callStateRef = useRef<CallState>(callState);
  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);

  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);

  // Proactive heartbeat keepalive while queued
  useEffect(() => {
    if (callState !== 'queued') return;

    const interval = setInterval(() => {
      if (matchWsRef.current?.readyState === WebSocket.OPEN) {
        matchWsRef.current.send(JSON.stringify({ type: 'heartbeat' }));
      }
    }, 8000);

    return () => clearInterval(interval);
  }, [callState]);

  // Proactive heartbeat keepalive while in call to prevent Cloudflare edge WebSocket idle timeout
  useEffect(() => {
    if (callState !== 'connecting' && callState !== 'connected') return;

    const interval = setInterval(() => {
      if (signalingWsRef.current?.readyState === WebSocket.OPEN) {
        signalingWsRef.current.send(JSON.stringify({ type: 'heartbeat' }));
      }
    }, 12000);

    return () => clearInterval(interval);
  }, [callState]);

  // TanStack Query for ICE server configuration
  const { data: iceConfig, refetch: refreshIceConfig } = useQuery<{
    iceServers: RTCIceServer[];
    turnAvailable?: boolean;
  }>({
    queryKey: ['iceServers', token],
    queryFn: async () => {
      const res = await fetch(getApiUrl('/api/config/ice'), {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok)
        return {
          iceServers: iceServersRef.current,
        };
      return res.json();
    },
    staleTime: 15 * 60 * 1000,
    enabled: Boolean(token),
  });

  useEffect(() => {
    if (iceConfig?.iceServers) {
      iceServersRef.current = iceConfig.iceServers;
    }
  }, [iceConfig]);

  // Handle remote peer disconnection or departure
  const handleRemotePeerLeave = useCallback((reason: string) => {
    if (iceRecoveryTimerRef.current) {
      clearTimeout(iceRecoveryTimerRef.current);
      iceRecoveryTimerRef.current = null;
    }
    if (dataChannelRef.current) {
      try {
        dataChannelRef.current.close();
      } catch {}
      dataChannelRef.current = null;
    }
    if (pcRef.current) {
      try {
        pcRef.current.close();
      } catch {}
      pcRef.current = null;
    }
    if (signalingWsRef.current) {
      try {
        signalingWsRef.current.close();
      } catch {}
      signalingWsRef.current = null;
    }
    sessionIdRef.current = null;
    setRemoteStream(null);
    setSessionId(null);
    setPeerId(null);
    setIsDirectConnection(null);
    setCallState('ended');
    setStatusMessage(reason);
  }, []);

  // Initialize local camera and microphone preview (with automatic fallback if hardware is busy)
  const startPreview = useCallback(async () => {
    // 1. Try standard ideal HD camera constraints
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
          facingMode: 'user',
        },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      localStreamRef.current = stream;
      setLocalStream(stream);
      setCallState('preview');
      const hasMicrophone = stream.getAudioTracks().some((track) => track.readyState === 'live');
      setIsAudioMuted(!hasMicrophone);
      setIsVideoDisabled(!stream.getVideoTracks().some((track) => track.readyState === 'live'));
      setStatusMessage(
        hasMicrophone
          ? 'Camera and microphone ready'
          : 'Camera ready; microphone unavailable. Check browser permissions.'
      );
      return stream;
    } catch (err) {
      console.warn(
        'Ideal camera constraints failed, attempting basic { video: true, audio: true }:',
        err
      );
      // 2. Try relaxed constraints for budget webcams and mobile devices
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        localStreamRef.current = stream;
        setLocalStream(stream);
        setCallState('preview');
        const hasMicrophone = stream.getAudioTracks().some((track) => track.readyState === 'live');
        setIsAudioMuted(!hasMicrophone);
        setIsVideoDisabled(!stream.getVideoTracks().some((track) => track.readyState === 'live'));
        setStatusMessage(
          hasMicrophone
            ? 'Camera and microphone ready'
            : 'Camera ready; microphone unavailable. Check browser permissions.'
        );
        return stream;
      } catch (relaxedErr) {
        console.warn('Physical camera unavailable, attempting mic + virtual fallback:', relaxedErr);
        let audioTrack: MediaStreamTrack | null = null;
        try {
          const audioStream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true },
          });
          audioTrack = audioStream.getAudioTracks()[0] || null;
        } catch {}

        try {
          const fallbackStream = createFallbackMediaStream(audioTrack);
          localStreamRef.current = fallbackStream;
          setLocalStream(fallbackStream);
          setCallState('preview');
          setIsAudioMuted(audioTrack?.readyState !== 'live');
          setIsVideoDisabled(false);
          setStatusMessage(
            audioTrack
              ? 'Mic active (Virtual video - physical camera in use)'
              : 'Virtual video active; microphone unavailable. Check browser permissions.'
          );
          return fallbackStream;
        } catch (fallbackErr) {
          console.error('Failed to create virtual fallback stream:', fallbackErr);
          setStatusMessage('Camera or microphone access denied');
          return null;
        }
      }
    }
  }, []);

  // Cleanup peer connection and signaling with graceful peer departure notifications
  const cleanupCall = useCallback(() => {
    if (iceRecoveryTimerRef.current) {
      clearTimeout(iceRecoveryTimerRef.current);
      iceRecoveryTimerRef.current = null;
    }
    outboundIceQueueRef.current = [];
    remoteStreamRef.current = new MediaStream();

    // Notify peer over WebRTC data channel if open
    if (dataChannelRef.current?.readyState === 'open') {
      try {
        dataChannelRef.current.send(JSON.stringify({ type: 'peer.leave' }));
      } catch {}
    }
    // Notify signaling Durable Object if connected
    if (sessionIdRef.current && signalingWsRef.current?.readyState === WebSocket.OPEN) {
      try {
        const leaveMsg: ClientMessage = { type: 'match.leave', sessionId: sessionIdRef.current };
        signalingWsRef.current.send(JSON.stringify(leaveMsg));
      } catch {}
    }
    if (dataChannelRef.current) {
      try {
        dataChannelRef.current.close();
      } catch {}
      dataChannelRef.current = null;
    }
    if (pcRef.current) {
      try {
        pcRef.current.close();
      } catch {}
      pcRef.current = null;
    }
    if (signalingWsRef.current) {
      try {
        signalingWsRef.current.close();
      } catch {}
      signalingWsRef.current = null;
    }
    sessionIdRef.current = null;
    setRemoteStream(null);
    setSessionId(null);
    setPeerId(null);
    setIsDirectConnection(null);
    setMessages([]);
  }, []);

  // Full teardown (e.g. on unmount or Leave)
  const leaveCall = useCallback(() => {
    cleanupCall();
    if (matchWsRef.current) {
      matchWsRef.current.close();
      matchWsRef.current = null;
    }
    setCallState('preview');
    setStatusMessage('Ready to find a stranger');
  }, [cleanupCall]);

  // Cancel matchmaking search
  const cancelQueue = useCallback(() => {
    if (matchWsRef.current) {
      matchWsRef.current.close();
      matchWsRef.current = null;
    }
    setCallState('preview');
    setStatusMessage('Search cancelled. Camera ready.');
  }, []);

  // Stop camera and microphone tracks completely (e.g. returning to Home page)
  const stopCamera = useCallback(() => {
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      setLocalStream(null);
    }
    cleanupCall();
    if (matchWsRef.current) {
      matchWsRef.current.close();
      matchWsRef.current = null;
    }
    setCallState('idle');
    setStatusMessage('');
  }, [localStream, cleanupCall]);

  // Setup WebRTC peer connection
  const setupPeerConnection = useCallback(
    (currentSessionId: string, isInitiator: boolean, currentStream: MediaStream) => {
      const pc = new RTCPeerConnection({
        iceServers: iceServersRef.current,
      });
      pcRef.current = pc;
      outboundIceQueueRef.current = [];
      remoteStreamRef.current = new MediaStream();
      iceRestartAttemptedRef.current = false;
      if (iceRecoveryTimerRef.current) {
        clearTimeout(iceRecoveryTimerRef.current);
        iceRecoveryTimerRef.current = null;
      }

      // Add local tracks
      currentStream.getTracks().forEach((track) => {
        pc.addTrack(track, currentStream);
      });
      // Keep an audio m-line in the offer even if this user has no microphone,
      // so the other peer can still send audio in a one-sided-audio call.
      if (!currentStream.getAudioTracks().some((track) => track.readyState === 'live')) {
        pc.addTransceiver('audio', { direction: 'sendrecv' });
      }

      const checkConnected = () => {
        if (
          pc.connectionState === 'connected' ||
          pc.iceConnectionState === 'connected' ||
          pc.iceConnectionState === 'completed'
        ) {
          if (iceRecoveryTimerRef.current) {
            clearTimeout(iceRecoveryTimerRef.current);
            iceRecoveryTimerRef.current = null;
          }
          setCallState('connected');
          setStatusMessage('Connected with stranger');
          pc.getStats()
            .then((stats) => {
              stats.forEach((report) => {
                if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                  const localCandidate = stats.get(report.localCandidateId);
                  const isRelay = localCandidate?.candidateType === 'relay';
                  setIsDirectConnection(!isRelay);
                }
              });
            })
            .catch(() => {});
        }
      };

      const recoverIceConnection = () => {
        if (iceRecoveryTimerRef.current) return;
        setStatusMessage('Connection interrupted; trying to reconnect...');
        const shouldRestart = isInitiator && !iceRestartAttemptedRef.current;
        iceRecoveryTimerRef.current = setTimeout(
          async () => {
            iceRecoveryTimerRef.current = null;
            if (
              pc.connectionState === 'connected' ||
              pc.iceConnectionState === 'connected' ||
              pc.iceConnectionState === 'completed'
            ) {
              return;
            }

            if (shouldRestart) {
              iceRestartAttemptedRef.current = true;
              const ws = signalingWsRef.current;
              try {
                if (!ws || ws.readyState !== WebSocket.OPEN) {
                  throw new Error('Signaling socket is unavailable for ICE restart');
                }
                pc.restartIce();
                const offer = await pc.createOffer({ iceRestart: true });
                await pc.setLocalDescription(offer);
                if (pc.localDescription?.sdp && ws.readyState === WebSocket.OPEN) {
                  ws.send(
                    JSON.stringify({
                      type: 'signal.offer',
                      sessionId: currentSessionId,
                      sdp: pc.localDescription.sdp,
                    })
                  );
                  setStatusMessage('Network changed; retrying the media connection...');
                }
              } catch (err) {
                console.warn('[WebRTC] ICE restart failed:', err);
              }
              recoverIceConnection();
              return;
            }

            iceRecoveryTimerRef.current = setTimeout(() => {
              iceRecoveryTimerRef.current = null;
              const isStillDisconnected =
                pc.connectionState !== 'connected' &&
                pc.iceConnectionState !== 'connected' &&
                pc.iceConnectionState !== 'completed';
              if (isStillDisconnected) {
                handleRemotePeerLeave('Connection failed. Try the next stranger.');
              }
            }, 10000);
          },
          shouldRestart ? 1500 : 10000
        );
      };

      // Handle remote tracks with guaranteed fresh MediaStream instance for React
      pc.ontrack = (event) => {
        console.log('[WebRTC] Received remote track:', event.track.kind, event.track.id);

        if (!remoteStreamRef.current.getTracks().some((t) => t.id === event.track.id)) {
          remoteStreamRef.current.addTrack(event.track);
        }

        if (event.streams?.[0]) {
          event.streams[0].getTracks().forEach((track) => {
            if (!remoteStreamRef.current.getTracks().some((t) => t.id === track.id)) {
              remoteStreamRef.current.addTrack(track);
            }
          });
        }

        // Always create a fresh MediaStream instance so React updates state & re-renders video
        const freshStream = new MediaStream(remoteStreamRef.current.getTracks());
        setRemoteStream(freshStream);
        checkConnected();

        event.track.onunmute = () => {
          console.log('[WebRTC] Remote track unmuted:', event.track.kind);
          setRemoteStream(new MediaStream(remoteStreamRef.current.getTracks()));
          setCallState('connected');
          setStatusMessage('Connected with stranger');
          checkConnected();
        };
        event.track.onmute = () => {
          setRemoteStream(new MediaStream(remoteStreamRef.current.getTracks()));
        };
        event.track.onended = () => {
          remoteStreamRef.current = new MediaStream(
            remoteStreamRef.current.getTracks().filter((track) => track.id !== event.track.id)
          );
          setRemoteStream(new MediaStream(remoteStreamRef.current.getTracks()));
        };
        if (!event.track.muted) {
          setRemoteStream(new MediaStream(remoteStreamRef.current.getTracks()));
          setCallState('connected');
          setStatusMessage('Connected with stranger');
        }
      };

      // Trickle ICE candidates with outbound queue fallback
      pc.onicecandidate = (event) => {
        if (event.candidate?.candidate) {
          const cand = event.candidate;
          const payload: ClientMessage = {
            type: 'signal.ice',
            sessionId: currentSessionId,
            candidate: {
              candidate: cand.candidate,
              sdpMid: cand.sdpMid ?? undefined,
              sdpMLineIndex:
                cand.sdpMLineIndex !== null && cand.sdpMLineIndex !== undefined
                  ? cand.sdpMLineIndex
                  : undefined,
              usernameFragment: cand.usernameFragment ?? undefined,
            },
          };
          if (signalingWsRef.current?.readyState === WebSocket.OPEN) {
            signalingWsRef.current.send(JSON.stringify(payload));
          } else {
            outboundIceQueueRef.current.push(payload);
          }
        }
      };

      // Recover transient network changes before ending the session.
      pc.onconnectionstatechange = () => {
        checkConnected();
        if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          recoverIceConnection();
        }
      };

      // ICE connection state changes
      pc.oniceconnectionstatechange = () => {
        checkConnected();
        if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
          recoverIceConnection();
        }
      };

      // Setup DataChannel for text, emoji chat, and instant peer departure events
      const setupDataChannelEvents = (dc: RTCDataChannel) => {
        dataChannelRef.current = dc;
        dc.onopen = () => {
          console.log('[WebRTC] RTCDataChannel opened successfully');
          checkConnected();
        };
        dc.onclose = () => {
          console.log('[WebRTC] RTCDataChannel closed');
          // Only trigger leave if we were actually connected and the peer connection has failed or closed
          if (
            callStateRef.current === 'connected' &&
            (pc.connectionState === 'closed' ||
              pc.connectionState === 'failed' ||
              pc.connectionState === 'disconnected')
          ) {
            handleRemotePeerLeave('Stranger disconnected');
          }
        };
        dc.onerror = (err) => {
          console.warn('[WebRTC] RTCDataChannel error:', err);
        };
        dc.onmessage = (event) => {
          try {
            const data: DataChannelMessage = JSON.parse(event.data);
            if (data.type === 'peer.leave') {
              handleRemotePeerLeave('Stranger left the call');
              return;
            }
            if (data.type === 'chat.message') {
              setMessages((prev) => [
                ...prev,
                {
                  id: data.id,
                  senderId: data.senderId,
                  content: data.content,
                  timestamp: data.timestamp,
                  isSelf: false,
                },
              ]);
            }
          } catch (e) {
            console.error('Error parsing data channel message:', e);
          }
        };
      };

      if (isInitiator) {
        // Initiator creates data channel
        const dc = pc.createDataChannel('blinkchat-chat', { ordered: true });
        setupDataChannelEvents(dc);
      } else {
        // Receiver listens for data channel
        pc.ondatachannel = (event) => {
          setupDataChannelEvents(event.channel);
        };
      }

      return pc;
    },
    [handleRemotePeerLeave]
  );

  // Connect to SignalingDO for an active match session
  const connectToSignaling = useCallback(
    (currentSessionId: string, isInitiator: boolean, currentStream: MediaStream) => {
      if (!token) return;

      pendingIceCandidatesRef.current = [];

      // Synchronously initialize the RTCPeerConnection BEFORE connecting to signaling
      const pc = setupPeerConnection(currentSessionId, isInitiator, currentStream);

      const wsUrl = getWsUrl(
        `/api/ws/session?token=${encodeURIComponent(token)}&sessionId=${encodeURIComponent(
          currentSessionId
        )}&clientId=${encodeURIComponent(clientIdRef.current)}`
      );

      const sigWs = new WebSocket(wsUrl);
      signalingWsRef.current = sigWs;

      sigWs.onopen = () => {
        // Flush any queued outbound ICE candidates
        while (outboundIceQueueRef.current.length > 0) {
          const candMsg = outboundIceQueueRef.current.shift();
          if (candMsg && sigWs.readyState === WebSocket.OPEN) {
            sigWs.send(JSON.stringify(candMsg));
          }
        }

        if (isInitiator) {
          pc.createOffer()
            .then((offer) => pc.setLocalDescription(offer))
            .then(() => {
              if (pc.localDescription?.sdp && sigWs.readyState === WebSocket.OPEN) {
                const offerMsg: ClientMessage = {
                  type: 'signal.offer',
                  sessionId: currentSessionId,
                  sdp: pc.localDescription.sdp,
                };
                sigWs.send(JSON.stringify(offerMsg));
              }
            })
            .catch((err) => console.error('Error creating offer:', err));

          // Retransmit offer after 1.5s if remoteDescription is not yet set (guarantees delivery across WAN)
          setTimeout(() => {
            if (
              !pc.remoteDescription &&
              sigWs.readyState === WebSocket.OPEN &&
              pc.localDescription?.sdp
            ) {
              console.log('[WebRTC] Resending offer to guarantee signaling across WAN');
              sigWs.send(
                JSON.stringify({
                  type: 'signal.offer',
                  sessionId: currentSessionId,
                  sdp: pc.localDescription.sdp,
                })
              );
            }
          }, 1500);
        }
      };

      let signalingMessageChain = Promise.resolve();
      sigWs.onmessage = (event) => {
        signalingMessageChain = signalingMessageChain
          .then(() => processSignalingMessage(event))
          .catch((err) => console.error('Error in signaling message handler:', err));
      };

      const processSignalingMessage = async (event: MessageEvent) => {
        try {
          const msg: ServerMessage = JSON.parse(event.data);

          if (msg.type === 'match.ended') {
            handleRemotePeerLeave(msg.message || 'Stranger ended the chat');
            return;
          }

          switch (msg.type) {
            case 'signal.offer': {
              // The matchmaker may retry an offer if signaling is slow. Reapplying the
              // same offer after creating an answer can restart negotiation and produce
              // duplicate answers that arrive while the initiator is already stable.
              if (pc.remoteDescription?.type === 'offer' && pc.remoteDescription.sdp === msg.sdp) {
                break;
              }
              await pc.setRemoteDescription(
                new RTCSessionDescription({ type: 'offer', sdp: msg.sdp })
              );
              // Flush any early arriving ICE candidates
              while (pendingIceCandidatesRef.current.length > 0) {
                const cand = pendingIceCandidatesRef.current.shift();
                if (cand?.candidate) {
                  try {
                    await pc.addIceCandidate(new RTCIceCandidate(buildSafeIceCandidate(cand)));
                  } catch (e) {
                    console.warn('[WebRTC] addIceCandidate error:', e);
                  }
                }
              }
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              if (sigWs.readyState === WebSocket.OPEN && answer.sdp) {
                const answerMsg: ClientMessage = {
                  type: 'signal.answer',
                  sessionId: currentSessionId,
                  sdp: answer.sdp,
                };
                sigWs.send(JSON.stringify(answerMsg));
              }
              // Flush any queued outbound ICE candidates
              while (outboundIceQueueRef.current.length > 0) {
                const candMsg = outboundIceQueueRef.current.shift();
                if (candMsg && sigWs.readyState === WebSocket.OPEN) {
                  sigWs.send(JSON.stringify(candMsg));
                }
              }
              break;
            }

            case 'signal.answer': {
              // Ignore retries of an answer already applied to this peer connection.
              if (pc.remoteDescription?.type === 'answer' && pc.remoteDescription.sdp === msg.sdp) {
                break;
              }
              await pc.setRemoteDescription(
                new RTCSessionDescription({ type: 'answer', sdp: msg.sdp })
              );
              // Flush any early arriving ICE candidates
              while (pendingIceCandidatesRef.current.length > 0) {
                const cand = pendingIceCandidatesRef.current.shift();
                if (cand?.candidate) {
                  try {
                    await pc.addIceCandidate(new RTCIceCandidate(buildSafeIceCandidate(cand)));
                  } catch (e) {
                    console.warn('[WebRTC] addIceCandidate error:', e);
                  }
                }
              }
              // Flush any queued outbound ICE candidates
              while (outboundIceQueueRef.current.length > 0) {
                const candMsg = outboundIceQueueRef.current.shift();
                if (candMsg && sigWs.readyState === WebSocket.OPEN) {
                  sigWs.send(JSON.stringify(candMsg));
                }
              }
              break;
            }

            case 'signal.ice': {
              const cand: IceCandidatePayload = msg.candidate;
              if (cand?.candidate) {
                if (pc.remoteDescription?.type) {
                  try {
                    await pc.addIceCandidate(new RTCIceCandidate(buildSafeIceCandidate(cand)));
                  } catch (e) {
                    console.warn('[WebRTC] addIceCandidate error:', e);
                  }
                } else {
                  pendingIceCandidatesRef.current.push(cand);
                }
              }
              break;
            }
          }
        } catch (err) {
          console.error('Error in signaling message handler:', err);
        }
      };

      sigWs.onerror = () => {
        setStatusMessage('Signaling error');
      };
    },
    [token, setupPeerConnection, handleRemotePeerLeave]
  );

  // Join matchmaking queue via MatchmakerDO
  const findStranger = useCallback(async () => {
    if (!token) return;

    // Refresh short-lived TURN credentials before each match so peer creation
    // cannot race the authenticated ICE configuration request.
    const result = await refreshIceConfig();
    if (result.data?.iceServers?.length) {
      iceServersRef.current = result.data.iceServers;
    }

    let stream = localStreamRef.current || localStream;
    const hasLiveVideo = stream?.getVideoTracks().some((t) => t.readyState === 'live');
    if (!stream || !hasLiveVideo) {
      stream = await startPreview();
      if (!stream) return;
    }

    cleanupCall();
    if (matchWsRef.current) {
      try {
        matchWsRef.current.close();
      } catch {}
      matchWsRef.current = null;
    }

    setCallState('queued');
    setStatusMessage('Searching for someone to chat with...');

    const wsUrl = getWsUrl(
      `/api/ws/match?token=${encodeURIComponent(token)}&clientId=${encodeURIComponent(
        clientIdRef.current
      )}`
    );

    const ws = new WebSocket(wsUrl);
    matchWsRef.current = ws;

    ws.onopen = () => {
      const joinMsg: ClientMessage = { type: 'queue.join' };
      ws.send(JSON.stringify(joinMsg));
    };

    ws.onmessage = (event) => {
      try {
        const msg: ServerMessage = JSON.parse(event.data);
        if (msg.type === 'match.found') {
          setSessionId(msg.sessionId);
          sessionIdRef.current = msg.sessionId;
          setPeerId(msg.peerId);
          setCallState('connecting');
          setStatusMessage('Stranger found! Establishing video...');
          const activeStream = localStreamRef.current || stream!;
          connectToSignaling(msg.sessionId, msg.isInitiator, activeStream);
        } else if (msg.type === 'queue.status') {
          if (msg.message) setStatusMessage(msg.message);
        }
      } catch (err) {
        console.error('Matchmaker message error:', err);
      }
    };

    ws.onclose = () => {
      if (callStateRef.current === 'queued') {
        setTimeout(() => {
          if (callStateRef.current === 'queued') {
            findStranger();
          }
        }, 1500);
      }
    };

    ws.onerror = () => {
      if (callStateRef.current === 'queued') {
        setStatusMessage('Reconnecting to matchmaking queue...');
      } else {
        setStatusMessage('Failed to connect to matchmaking server');
        setCallState('preview');
      }
    };
  }, [
    token,
    localStream,
    iceConfig,
    refreshIceConfig,
    startPreview,
    cleanupCall,
    connectToSignaling,
  ]);

  // Next stranger (teardown current call, re-enter queue)
  const nextStranger = useCallback(() => {
    if (sessionId && signalingWsRef.current?.readyState === WebSocket.OPEN) {
      const msg: ClientMessage = { type: 'match.next', sessionId };
      signalingWsRef.current.send(JSON.stringify(msg));
    }
    findStranger();
  }, [sessionId, findStranger]);

  // Send message over RTCDataChannel
  const sendMessage = useCallback(
    (text: string) => {
      if (!text.trim() || !dataChannelRef.current || dataChannelRef.current.readyState !== 'open') {
        return false;
      }

      const msg: DataChannelMessage = {
        type: 'chat.message',
        id: crypto.randomUUID(),
        senderId: userId || 'me',
        content: text.trim(),
        timestamp: Date.now(),
      };

      dataChannelRef.current.send(JSON.stringify(msg));

      setMessages((prev) => [
        ...prev,
        {
          id: msg.id,
          senderId: msg.senderId,
          content: msg.content,
          timestamp: msg.timestamp,
          isSelf: true,
        },
      ]);

      return true;
    },
    [userId]
  );

  // Toggle audio track
  const toggleAudio = useCallback(() => {
    if (localStream) {
      const tracks = localStream.getAudioTracks().filter((track) => track.readyState === 'live');
      if (tracks.length === 0) {
        setIsAudioMuted(true);
        return;
      }
      const shouldMute = tracks.some((track) => track.enabled);
      tracks.forEach((track) => {
        track.enabled = !shouldMute;
      });
      setIsAudioMuted(shouldMute);
    }
  }, [localStream]);

  // Toggle video track
  const toggleVideo = useCallback(() => {
    if (localStream) {
      localStream.getVideoTracks().forEach((track) => {
        track.enabled = !track.enabled;
        setIsVideoDisabled(!track.enabled);
      });
    }
  }, [localStream]);

  // Cleanup on unmount & browser navigation
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (dataChannelRef.current?.readyState === 'open') {
        try {
          dataChannelRef.current.send(JSON.stringify({ type: 'peer.leave' }));
        } catch {}
      }
      if (sessionIdRef.current && signalingWsRef.current?.readyState === WebSocket.OPEN) {
        try {
          signalingWsRef.current.send(
            JSON.stringify({ type: 'match.leave', sessionId: sessionIdRef.current })
          );
        } catch {}
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handleBeforeUnload);
      if (localStream) {
        localStream.getTracks().forEach((t) => t.stop());
      }
      cleanupCall();
      if (matchWsRef.current) {
        matchWsRef.current.close();
      }
    };
  }, [localStream, cleanupCall]);

  return {
    callState,
    localStream,
    remoteStream,
    isAudioMuted,
    isVideoDisabled,
    sessionId,
    peerId,
    isDirectConnection,
    messages,
    statusMessage,
    startPreview,
    findStranger,
    nextStranger,
    leaveCall,
    cancelQueue,
    stopCamera,
    sendMessage,
    toggleAudio,
    toggleVideo,
  };
}

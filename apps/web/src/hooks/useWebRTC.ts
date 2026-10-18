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
  } else {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const audioCtx = new AudioCtx();
        const osc = audioCtx.createOscillator();
        const dst = audioCtx.createMediaStreamDestination();
        osc.connect(dst);
        osc.start();
        const silentTrack = dst.stream.getAudioTracks()[0];
        if (silentTrack) {
          silentTrack.enabled = false;
          stream.addTrack(silentTrack);
        }
      }
    } catch {}
  }

  return stream;
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
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const pendingIceCandidatesRef = useRef<IceCandidatePayload[]>([]);
  const iceServersRef = useRef<RTCIceServer[]>([
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ]);

  // TanStack Query for ICE server configuration
  const { data: iceConfig } = useQuery<{ iceServers: RTCIceServer[] }>({
    queryKey: ['iceServers'],
    queryFn: async () => {
      const res = await fetch(getApiUrl('/api/config/ice'));
      if (!res.ok)
        return {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
          ],
        };
      return res.json();
    },
    staleTime: Infinity,
  });

  useEffect(() => {
    if (iceConfig?.iceServers) {
      iceServersRef.current = iceConfig.iceServers;
    }
  }, [iceConfig]);

  // Handle remote peer disconnection or departure
  const handleRemotePeerLeave = useCallback((reason: string) => {
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
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      setLocalStream(stream);
      setCallState('preview');
      setStatusMessage('Camera and microphone ready');
      return stream;
    } catch (err) {
      console.warn('Physical camera/mic error, attempting fallback:', err);
      let audioTrack: MediaStreamTrack | null = null;
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        audioTrack = audioStream.getAudioTracks()[0] || null;
      } catch {}

      try {
        const fallbackStream = createFallbackMediaStream(audioTrack);
        setLocalStream(fallbackStream);
        setCallState('preview');
        setStatusMessage(
          audioTrack
            ? 'Mic active (Virtual video - physical camera in use)'
            : 'Virtual preview active (Camera in use)'
        );
        return fallbackStream;
      } catch (fallbackErr) {
        console.error('Failed to create virtual fallback stream:', fallbackErr);
        setStatusMessage('Camera or microphone access denied');
        return null;
      }
    }
  }, []);

  // Cleanup peer connection and signaling with graceful peer departure notifications
  const cleanupCall = useCallback(() => {
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
    (
      currentSessionId: string,
      isInitiator: boolean,
      currentStream: MediaStream,
      sigWs: WebSocket
    ) => {
      const pc = new RTCPeerConnection({ iceServers: iceServersRef.current });
      pcRef.current = pc;

      // Add local tracks
      currentStream.getTracks().forEach((track) => {
        pc.addTrack(track, currentStream);
      });

      // Handle remote tracks
      pc.ontrack = (event) => {
        if (event.streams?.[0]) {
          setRemoteStream(event.streams[0]);
        }
      };

      // Trickle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate && sigWs.readyState === WebSocket.OPEN) {
          const payload: ClientMessage = {
            type: 'signal.ice',
            sessionId: currentSessionId,
            candidate: {
              candidate: event.candidate.candidate,
              sdpMid: event.candidate.sdpMid,
              sdpMLineIndex: event.candidate.sdpMLineIndex,
              usernameFragment: event.candidate.usernameFragment,
            },
          };
          sigWs.send(JSON.stringify(payload));
        }
      };

      // Connection state changes
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
          setCallState('connected');
          setStatusMessage('Connected with stranger');
          // Inspect stats to check if direct or relay
          pc.getStats().then((stats) => {
            stats.forEach((report) => {
              if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                const localCandidate = stats.get(report.localCandidateId);
                const isRelay = localCandidate?.candidateType === 'relay';
                setIsDirectConnection(!isRelay);
              }
            });
          });
        } else if (
          pc.connectionState === 'failed' ||
          pc.connectionState === 'disconnected' ||
          pc.connectionState === 'closed'
        ) {
          handleRemotePeerLeave('Stranger left the call');
        }
      };

      // ICE connection state changes
      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
          handleRemotePeerLeave('Stranger disconnected');
        }
      };

      // Setup DataChannel for text, emoji chat, and instant peer departure events
      const setupDataChannelEvents = (dc: RTCDataChannel) => {
        dataChannelRef.current = dc;
        dc.onopen = () => {
          console.log('[WebRTC] RTCDataChannel opened successfully');
        };
        dc.onclose = () => {
          console.log('[WebRTC] RTCDataChannel closed');
          handleRemotePeerLeave('Stranger disconnected');
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

        // Initiator creates offer
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

      const wsUrl = getWsUrl(
        `/api/ws/session?token=${encodeURIComponent(token)}&sessionId=${encodeURIComponent(
          currentSessionId
        )}`
      );

      const sigWs = new WebSocket(wsUrl);
      signalingWsRef.current = sigWs;

      sigWs.onopen = () => {
        setupPeerConnection(currentSessionId, isInitiator, currentStream, sigWs);
      };

      sigWs.onmessage = async (event) => {
        try {
          const msg: ServerMessage = JSON.parse(event.data);

          if (msg.type === 'match.ended') {
            handleRemotePeerLeave(msg.message || 'Stranger ended the chat');
            return;
          }

          const pc = pcRef.current;
          if (!pc) return;

          switch (msg.type) {
            case 'signal.offer': {
              await pc.setRemoteDescription(
                new RTCSessionDescription({ type: 'offer', sdp: msg.sdp })
              );
              // Flush any early arriving ICE candidates
              while (pendingIceCandidatesRef.current.length > 0) {
                const cand = pendingIceCandidatesRef.current.shift();
                if (cand) {
                  await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
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
              break;
            }

            case 'signal.answer': {
              await pc.setRemoteDescription(
                new RTCSessionDescription({ type: 'answer', sdp: msg.sdp })
              );
              // Flush any early arriving ICE candidates
              while (pendingIceCandidatesRef.current.length > 0) {
                const cand = pendingIceCandidatesRef.current.shift();
                if (cand) {
                  await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
                }
              }
              break;
            }

            case 'signal.ice': {
              const cand: IceCandidatePayload = msg.candidate;
              if (pc.remoteDescription?.type) {
                await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
              } else {
                pendingIceCandidatesRef.current.push(cand);
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

    let stream = localStream;
    if (!stream) {
      stream = await startPreview();
      if (!stream) return;
    }

    cleanupCall();
    setCallState('queued');
    setStatusMessage('Searching for someone to chat with...');

    const wsUrl = getWsUrl(`/api/ws/match?token=${encodeURIComponent(token)}`);

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
          connectToSignaling(msg.sessionId, msg.isInitiator, stream!);
        } else if (msg.type === 'queue.status') {
          if (msg.message) setStatusMessage(msg.message);
        }
      } catch (err) {
        console.error('Matchmaker message error:', err);
      }
    };

    ws.onerror = () => {
      setStatusMessage('Failed to connect to matchmaking server');
      setCallState('preview');
    };
  }, [token, localStream, startPreview, cleanupCall, connectToSignaling]);

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
      localStream.getAudioTracks().forEach((track) => {
        track.enabled = !track.enabled;
        setIsAudioMuted(!track.enabled);
      });
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

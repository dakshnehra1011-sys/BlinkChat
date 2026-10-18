import {
  ArrowLeft,
  Lock,
  MessageSquare,
  Mic,
  MicOff,
  PhoneOff,
  Send,
  ShieldAlert,
  SkipForward,
  Smile,
  Sparkles,
  Video,
  VideoOff,
  Volume2,
  X,
} from 'lucide-react';
import type { FC, FormEvent } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import 'emoji-picker-element';
import type { CallState, ChatMessage } from '../hooks/useWebRTC';

interface InCallViewProps {
  callState: CallState;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isAudioMuted: boolean;
  isVideoDisabled: boolean;
  statusMessage: string;
  messages: ChatMessage[];
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onNextStranger: () => void;
  onLeaveCall: () => void;
  onOpenReport: () => void;
  onSendMessage: (text: string) => boolean;
}

export const InCallView: FC<InCallViewProps> = ({
  callState,
  localStream,
  remoteStream,
  isAudioMuted,
  isVideoDisabled,
  statusMessage,
  messages,
  onToggleAudio,
  onToggleVideo,
  onNextStranger,
  onLeaveCall,
  onOpenReport,
  onSendMessage,
}) => {
  const [inputText, setInputText] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(true);
  const [chatWarning, setChatWarning] = useState<string | null>(null);
  const [decodedRemoteVideoTrackId, setDecodedRemoteVideoTrackId] = useState<string | null>(null);
  const [remoteAudioNeedsTap, setRemoteAudioNeedsTap] = useState(false);

  const QUICK_EMOJIS = ['👋', '😂', '🔥', '❤️', '👍', '🎉', '😮', '👏', '✨', '🚀'];

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLElement | null>(null);
  const activeRemoteVideoTrack = remoteStream
    ?.getVideoTracks()
    .find((track) => track.readyState === 'live' && !track.muted);
  const hasMicrophoneTrack = Boolean(
    localStream?.getAudioTracks().some((track) => track.readyState === 'live')
  );
  const activeRemoteVideoTrackId = activeRemoteVideoTrack?.id;
  const hasRemoteVideo =
    Boolean(activeRemoteVideoTrackId) && decodedRemoteVideoTrackId === activeRemoteVideoTrackId;

  useEffect(() => {
    setDecodedRemoteVideoTrackId((current) =>
      current === activeRemoteVideoTrackId ? current : null
    );
  }, [activeRemoteVideoTrackId]);

  // Play video with autoplay restriction recovery
  const safelyPlayVideo = (videoEl: HTMLVideoElement, isMuted = false, retry = 0) => {
    videoEl.muted = isMuted;
    const playPromise = videoEl.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          if (!isMuted && !videoEl.muted) setRemoteAudioNeedsTap(false);
        })
        .catch((err) => {
          if ((err as { name?: string })?.name === 'AbortError') {
            if (retry < 2) {
              window.setTimeout(() => {
                if (videoEl.isConnected) safelyPlayVideo(videoEl, isMuted, retry + 1);
              }, 100);
            }
            return;
          }

          console.warn('[InCallView] Autoplay blocked, muting temporarily:', err);
          if (isMuted) return;
          videoEl.muted = true;
          setRemoteAudioNeedsTap(true);
          videoEl.play().catch(() => {});
        });
    }
  };

  const enableRemoteAudio = () => {
    const videoEl = remoteVideoRef.current;
    if (!videoEl) return;

    videoEl.muted = false;
    videoEl
      .play()
      .then(() => setRemoteAudioNeedsTap(false))
      .catch(() => {
        videoEl.muted = true;
        setRemoteAudioNeedsTap(true);
      });
  };

  // Callback ref for remote video element
  const setRemoteVideoRef = useCallback(
    (node: HTMLVideoElement | null) => {
      remoteVideoRef.current = node;
      if (node && remoteStream) {
        if (node.srcObject !== remoteStream) {
          node.srcObject = remoteStream;
        }
        safelyPlayVideo(node, false);
      }
    },
    [remoteStream]
  );

  // Callback ref for local video preview element
  const setLocalVideoRef = useCallback(
    (node: HTMLVideoElement | null) => {
      localVideoRef.current = node;
      if (node && localStream) {
        if (node.srcObject !== localStream) {
          node.srcObject = localStream;
        }
        safelyPlayVideo(node, true);
      }
    },
    [localStream]
  );

  const markRemoteVideoReady = useCallback(() => {
    const videoStream = remoteVideoRef.current?.srcObject as MediaStream | null;
    const track = videoStream
      ?.getVideoTracks()
      .find((candidate) => candidate.readyState === 'live' && !candidate.muted);
    if (track) setDecodedRemoteVideoTrackId(track.id);
  }, []);

  // Re-attach whenever stream changes
  useEffect(() => {
    if (remoteVideoRef.current) {
      if (remoteStream) {
        remoteVideoRef.current.srcObject = remoteStream;
        safelyPlayVideo(remoteVideoRef.current, false);
      } else {
        remoteVideoRef.current.srcObject = null;
      }
    }
  }, [remoteStream, callState]);

  useEffect(() => {
    if (localVideoRef.current) {
      if (localStream) {
        localVideoRef.current.srcObject = localStream;
        safelyPlayVideo(localVideoRef.current, true);
      }
    }
  }, [localStream]);

  // Auto-scroll chat to latest message
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior: 'smooth',
      });
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Keyboard navigation: Escape closes emoji popover if open, or triggers Next Stranger
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showEmojiPicker) {
          setShowEmojiPicker(false);
          e.preventDefault();
        } else {
          onNextStranger();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showEmojiPicker, onNextStranger]);

  // Callback ref for emoji picker custom element
  const setEmojiPickerRef = (node: HTMLElement | null) => {
    pickerRef.current = node;
    if (node) {
      const handleEmojiClick = (event: any) => {
        if (event.detail?.unicode) {
          setInputText((prev) => prev + event.detail.unicode);
        }
      };
      node.addEventListener('emoji-click', handleEmojiClick);
    }
  };

  const handleSend = (e: FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    if (onSendMessage(inputText)) {
      setInputText('');
      setShowEmojiPicker(false);
      setChatWarning(null);
    } else {
      setChatWarning('Establishing direct peer connection... please wait');
      setTimeout(() => setChatWarning(null), 3000);
    }
  };

  const handleQuickEmoji = (emoji: string) => {
    const sent = onSendMessage(emoji);
    if (!sent) {
      setInputText((prev) => prev + emoji);
    }
  };

  return (
    <div className="call-layout">
      {/* Studio Cinema Video Stage */}
      <div className="video-container">
        {/* Top Video Stage Overlay */}
        <div className="video-stage-topbar">
          <div className="video-stage-pill">
            <span
              className="live-dot"
              style={{
                background: callState === 'ended' ? '#f43f5e' : undefined,
                boxShadow: callState === 'ended' ? '0 0 10px rgba(244, 63, 94, 0.6)' : undefined,
              }}
            />
            <span>
              {callState === 'ended'
                ? 'Stranger Disconnected'
                : remoteStream
                  ? 'Stranger Connected'
                  : 'Connecting...'}
            </span>
            <span style={{ opacity: 0.5 }}>•</span>
            <span style={{ color: 'var(--text-muted)' }}>
              {callState === 'ended' ? 'Call Ended' : remoteStream ? 'HD 60fps' : 'Negotiating'}
            </span>
          </div>

          <button
            type="button"
            className="video-stage-leave-btn"
            onClick={onLeaveCall}
            title="Leave call and return to stage"
          >
            <ArrowLeft size={16} />
            Back to Stage
          </button>
        </div>

        {callState === 'ended' ? (
          <div className="call-ended-card">
            <div className="call-ended-icon-wrapper">
              <PhoneOff size={32} color="#f43f5e" />
            </div>
            <h2 className="call-ended-title">Stranger Left the Call</h2>
            <p className="call-ended-desc">
              {statusMessage || 'The other user disconnected or left the conversation.'}
            </p>
            <div className="call-ended-actions">
              <button
                type="button"
                className="btn btn-primary call-ended-btn-primary"
                onClick={onNextStranger}
                title="Find next stranger [Esc key]"
              >
                <SkipForward size={18} />
                <span>Find Next Stranger</span>
                <span className="kbd-shortcut-chip">Esc</span>
              </button>
              <button
                type="button"
                className="btn btn-secondary call-ended-btn-secondary"
                onClick={onLeaveCall}
                title="Return to stage"
              >
                <ArrowLeft size={16} />
                <span>Back to Stage</span>
              </button>
            </div>
          </div>
        ) : (
          <>
            <video
              ref={setRemoteVideoRef}
              autoPlay
              playsInline
              className="remote-video"
              style={{
                visibility: hasRemoteVideo ? 'visible' : 'hidden',
              }}
              onLoadedData={markRemoteVideoReady}
              onPlaying={markRemoteVideoReady}
            />
            {remoteAudioNeedsTap &&
              remoteStream
                ?.getAudioTracks()
                .some((track) => track.readyState === 'live' && !track.muted) && (
                <button
                  type="button"
                  className="remote-audio-enable"
                  onClick={enableRemoteAudio}
                  aria-label="Enable sound from stranger"
                >
                  <Volume2 size={18} />
                  Tap to hear stranger
                </button>
              )}
            {!hasRemoteVideo && (
              <div
                style={{
                  position: 'relative',
                  zIndex: 1,
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                  padding: '2rem',
                }}
              >
                <div
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: '50%',
                    background: 'rgba(99, 102, 241, 0.1)',
                    border: '1px solid rgba(99, 102, 241, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 1.25rem',
                  }}
                >
                  <Sparkles size={28} color="var(--accent-primary)" />
                </div>
                <p style={{ fontSize: '1.25rem', fontWeight: 600, color: '#f8fafc' }}>
                  {callState === 'connected'
                    ? 'Waiting for the other camera...'
                    : statusMessage || 'Connecting to stranger...'}
                </p>
                <p
                  style={{
                    fontSize: '0.88rem',
                    color: 'var(--text-secondary)',
                    marginTop: '0.5rem',
                  }}
                >
                  Direct browser-to-browser WebRTC handshake in progress
                </p>
              </div>
            )}
          </>
        )}

        {/* Floating Local Picture-in-Picture Card */}
        <div className="local-video-card" style={{ opacity: isVideoDisabled ? 0.6 : 1 }}>
          <video
            ref={setLocalVideoRef}
            autoPlay
            playsInline
            muted
            className="local-video-preview"
          />
          <div className="local-video-tag">
            <span className="live-dot" style={{ width: 6, height: 6 }} />
            <span>You</span>
            {isAudioMuted && <MicOff size={11} color="var(--accent-danger)" />}
            {isVideoDisabled && <VideoOff size={11} color="var(--accent-danger)" />}
          </div>
        </div>

        {!hasMicrophoneTrack && (
          <div className="call-media-warning" role="status">
            Microphone unavailable. Allow microphone access in browser settings, then rejoin.
          </div>
        )}

        {/* Floating In-Call Controls Dock */}
        <div className="call-controls-overlay">
          <button
            type="button"
            className={`dock-btn ${isAudioMuted ? 'dock-btn-danger' : ''}`}
            onClick={onToggleAudio}
            aria-label={isAudioMuted ? 'Turn microphone on' : 'Turn microphone off'}
            aria-pressed={!isAudioMuted}
            disabled={!hasMicrophoneTrack}
            title={
              hasMicrophoneTrack
                ? isAudioMuted
                  ? 'Unmute Mic'
                  : 'Mute Mic'
                : 'Microphone unavailable. Check browser permissions.'
            }
          >
            {isAudioMuted ? (
              <MicOff size={21} strokeWidth={2.2} />
            ) : (
              <Mic size={21} strokeWidth={2.2} />
            )}
          </button>

          <button
            type="button"
            className={`dock-btn ${isVideoDisabled ? 'dock-btn-danger' : ''}`}
            onClick={onToggleVideo}
            title={isVideoDisabled ? 'Enable Video' : 'Disable Video'}
            aria-label={isVideoDisabled ? 'Turn camera on' : 'Turn camera off'}
            aria-pressed={!isVideoDisabled}
          >
            {isVideoDisabled ? (
              <VideoOff size={21} strokeWidth={2.2} />
            ) : (
              <Video size={21} strokeWidth={2.2} />
            )}
          </button>

          <button
            type="button"
            className="dock-btn-next"
            onClick={onNextStranger}
            title="Next Stranger [Esc key]"
            aria-label="Skip this person and find the next person"
          >
            <SkipForward size={19} strokeWidth={2.4} />
            <span>Next</span>
          </button>

          <button
            type="button"
            className="dock-btn-leave"
            onClick={onLeaveCall}
            title="Leave Call and return to Lobby"
            aria-label="End call and leave"
          >
            <PhoneOff size={21} strokeWidth={2.3} />
          </button>

          <button
            type="button"
            className="dock-btn"
            onClick={() => setIsChatOpen(!isChatOpen)}
            title={isChatOpen ? 'Hide Chat' : 'Show Chat'}
            aria-label={isChatOpen ? 'Hide chat' : 'Show chat'}
            aria-pressed={isChatOpen}
            style={{ position: 'relative' }}
          >
            <MessageSquare size={19} />
            {messages.length > 0 && !isChatOpen && (
              <span
                style={{
                  position: 'absolute',
                  top: 4,
                  right: 4,
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: 'var(--accent-primary)',
                }}
              />
            )}
          </button>

          <button
            type="button"
            className="dock-btn"
            onClick={onOpenReport}
            title="Report inappropriate behavior"
            aria-label="Report inappropriate behavior"
          >
            <ShieldAlert size={19} color="var(--accent-danger)" />
          </button>
        </div>
      </div>

      {/* Glassmorphic Live Chat Sidebar */}
      {isChatOpen && (
        <div className="chat-panel">
          <div className="chat-header">
            <div className="chat-header-left">
              <MessageSquare size={18} color="var(--accent-primary)" />
              <span>Direct Chat</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <span className="chat-header-badge">
                <Lock size={11} />
                P2P Encrypted
              </span>
              <button
                type="button"
                className="emoji-picker-close-btn"
                onClick={() => setIsChatOpen(false)}
                title="Minimize chat"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="chat-messages" ref={chatContainerRef}>
            {messages.length === 0 ? (
              <div
                style={{
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                  margin: 'auto',
                  padding: '1.5rem',
                }}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: '50%',
                    background: 'rgba(255, 255, 255, 0.05)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 0.75rem',
                  }}
                >
                  <MessageSquare size={20} color="var(--text-secondary)" />
                </div>
                <p style={{ fontWeight: 600, color: '#f1f5f9', fontSize: '0.95rem' }}>
                  No messages yet
                </p>
                <p style={{ fontSize: '0.82rem', marginTop: '0.35rem', lineHeight: 1.4 }}>
                  Say hello! Messages travel strictly peer-to-peer over RTCDataChannel. Zero server
                  logging.
                </p>
              </div>
            ) : (
              messages.map((m) => (
                <div
                  key={m.id}
                  className={`chat-bubble ${m.isSelf ? 'chat-bubble-self' : 'chat-bubble-peer'}`}
                >
                  <div>{m.content}</div>
                  <span className="chat-bubble-time">
                    {new Date(m.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Dismissible Emoji Picker Popover */}
          {showEmojiPicker && (
            <>
              <button
                type="button"
                className="emoji-backdrop"
                onClick={() => setShowEmojiPicker(false)}
                aria-label="Close emoji picker"
                style={{ background: 'transparent', border: 'none', padding: 0 }}
              />
              <div className="emoji-picker-container">
                <div className="emoji-picker-header">
                  <button
                    type="button"
                    className="emoji-picker-back-btn"
                    onClick={() => setShowEmojiPicker(false)}
                    title="Back to Chat (Esc)"
                  >
                    <ArrowLeft size={15} />
                    <span>Back to Chat</span>
                  </button>
                  <button
                    type="button"
                    className="emoji-picker-close-btn"
                    onClick={() => setShowEmojiPicker(false)}
                    title="Close [Esc]"
                  >
                    <X size={16} />
                  </button>
                </div>
                {/* @ts-ignore custom element */}
                <emoji-picker ref={setEmojiPickerRef} class="dark"></emoji-picker>
              </div>
            </>
          )}

          {/* Quick Reaction Emoji Pill Bar (no scrollbar) */}
          <div className="quick-emoji-bar">
            {QUICK_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className="quick-emoji-btn"
                onClick={() => handleQuickEmoji(emoji)}
                title={`Send ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>

          {chatWarning && <div className="chat-alert-banner">{chatWarning}</div>}

          <form className="chat-input-area" onSubmit={handleSend}>
            <button
              type="button"
              className={`dock-btn ${showEmojiPicker ? 'dock-btn-active' : ''}`}
              style={{ width: 38, height: 38, flexShrink: 0 }}
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              title={showEmojiPicker ? 'Back to Chat' : 'Pick Emoji'}
            >
              {showEmojiPicker ? <ArrowLeft size={18} /> : <Smile size={18} />}
            </button>
            <input
              type="text"
              className="chat-input"
              placeholder={showEmojiPicker ? 'Select emoji or click Back...' : 'Type message...'}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
            />
            <button
              type="submit"
              className="btn btn-primary"
              style={{
                width: 38,
                height: 38,
                padding: 0,
                borderRadius: '50%',
                flexShrink: 0,
              }}
              title="Send message (Enter)"
            >
              <Send size={16} />
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

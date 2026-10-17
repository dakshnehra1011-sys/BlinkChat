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
  X,
} from 'lucide-react';
import type { FC, FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import 'emoji-picker-element';
import type { CallState, ChatMessage } from '../hooks/useWebRTC.js';

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

  const QUICK_EMOJIS = ['👋', '😂', '🔥', '❤️', '👍', '🎉', '😮', '👏', '✨', '🚀'];

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLElement | null>(null);

  // Attach local stream
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
      localVideoRef.current.play().catch(() => {});
    }
  }, [localStream]);

  // Attach remote stream
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
      remoteVideoRef.current.play().catch(() => {});
    }
  }, [remoteStream]);

  // Auto-scroll chat on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

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
            <span className="live-dot" />
            <span>{remoteStream ? 'Stranger Connected' : 'Connecting...'}</span>
            <span style={{ opacity: 0.5 }}>•</span>
            <span style={{ color: 'var(--text-muted)' }}>
              {remoteStream ? 'HD 60fps' : 'Negotiating'}
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

        {remoteStream ? (
          <video ref={remoteVideoRef} autoPlay playsInline className="remote-video" />
        ) : (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
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
              {statusMessage || 'Connecting to stranger...'}
            </p>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
              Direct browser-to-browser WebRTC handshake in progress
            </p>
          </div>
        )}

        {/* Floating Local Picture-in-Picture Card */}
        <div className="local-video-card" style={{ opacity: isVideoDisabled ? 0.6 : 1 }}>
          <video ref={localVideoRef} autoPlay playsInline muted className="local-video-preview" />
          <div className="local-video-tag">
            <span className="live-dot" style={{ width: 6, height: 6 }} />
            <span>You</span>
            {isAudioMuted && <MicOff size={11} color="var(--accent-danger)" />}
            {isVideoDisabled && <VideoOff size={11} color="var(--accent-danger)" />}
          </div>
        </div>

        {/* Floating In-Call Controls Dock */}
        <div className="call-controls-overlay">
          <button
            type="button"
            className={`dock-btn ${isAudioMuted ? 'dock-btn-danger' : ''}`}
            onClick={onToggleAudio}
            title={isAudioMuted ? 'Unmute Mic' : 'Mute Mic'}
          >
            {isAudioMuted ? <MicOff size={19} /> : <Mic size={19} />}
          </button>

          <button
            type="button"
            className={`dock-btn ${isVideoDisabled ? 'dock-btn-danger' : ''}`}
            onClick={onToggleVideo}
            title={isVideoDisabled ? 'Enable Video' : 'Disable Video'}
          >
            {isVideoDisabled ? <VideoOff size={19} /> : <Video size={19} />}
          </button>

          <button
            type="button"
            className="dock-btn-next"
            onClick={onNextStranger}
            title="Next Stranger [Esc key]"
          >
            <SkipForward size={18} />
            <span>Next</span>
          </button>

          <button
            type="button"
            className="dock-btn-leave"
            onClick={onLeaveCall}
            title="Leave Call and return to Lobby"
          >
            <PhoneOff size={19} />
          </button>

          <button
            type="button"
            className="dock-btn"
            onClick={() => setIsChatOpen(!isChatOpen)}
            title={isChatOpen ? 'Hide Chat' : 'Show Chat'}
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

          <div className="chat-messages">
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
                  <span>Reactions & Emojis</span>
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
              className="dock-btn"
              style={{ width: 38, height: 38, flexShrink: 0 }}
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              title={showEmojiPicker ? 'Close Emoji Picker' : 'Pick Emoji'}
            >
              <Smile size={18} />
            </button>
            <input
              type="text"
              className="chat-input"
              placeholder="Type message..."
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

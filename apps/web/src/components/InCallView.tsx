import {
  MessageSquare,
  Mic,
  MicOff,
  PhoneOff,
  Send,
  ShieldAlert,
  SkipForward,
  Smile,
  Video,
  VideoOff,
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

  // Auto-scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

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
      {/* Video Tile Area */}
      <div className="video-container">
        {remoteStream ? (
          <video ref={remoteVideoRef} autoPlay playsInline className="remote-video" />
        ) : (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
            <p style={{ fontSize: '1.25rem', fontWeight: 600 }}>
              {statusMessage || 'Connecting to stranger...'}
            </p>
          </div>
        )}

        {/* Floating Local Mirror */}
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          className="local-video-preview"
          style={{ opacity: isVideoDisabled ? 0 : 1 }}
        />

        {/* Floating Call Controls Overlay */}
        <div className="call-controls-overlay">
          <button
            className={`btn btn-icon ${isAudioMuted ? 'btn-danger' : 'btn-secondary'}`}
            onClick={onToggleAudio}
            title={isAudioMuted ? 'Unmute' : 'Mute'}
          >
            {isAudioMuted ? <MicOff size={20} /> : <Mic size={20} />}
          </button>

          <button
            className={`btn btn-icon ${isVideoDisabled ? 'btn-danger' : 'btn-secondary'}`}
            onClick={onToggleVideo}
            title={isVideoDisabled ? 'Enable Video' : 'Disable Video'}
          >
            {isVideoDisabled ? <VideoOff size={20} /> : <Video size={20} />}
          </button>

          <button className="btn btn-primary" onClick={onNextStranger} title="Next Stranger (Esc)">
            <SkipForward size={20} />
            Next
          </button>

          <button className="btn btn-danger btn-icon" onClick={onLeaveCall} title="Leave Call">
            <PhoneOff size={20} />
          </button>

          <button
            className="btn btn-secondary btn-icon"
            onClick={() => setIsChatOpen(!isChatOpen)}
            title="Toggle Chat"
          >
            <MessageSquare size={20} />
          </button>

          <button className="btn btn-secondary btn-icon" onClick={onOpenReport} title="Report User">
            <ShieldAlert size={20} color="var(--accent-danger)" />
          </button>
        </div>
      </div>

      {/* RTCDataChannel Live Chat Panel */}
      {isChatOpen && (
        <div className="chat-panel">
          <div className="chat-header">
            <span>Direct P2P Chat</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 400 }}>
              End-to-end encrypted
            </span>
          </div>

          <div className="chat-messages">
            {messages.length === 0 ? (
              <div
                style={{
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                  margin: 'auto',
                  fontSize: '0.9rem',
                }}
              >
                Say hello! Messages travel directly between browsers via RTCDataChannel.
              </div>
            ) : (
              messages.map((m) => (
                <div
                  key={m.id}
                  className={`chat-bubble ${m.isSelf ? 'chat-bubble-self' : 'chat-bubble-peer'}`}
                >
                  {m.content}
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Emoji Picker Overlay */}
          {showEmojiPicker && (
            <div className="emoji-picker-container">
              {/* @ts-ignore custom element */}
              <emoji-picker ref={setEmojiPickerRef} class="dark"></emoji-picker>
            </div>
          )}

          {/* Quick Reaction Emoji Bar */}
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
              className="btn btn-secondary btn-icon"
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              title="Add Emoji"
            >
              <Smile size={18} />
            </button>
            <input
              type="text"
              className="chat-input"
              placeholder="Type a message..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
            />
            <button type="submit" className="btn btn-primary btn-icon" title="Send message">
              <Send size={18} />
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

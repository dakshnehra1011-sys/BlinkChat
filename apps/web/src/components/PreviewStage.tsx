import { ArrowLeft, Loader2, Mic, MicOff, Search, Sparkles, Video, VideoOff } from 'lucide-react';
import type { FC } from 'react';
import { useEffect, useRef } from 'react';
import type { CallState } from '../hooks/useWebRTC';

interface PreviewStageProps {
  callState: CallState;
  localStream: MediaStream | null;
  isAudioMuted: boolean;
  isVideoDisabled: boolean;
  statusMessage: string;
  onStartPreview: () => void;
  onFindStranger: () => void;
  onCancelQueue: () => void;
  onBackHome: () => void;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
}

export const PreviewStage: FC<PreviewStageProps> = ({
  callState,
  localStream,
  isAudioMuted,
  isVideoDisabled,
  statusMessage,
  onStartPreview,
  onFindStranger,
  onCancelQueue,
  onBackHome,
  onToggleAudio,
  onToggleVideo,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && localStream) {
      videoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (!localStream) {
      onStartPreview();
    }
  }, [localStream, onStartPreview]);

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem 1.5rem',
        background: 'transparent',
      }}
    >
      {/* Navigation Header */}
      <div
        style={{
          width: '100%',
          maxWidth: '680px',
          marginBottom: '1rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onBackHome}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.88rem',
          }}
          title="Back to Landing Page"
        >
          <ArrowLeft size={16} />
          Back to Home
        </button>

        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.45rem',
            fontSize: '0.82rem',
            color: 'var(--text-secondary)',
            fontWeight: 500,
          }}
        >
          <Sparkles size={14} color="var(--accent-primary)" />
          Lobby Stage
        </span>
      </div>

      <div
        style={{
          width: '100%',
          maxWidth: '680px',
          background: 'rgba(15, 23, 42, 0.82)',
          backdropFilter: 'blur(35px) saturate(200%)',
          WebkitBackdropFilter: 'blur(35px) saturate(200%)',
          border: '1px solid rgba(255, 255, 255, 0.4)',
          borderRadius: '26px',
          overflow: 'hidden',
          boxShadow: '0 30px 70px -15px rgba(2, 45, 80, 0.45), 0 0 0 1px rgba(255, 255, 255, 0.25)',
        }}
      >
        <div
          style={{
            position: 'relative',
            width: '100%',
            aspectRatio: '16/9',
            background: '#030712',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
          />

          {isVideoDisabled && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: '#090d16',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-muted)',
              }}
            >
              <div
                style={{
                  width: 60,
                  height: 60,
                  borderRadius: '50%',
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '0.75rem',
                }}
              >
                <VideoOff size={28} color="#f87171" />
              </div>
              <p style={{ fontWeight: 600, color: '#f1f5f9' }}>Camera Muted</p>
              <p
                style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}
              >
                Your video is currently hidden
              </p>
            </div>
          )}

          {/* Floating preview controls */}
          <div
            style={{
              position: 'absolute',
              bottom: '1.25rem',
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex',
              gap: '0.75rem',
              background: 'rgba(15, 23, 42, 0.85)',
              backdropFilter: 'blur(16px)',
              padding: '0.5rem 1rem',
              borderRadius: '9999px',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
            }}
          >
            <button
              type="button"
              className={`dock-btn ${isAudioMuted ? 'dock-btn-danger' : ''}`}
              onClick={onToggleAudio}
              title={isAudioMuted ? 'Unmute' : 'Mute'}
            >
              {isAudioMuted ? <MicOff size={18} /> : <Mic size={18} />}
            </button>
            <button
              type="button"
              className={`dock-btn ${isVideoDisabled ? 'dock-btn-danger' : ''}`}
              onClick={onToggleVideo}
              title={isVideoDisabled ? 'Enable Camera' : 'Disable Camera'}
            >
              {isVideoDisabled ? <VideoOff size={18} /> : <Video size={18} />}
            </button>
          </div>
        </div>

        <div style={{ padding: '1.75rem', textAlign: 'center' }}>
          <p
            style={{ color: 'var(--text-secondary)', marginBottom: '1.25rem', fontSize: '0.95rem' }}
          >
            {statusMessage || 'Camera and microphone preview active'}
          </p>

          {callState === 'queued' ? (
            <div style={{ display: 'flex', gap: '0.75rem', width: '100%' }}>
              <button
                type="button"
                className="btn btn-primary"
                style={{
                  flex: 1,
                  padding: '0.9rem',
                  fontSize: '1.05rem',
                }}
                disabled
              >
                <Loader2 className="animate-spin" size={20} />
                Looking for a stranger...
              </button>
              <button
                type="button"
                className="btn btn-danger"
                style={{
                  padding: '0.9rem 1.5rem',
                  fontWeight: 600,
                  borderRadius: 'var(--radius-md)',
                }}
                onClick={onCancelQueue}
                title="Cancel Search"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              style={{
                width: '100%',
                padding: '0.95rem',
                fontSize: '1.05rem',
              }}
              onClick={onFindStranger}
            >
              <Search size={20} />
              Find Stranger
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

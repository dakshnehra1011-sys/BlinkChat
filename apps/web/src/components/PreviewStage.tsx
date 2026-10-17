import { ArrowLeft, Loader2, Mic, MicOff, Search, Video, VideoOff } from 'lucide-react';
import type { FC } from 'react';
import { useEffect, useRef } from 'react';
import type { CallState } from '../hooks/useWebRTC.js';

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
        padding: '2rem',
      }}
    >
      {/* Back to Home Navigation Bar */}
      <div
        style={{
          width: '100%',
          maxWidth: '640px',
          marginBottom: '1rem',
          display: 'flex',
          justifyContent: 'flex-start',
        }}
      >
        <button
          className="btn btn-secondary"
          onClick={onBackHome}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
          title="Back to Landing Page"
        >
          <ArrowLeft size={16} />
          Back to Home
        </button>
      </div>

      <div
        style={{
          width: '100%',
          maxWidth: '640px',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        <div
          style={{
            position: 'relative',
            width: '100%',
            aspectRatio: '16/9',
            background: '#000',
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
                background: '#0f172a',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-muted)',
              }}
            >
              <VideoOff size={48} />
              <p style={{ marginTop: '0.75rem', fontWeight: 600 }}>Camera Disabled</p>
            </div>
          )}

          {/* Floating preview controls */}
          <div
            style={{
              position: 'absolute',
              bottom: '1rem',
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex',
              gap: '0.75rem',
              background: 'rgba(15, 23, 42, 0.75)',
              backdropFilter: 'blur(8px)',
              padding: '0.5rem 1rem',
              borderRadius: 'var(--radius-full)',
            }}
          >
            <button
              className={`btn btn-icon ${isAudioMuted ? 'btn-danger' : 'btn-secondary'}`}
              onClick={onToggleAudio}
              title={isAudioMuted ? 'Unmute' : 'Mute'}
            >
              {isAudioMuted ? <MicOff size={18} /> : <Mic size={18} />}
            </button>
            <button
              className={`btn btn-icon ${isVideoDisabled ? 'btn-danger' : 'btn-secondary'}`}
              onClick={onToggleVideo}
              title={isVideoDisabled ? 'Enable Camera' : 'Disable Camera'}
            >
              {isVideoDisabled ? <VideoOff size={18} /> : <Video size={18} />}
            </button>
          </div>
        </div>

        <div style={{ padding: '1.5rem', textAlign: 'center' }}>
          <p
            style={{ color: 'var(--text-secondary)', marginBottom: '1.25rem', fontSize: '0.95rem' }}
          >
            {statusMessage || 'Camera and microphone preview'}
          </p>

          {callState === 'queued' ? (
            <div style={{ display: 'flex', gap: '0.75rem', width: '100%' }}>
              <button
                className="btn btn-primary"
                style={{ flex: 1, padding: '0.9rem', fontSize: '1.05rem' }}
                disabled
              >
                <Loader2 className="animate-spin" size={20} />
                Looking for a stranger...
              </button>
              <button
                className="btn btn-danger"
                style={{ padding: '0.9rem 1.5rem', fontWeight: 600 }}
                onClick={onCancelQueue}
                title="Cancel Search"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              className="btn btn-primary"
              style={{ width: '100%', padding: '0.9rem', fontSize: '1.05rem' }}
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

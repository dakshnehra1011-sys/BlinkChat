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
  const hasMicrophoneTrack = Boolean(
    localStream?.getAudioTracks().some((track) => track.readyState === 'live')
  );

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
    <div className="preview-stage">
      {/* Navigation Header */}
      <div className="preview-header">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onBackHome}
          aria-label="Back to home"
          title="Back to Landing Page"
        >
          <ArrowLeft size={16} />
          Back to Home
        </button>

        <span className="preview-stage-label">
          <Sparkles size={14} color="var(--accent-primary)" />
          Lobby Stage
        </span>
      </div>

      <div className="preview-card">
        <div className="preview-screen">
          <video ref={videoRef} autoPlay playsInline muted className="preview-video" />

          {isVideoDisabled && (
            <div className="preview-camera-off">
              <div className="preview-camera-off-icon">
                <VideoOff size={28} color="#f87171" />
              </div>
              <p className="preview-camera-off-title">Camera Muted</p>
              <p className="preview-camera-off-hint">Your video is currently hidden</p>
            </div>
          )}

          {/* Floating preview controls */}
          <div className="preview-controls">
            <button
              type="button"
              className={`dock-btn ${isAudioMuted ? 'dock-btn-danger' : ''}`}
              onClick={onToggleAudio}
              title={
                hasMicrophoneTrack
                  ? isAudioMuted
                    ? 'Unmute'
                    : 'Mute'
                  : 'Microphone unavailable. Check browser permissions.'
              }
              aria-label={isAudioMuted ? 'Turn microphone on' : 'Turn microphone off'}
              disabled={!hasMicrophoneTrack}
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

        <div className="preview-card-content">
          <p className="preview-status">
            {statusMessage || 'Camera and microphone preview active'}
          </p>

          {callState === 'queued' ? (
            <div className="preview-queue-actions">
              <button type="button" className="btn btn-primary preview-queue-search" disabled>
                <Loader2 className="animate-spin" size={20} />
                Looking for a stranger...
              </button>
              <button
                type="button"
                className="btn btn-danger preview-queue-cancel"
                onClick={onCancelQueue}
                title="Cancel Search"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-primary preview-find-button"
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

import {
  ArrowRight,
  Headphones,
  Lock,
  MessageSquare,
  Mic,
  Paperclip,
  Shield,
  SkipForward,
  Video,
  Zap,
} from 'lucide-react';
import type { FC } from 'react';

interface LandingViewProps {
  onStart: () => void;
  isLoggedIn?: boolean;
}

export const LandingView: FC<LandingViewProps> = ({ onStart, isLoggedIn }) => {
  return (
    <div className="landing-hero">
      <h1 className="landing-title">Real-Time Video Chat with Strangers Worldwide</h1>
      <p className="landing-subtitle">
        BlinkChat connects you directly to random people worldwide via peer-to-peer WebRTC. Zero
        call recording, zero chat logging, and instant edge matchmaking.
      </p>

      <button
        className="btn btn-primary"
        style={{ padding: '0.9rem 2.4rem', fontSize: '1.05rem', borderRadius: '12px' }}
        onClick={onStart}
      >
        <Video size={20} />
        {isLoggedIn ? 'Enter Video Chat Stage' : 'Start Video Chat Now'}
        <ArrowRight size={18} />
      </button>

      {/* Clario-inspired Frosted Glass Window Preview Mockup */}
      <div className="clario-window">
        <div className="clario-window-topbar">
          <div className="clario-window-dots">
            <span className="clario-window-dot clario-dot-red" />
            <span className="clario-window-dot clario-dot-yellow" />
            <span className="clario-window-dot clario-dot-green" />
            <span
              style={{
                fontSize: '0.82rem',
                fontWeight: 600,
                color: 'rgba(255, 255, 255, 0.85)',
                marginLeft: '0.5rem',
              }}
            >
              BlinkChat Live Stage
            </span>
          </div>
          <div className="clario-window-status">
            <span className="live-dot" style={{ width: 7, height: 7 }} />
            <span>P2P Encrypted</span>
          </div>
        </div>

        <div className="clario-window-body">
          <div className="clario-search-pill">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Headphones size={16} color="#60a5fa" />
              <Mic size={16} color="#60a5fa" />
            </div>
            <span style={{ flex: 1, fontSize: '0.92rem', color: '#f8fafc', fontWeight: 500 }}>
              What is BlinkChat?
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <Video size={16} color="#94a3b8" />
              <Paperclip size={16} color="#94a3b8" />
              <span className="clario-badge-c">B</span>
            </div>
          </div>

          <div className="clario-card-bubble">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '0.75rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div className="brand-icon-orb" style={{ width: 22, height: 22 }}>
                  <Zap size={12} fill="#ffffff" color="#ffffff" />
                </div>
                <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#ffffff' }}>
                  BlinkChat Network
                </span>
              </div>
              <span className="clario-tag-pill">P2P Verified</span>
            </div>
            <p
              style={{
                fontSize: '0.92rem',
                color: 'rgba(255, 255, 255, 0.92)',
                lineHeight: 1.55,
              }}
            >
              "BlinkChat is your ultra-low latency random video platform. Calls and text messages
              travel strictly peer-to-peer over WebRTC RTCDataChannel with zero server persistence.
              Seamlessly jump between strangers with instant edge matchmaking."
            </p>
          </div>

          <div className="clario-dock-bar">
            <div className="clario-dock-icon clario-dock-camera" title="HD Video Camera">
              <Video size={18} />
            </div>
            <div className="clario-dock-icon clario-dock-mic" title="Crystal Audio">
              <Mic size={18} />
            </div>
            <div className="clario-dock-icon clario-dock-next" title="Next Stranger">
              <SkipForward size={18} />
            </div>
            <div className="clario-dock-icon clario-dock-chat" title="Direct Encrypted Chat">
              <MessageSquare size={18} />
            </div>
            <div className="clario-dock-icon clario-dock-shield" title="Privacy Guaranteed">
              <Shield size={18} />
            </div>
          </div>
        </div>
      </div>

      <div className="features-grid">
        <div className="feature-card">
          <Zap className="feature-icon" size={28} />
          <h3 className="feature-title">Ultra-Low Latency</h3>
          <p className="feature-desc">
            Direct peer-to-peer media streaming powered by WebRTC delivers sub-100ms video frames
            worldwide.
          </p>
        </div>

        <div className="feature-card">
          <Lock className="feature-icon" size={28} />
          <h3 className="feature-title">Strict Privacy Architecture</h3>
          <p className="feature-desc">
            Video, audio, and messages flow strictly between the two connected browsers over
            encrypted DTLS-SRTP and RTCDataChannel.
          </p>
        </div>

        <div className="feature-card">
          <Shield className="feature-icon" size={28} />
          <h3 className="feature-title">Edge Matchmaking</h3>
          <p className="feature-desc">
            Cloudflare Workers and stateful Durable Objects manage matchmaking queues with
            instantaneous handoffs and DDoS defense.
          </p>
        </div>
      </div>
    </div>
  );
};

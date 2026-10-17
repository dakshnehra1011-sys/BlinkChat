import { ArrowRight, Lock, Shield, Zap } from 'lucide-react';
import type { FC } from 'react';

interface LandingViewProps {
  onStart: () => void;
}

export const LandingView: FC<LandingViewProps> = ({ onStart }) => {
  return (
    <div className="landing-hero">
      <h1 className="landing-title">Meet Strangers Instantly with Ultra-Low Latency Video</h1>
      <p className="landing-subtitle">
        BlinkChat connects you to random people worldwide via direct browser-to-browser WebRTC. No
        video or audio ever touches a central server. Zero call recording, zero chat persistence.
      </p>

      <button
        className="btn btn-primary"
        style={{ padding: '0.9rem 2.2rem', fontSize: '1.1rem' }}
        onClick={onStart}
      >
        Start Chatting Now
        <ArrowRight size={20} />
      </button>

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
            instantaneous handoffs and automated DDoS defense.
          </p>
        </div>
      </div>
    </div>
  );
};

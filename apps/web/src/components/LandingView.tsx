import { ArrowRight, Lock, Shield, Video, Zap } from 'lucide-react';
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

      <button className="btn btn-primary landing-cta" onClick={onStart}>
        <Video size={20} />
        {isLoggedIn ? 'Enter Video Chat Stage' : 'Start Video Chat Now'}
        <ArrowRight size={18} />
      </button>

      <div className="features-grid">
        <div className="feature-card">
          <div className="feature-icon-bubble">
            <Zap size={24} />
          </div>
          <h3 className="feature-title">Ultra-Low Latency</h3>
          <p className="feature-desc">
            Direct peer-to-peer media streaming powered by WebRTC delivers sub-100ms video frames
            worldwide.
          </p>
        </div>

        <div className="feature-card">
          <div className="feature-icon-bubble">
            <Lock size={24} />
          </div>
          <h3 className="feature-title">Strict Privacy Architecture</h3>
          <p className="feature-desc">
            Video, audio, and messages flow strictly between the two connected browsers over
            encrypted DTLS-SRTP and RTCDataChannel.
          </p>
        </div>

        <div className="feature-card">
          <div className="feature-icon-bubble">
            <Shield size={24} />
          </div>
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

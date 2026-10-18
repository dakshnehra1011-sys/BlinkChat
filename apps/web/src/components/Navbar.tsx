import { Home, LogIn, LogOut, Radio, ShieldCheck, Video, Zap } from 'lucide-react';
import type { FC } from 'react';

interface NavbarProps {
  user: { email: string; emailVerified: boolean } | null;
  isDirectConnection: boolean | null;
  activeView: 'home' | 'stage';
  onNavigateHome: () => void;
  onNavigateStage: () => void;
  onOpenAuth: () => void;
  onLogout: () => void;
}

export const Navbar: FC<NavbarProps> = ({
  user,
  isDirectConnection,
  activeView,
  onNavigateHome,
  onNavigateStage,
  onOpenAuth,
  onLogout,
}) => {
  return (
    <nav className="navbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: '2.5rem' }}>
        <button
          type="button"
          className="brand"
          onClick={onNavigateHome}
          style={{
            background: 'transparent',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            textAlign: 'left',
            font: 'inherit',
            color: 'inherit',
          }}
          title="Go to Home"
        >
          <div className="brand-icon-orb">
            <Zap size={18} fill="#ffffff" color="#ffffff" />
          </div>
          <span>BlinkChat</span>
        </button>

        <div className="nav-links">
          <span className="nav-link" onClick={onNavigateHome}>
            Live Stage
          </span>
          <span className="nav-link" onClick={onNavigateHome}>
            Privacy
          </span>
          <span className="nav-link" onClick={onNavigateHome}>
            Architecture
          </span>
          <a
            href="https://github.com/dakshnehra1011-sys/BlinkChat"
            target="_blank"
            rel="noreferrer"
            className="nav-link"
          >
            GitHub
          </a>
        </div>
      </div>

      <div className="nav-actions">
        {isDirectConnection !== null && (
          <span className={`badge ${isDirectConnection ? 'badge-success' : 'badge-warning'}`}>
            <Radio size={12} />
            {isDirectConnection ? 'P2P Direct' : 'TURN Relay'}
          </span>
        )}

        {user ? (
          <>
            {activeView === 'stage' ? (
              <button
                className="btn btn-secondary"
                onClick={onNavigateHome}
                title="Back to Homepage"
              >
                <Home size={16} />
                Home
              </button>
            ) : (
              <button
                className="btn btn-primary"
                onClick={onNavigateStage}
                title="Start Video Chat"
              >
                <Video size={16} />
                Start Chat
              </button>
            )}
            <span className="badge badge-success">
              <ShieldCheck size={14} />
              {user.email}
            </span>
            <button className="btn btn-secondary" onClick={onLogout} title="Log Out">
              <LogOut size={16} />
              Log Out
            </button>
          </>
        ) : (
          <button className="btn btn-primary" onClick={onOpenAuth}>
            <LogIn size={16} />
            Sign In / Register
          </button>
        )}
      </div>
    </nav>
  );
};

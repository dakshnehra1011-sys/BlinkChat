import { Home, LogIn, LogOut, Radio, ShieldCheck, Video, Zap } from 'lucide-react';
import type { FC } from 'react';

interface NavbarProps {
  user: { email: string } | null;
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

      <div className="nav-actions">
        {isDirectConnection !== null && (
          <span
            className={`badge nav-connection-badge ${isDirectConnection ? 'badge-success' : 'badge-warning'}`}
          >
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
                aria-label="Go to home"
                title="Back to Homepage"
              >
                <Home size={16} />
                <span>Home</span>
              </button>
            ) : (
              <button
                className="btn btn-primary"
                onClick={onNavigateStage}
                aria-label="Start video chat"
                title="Start Video Chat"
              >
                <Video size={16} />
                <span>Start Chat</span>
              </button>
            )}
            <span className="badge badge-success nav-user-badge" title={user.email}>
              <ShieldCheck size={14} />
              <span className="nav-user-email">{user.email}</span>
            </span>
            <button
              className="btn btn-secondary"
              onClick={onLogout}
              aria-label="Log out"
              title="Log Out"
            >
              <LogOut size={16} />
              <span>Log Out</span>
            </button>
          </>
        ) : (
          <button
            className="btn btn-primary"
            onClick={onOpenAuth}
            aria-label="Sign in or register"
            title="Sign In / Register"
          >
            <LogIn size={16} />
            <span>Sign In / Register</span>
          </button>
        )}
      </div>
    </nav>
  );
};

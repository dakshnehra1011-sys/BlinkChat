import { LogIn, LogOut, Radio, ShieldCheck, Zap } from 'lucide-react';
import type { FC } from 'react';

interface NavbarProps {
  user: { email: string; emailVerified: boolean } | null;
  isDirectConnection: boolean | null;
  onOpenAuth: () => void;
  onLogout: () => void;
}

export const Navbar: FC<NavbarProps> = ({ user, isDirectConnection, onOpenAuth, onLogout }) => {
  return (
    <nav className="navbar">
      <div className="brand">
        <Zap className="brand-icon" size={28} />
        <span>BlinkChat</span>
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
            <span className="badge badge-success">
              <ShieldCheck size={14} />
              {user.email}
            </span>
            <button className="btn btn-secondary" onClick={onLogout}>
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

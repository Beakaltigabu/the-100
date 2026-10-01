import { useAuth } from '../context/AuthContext';
import './ImpersonationBanner.css';

// Shown when an admin is viewing the app "as" a member.
export default function ImpersonationBanner() {
  const { user } = useAuth();
  const active = !!sessionStorage.getItem('the100_impersonation');
  if (!active) return null;

  const exit = () => {
    sessionStorage.removeItem('the100_impersonation');
    window.location.reload();
  };

  return (
    <div className="impb" role="banner">
      <div className="impb__inner">
        <span>
          Viewing as <strong>{user?.name || 'a member'}</strong> (impersonation — actions are logged)
        </span>
        <button className="btn btn--primary btn--sm" onClick={exit}>
          Exit view
        </button>
      </div>
    </div>
  );
}
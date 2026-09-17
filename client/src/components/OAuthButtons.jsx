import './OAuthButtons.css';
import { useLanguage } from '../context/LanguageContext';
import { API_BASE } from '../api/config';

export default function OAuthButtons({ returnTo }) {
  const { t } = useLanguage();
  const qs = returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : '';

  return (
    <div className="oauth">
      <div className="oauth__divider">
        <span>{t('orContinueWith')}</span>
      </div>
      <a className="oauth__btn oauth__btn--google" href={`${API_BASE}/api/auth/google${qs}`}>
        <span className="oauth__mark oauth__mark--google">G</span>
        {t('continueWithGoogle')}
      </a>
    </div>
  );
}
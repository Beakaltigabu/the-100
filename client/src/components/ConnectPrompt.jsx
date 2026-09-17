import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import { useLanguage } from '../context/LanguageContext';
import { useToast } from '../components/Toast';
import Modal from './Modal';
import Button from './Button';
import './ConnectPrompt.css';

export default function ConnectPrompt({ open, onClose }) {
  const { t } = useLanguage();
  const { showToast } = useToast();
  const [strava, setStrava] = useState({ configured: true, connected: false });
  const [telegram, setTelegram] = useState({ configured: true, connected: false });

  const load = useCallback(() => {
    if (!open) return;
    api
      .get('/api/integrations/strava/status')
      .then(setStrava)
      .catch(() => setStrava({ configured: false, connected: false }));
    api
      .get('/api/integrations/telegram/status')
      .then(setTelegram)
      .catch(() => setTelegram({ configured: false, connected: false }));
  }, [open]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [open, load]);

  const connectStrava = () => {
    api
      .get('/api/integrations/strava/connect?returnTo=/dashboard')
      .then((d) => {
        window.location.href = d.url;
      })
      .catch((err) => showToast(err.status === 503 ? t('stravaNotConfigured') : err.message, 'error'));
  };

  const connectTelegram = () => {
    api
      .get('/api/integrations/telegram/connect')
      .then((d) => window.open(d.deepLink, '_blank'))
      .catch((err) => showToast(err.status === 503 ? t('telegramNotConfigured') : err.message, 'error'));
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('connectPromptTitle')}
      footer={
        <button className="modal__cancel" onClick={onClose}>
          {t('maybeLater')}
        </button>
      }
    >
      <p className="connect-prompt__intro">{t('connectPromptIntro')}</p>

      <div className="connect-prompt__row">
        <div className="connect-prompt__info">
          <span className="connect-prompt__name">Strava</span>
          <span className="connect-prompt__desc">{t('connectStravaDesc')}</span>
        </div>
        {strava.connected ? (
          <Button variant="secondary" size="sm" disabled>
            {t('connected')}
          </Button>
        ) : (
          <Button variant="primary" size="sm" onClick={connectStrava} disabled={strava.configured === false}>
            {t('connectStrava')}
          </Button>
        )}
      </div>

      <div className="connect-prompt__row">
        <div className="connect-prompt__info">
          <span className="connect-prompt__name">{t('telegram')}</span>
          <span className="connect-prompt__desc">{t('connectTelegramDesc')}</span>
        </div>
        {telegram.connected ? (
          <Button variant="secondary" size="sm" disabled>
            {t('connected')}
          </Button>
        ) : (
          <Button variant="primary" size="sm" onClick={connectTelegram} disabled={telegram.configured === false}>
            {t('joinCommunity')}
          </Button>
        )}
      </div>

      <p className="connect-prompt__note">{t('connectPromptNote')}</p>
    </Modal>
  );
}
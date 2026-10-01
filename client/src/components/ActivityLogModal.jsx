import { useState } from 'react';
import { api } from '../api/client';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from './Toast';
import Button from './Button';
import Modal from './Modal';
import { ACTIVITY_KEYS, activityLabelKey, unitKey } from '../lib/activity';
import { todayISO } from '../lib/time';
import './ActivityLogModal.css';

// Real activity logger — POSTs to /api/activities/manual (same flow as My 100).
export default function ActivityLogModal({ open, onClose, onLogged }) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [activityType, setActivityType] = useState(user?.activityType || 'running');
  const [quantity, setQuantity] = useState('');
  const [busy, setBusy] = useState(false);
  const unit = unitKey(activityType);

  const submit = async (e) => {
    e.preventDefault();
    const qty = parseFloat(quantity);
    if (!qty || qty <= 0) {
      showToast(t('invalidQuantity'), 'error');
      return;
    }
    setBusy(true);
    try {
      const res = await api.post('/api/activities/manual', {
        date: todayISO(),
        quantity: qty,
        activity_type: activityType
      });
      showToast(`${qty} ${t(unit)} ${t('logged')}`, 'success');
      if (res.milestonesReached?.length) {
        showToast(`${t('youJustHit')} ${res.milestonesReached.join(' / ')} ${t(unit)}`, 'success');
      }
      setQuantity('');
      onLogged && onLogged();
      onClose();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={t('logYourActivity')} variant="sheet">
      <form className="aml" onSubmit={submit}>
        <div className="aml__row">
          <label className="field">
            <span className="field__label">{t('activity')}</span>
            <select className="field__input" value={activityType} onChange={(e) => setActivityType(e.target.value)}>
              {ACTIVITY_KEYS.map((k) => (
                <option key={k} value={k}>
                  {t(activityLabelKey(k))}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field__label">{unit === 'km' ? `${t('distance')} (${t('km')})` : t('sessions')}</span>
            <input
              className="field__input"
              type="number"
              step={unit === 'km' ? '0.1' : '1'}
              min="0.1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder={unit === 'km' ? t('distancePlaceholder') : t('customGoalPlaceholder')}
              autoFocus
            />
          </label>
        </div>
        <Button type="submit" variant="primary" size="lg" full disabled={busy}>
          {busy ? t('loading') : t('logActivityBtn')}
        </Button>
      </form>
    </Modal>
  );
}
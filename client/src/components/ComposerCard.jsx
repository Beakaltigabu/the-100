import { useState } from 'react';
import Button from './Button';
import { useLanguage } from '../context/LanguageContext';
import { ACTIVITY_KEYS, activityLabelKey } from '../lib/activity';

// Compact action card: "HOW'S YOUR 100 GOING?" → expand into a check-in composer.
export default function ComposerCard({ onSubmit, busy, open, onOpenChange }) {
  const { t } = useLanguage();
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = open !== undefined ? open : internalOpen;
  const setOpen = onOpenChange ? onOpenChange : setInternalOpen;
  const [body, setBody] = useState('');
  const [distance, setDistance] = useState('');
  const [activity, setActivity] = useState('');
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const num = distance ? Number(distance) : null;
    if (!body.trim() && !num) {
      setError(t('checkInNeedsContent'));
      return;
    }
    const ok = await onSubmit({ body: body.trim(), distance: num, activityType: activity || null });
    if (ok) {
      setBody('');
      setDistance('');
      setActivity('');
      setOpen(false);
    }
  };

  return (
    <div className="composer-card">
      {!isOpen ? null : (
        <form className="composer-card__form" onSubmit={submit}>
          <div className="composer-card__presets">
            {['1', '2', '5'].map((p) => (
              <button key={p} type="button" className="composer-card__chip" onClick={() => setDistance(p)}>
                +{p} {t('unitKm')}
              </button>
            ))}
          </div>
          <label className="field">
            <textarea
              className="field__input"
              rows={3}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={t('composePlaceholder')}
              maxLength={500}
            />
          </label>
          <div className="composer-card__fields">
            <label className="field">
              <span className="field__label">{t('distance')}</span>
              <input
                className="field__input"
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={distance}
                onChange={(e) => setDistance(e.target.value)}
                placeholder="0"
              />
            </label>
            <label className="field">
              <span className="field__label">{t('activity')}</span>
              <select className="field__input" value={activity} onChange={(e) => setActivity(e.target.value)}>
                <option value="">{t('selectActivity')}</option>
                {ACTIVITY_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {t(activityLabelKey(k))}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {error ? <p className="field__hint">{error}</p> : null}
          <div className="composer-card__actions">
            <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" variant="primary" size="sm" disabled={busy}>
              {busy ? t('loading') : t('checkIn')}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
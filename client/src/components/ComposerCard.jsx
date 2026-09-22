import { useState } from 'react';
import Button from './Button';
import { useLanguage } from '../context/LanguageContext';
import { ACTIVITY_KEYS, activityLabelKey } from '../lib/activity';

// Compact action card: "HOW'S YOUR 100 GOING?" → expand into a check-in composer.
export default function ComposerCard({ onSubmit, busy }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
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
      {!open ? (
        <button type="button" className="composer-card__trigger" onClick={() => setOpen(true)}>
          <span className="composer-card__title">{t('howsYour100')}</span>
          <span className="composer-card__hint">{t('shareACheckIn')}</span>
        </button>
      ) : (
        <form className="composer-card__form" onSubmit={submit}>
          <label className="field">
            <span className="field__label">{t('shareACheckIn')}</span>
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
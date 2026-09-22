import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import Button from './Button';
import ActivityRow from './ActivityRow';
import { ACTIVITY_KEYS, activityLabelKey, unitKey } from '../lib/activity';
import { todayISO } from '../lib/time';
import './LogSection.css';

function todayInput() {
  return todayISO();
}

function dayLabel(dateISO) {
  const today = todayInput();
  if (dateISO === today) return 'TODAY';
  const y = new Date(today + 'T00:00:00');
  y.setDate(y.getDate() - 1);
  if (dateISO === y.toISOString().slice(0, 10)) return 'YESTERDAY';
  const d = new Date(dateISO + 'T00:00:00');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function LogSection({ onLogged }) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [activities, setActivities] = useState([]);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    date: todayInput(),
    quantity: '',
    activity_type: user?.activityType || 'running',
    notes: ''
  });

  const unit = unitKey(form.activity_type);

  const load = useCallback(() => {
    api
      .get('/api/activities')
      .then((d) => setActivities(d.activities.slice(0, 5)))
      .catch(() => {});
  }, []);

  useEffect(load, [load]);

  const submit = async (e) => {
    e.preventDefault();
    const quantity = parseFloat(form.quantity);
    if (!quantity || quantity <= 0) {
      showToast(t('invalidQuantity'), 'error');
      return;
    }
    setBusy(true);
    try {
      const res = await api.post('/api/activities/manual', {
        date: form.date,
        quantity,
        activity_type: form.activity_type,
        notes: form.notes || undefined
      });
      showToast(`${quantity} ${t(unit)} ${t('logged')}`, 'success');
      if (res.milestonesReached?.length) {
        showToast(`${t('youJustHit')} ${res.milestonesReached.join(' / ')} ${t(unit)}`, 'success');
      }
      setForm((f) => ({ ...f, quantity: '', notes: '' }));
      load();
      onLogged?.();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (activity) => {
    if (!window.confirm(t('deleteConfirm'))) return;
    try {
      await api.del(`/api/activities/${activity.id}`);
      load();
      onLogged?.();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const grouped = activities.reduce((acc, a) => {
    (acc[a.date] = acc[a.date] || []).push(a);
    return acc;
  }, {});

  return (
    <div className="log-section">
      <h2 className="log-section__title">{t('logYourActivity')}</h2>

      <form className="log-form" onSubmit={submit}>
        <label className="field">
          <span className="field__label">
            {unit === 'km' ? `${t('distance')} (${t('km')})` : t('sessions')}
          </span>
          <input
            className="field__input"
            type="number"
            step={unit === 'km' ? '0.1' : '1'}
            min="0.1"
            max="500"
            value={form.quantity}
            onChange={(e) => setForm({ ...form, quantity: e.target.value })}
            placeholder={unit === 'km' ? t('distancePlaceholder') : t('customGoalPlaceholder')}
            required
          />
        </label>

        <div className="field">
          <span className="field__label">{t('activity')}</span>
          <div className="log-section__types">
            {ACTIVITY_KEYS.map((k) => (
              <button
                key={k}
                type="button"
                className={`chip ${form.activity_type === k ? 'is-selected' : ''}`.trim()}
                onClick={() => setForm({ ...form, activity_type: k })}
              >
                {t(activityLabelKey(k))}
              </button>
            ))}
          </div>
        </div>

        <div className="log-section__row">
          <label className="field">
            <span className="field__label">{t('date')}</span>
            <input
              className="field__input"
              type="date"
              value={form.date}
              max={todayInput()}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              required
            />
          </label>
          <label className="field">
            <span className="field__label">{t('notes')}</span>
            <input
              className="field__input"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder={t('notesPlaceholder')}
            />
          </label>
        </div>

        <Button type="submit" variant="primary" size="lg" full disabled={busy}>
          {busy ? t('loading') : t('logActivityBtn')}
        </Button>
      </form>

      {activities.length > 0 ? (
        <div className="log-section__recent">
          <h3 className="log-section__sub">{t('recentActivities')}</h3>
          {Object.entries(grouped).map(([date, items]) => (
            <div key={date} className="log-section__day">
              <div className="log-section__day-label">{dayLabel(date)}</div>
              <div className="stack--sm">
                {items.map((a) => (
                  <ActivityRow key={a.id} activity={a} unit={unit} onDelete={remove} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
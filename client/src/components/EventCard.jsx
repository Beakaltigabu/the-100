import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import { useLanguage } from '../context/LanguageContext';
import { openSafeUrl } from '../lib/url';
import './EventCard.css';

export default function EventCard() {
  const { t } = useLanguage();
  const [events, setEvents] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api
      .get('/api/community/events/upcoming')
      .then((d) => setEvents(d.events || []))
      .catch(() => {});
  }, []);

  useEffect(load, [load]);

  if (!events.length) return null;

  const toggle = async (e) => {
    setBusy(true);
    try {
      await api.post(`/api/community/events/${e.id}/rsvp`);
      load();
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="ec">
      <p className="ec__label">{t('eventsTitle')}</p>
      {events.map((e) => (
        <div className="ec__card" key={e.id}>
          <p className="ec__title">{e.title}</p>
          <p className="ec__time">{new Date(e.startsAt).toLocaleString()}</p>
          {e.description ? <p className="ec__desc">{e.description}</p> : null}
          <div className="ec__foot">
            <span className="ec__who">
              {e.rsvps} {t('eventsGoing')}
            </span>
            <div className="ec__actions">
              {e.link ? (
                <button className="btn btn--secondary btn--sm" onClick={() => openSafeUrl(e.link)}>
                  {t('eventsOpen')}
                </button>
              ) : null}
              <button className={`btn btn--sm ${e.joined ? 'btn--secondary' : 'btn--primary'}`} onClick={() => toggle(e)} disabled={busy}>
                {e.joined ? t('eventsGoing') : t('eventsJoin')}
              </button>
            </div>
          </div>
        </div>
      ))}
    </section>
  );
}
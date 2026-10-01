import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { timeAgo } from '../lib/time';
import './CommentSection.css';

export default function CommentSection({ itemId, onCountChange }) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api
      .get(`/api/community/items/${itemId}/comments`)
      .then((d) => {
        setComments(d.comments || []);
        onCountChange && onCountChange((d.comments || []).length);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [itemId, onCountChange]);

  useEffect(load, [load]);

  const add = async () => {
    if (!body.trim()) return;
    setBusy(true);
    try {
      await api.post(`/api/community/items/${itemId}/comments`, { body: body.trim() });
      setBody('');
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (comment) => {
    if (!window.confirm(t('deleteCommentConfirm'))) return;
    try {
      await api.del(`/api/community/items/${itemId}/comments/${comment.id}`);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="cs">
      {error ? <p className="cs__error">{error}</p> : null}
      <div className="cs__list">
        {loading ? (
          <p className="cs__hint">{t('loading')}</p>
        ) : comments.length === 0 ? (
          <p className="cs__hint">{t('noComments')}</p>
        ) : (
          comments.map((c) => (
            <div className="cs__item" key={c.id}>
              <span className="cs__who">{c.name}</span>
              <p className="cs__body">{c.body}</p>
              <span className="cs__meta">
                {timeAgo(c.ts, t)}
                {user && c.user_id === user.id ? (
                  <button className="cs__del" type="button" onClick={() => remove(c)}>
                    {t('delete')}
                  </button>
                ) : null}
              </span>
            </div>
          ))
        )}
      </div>
      <form
        className="cs__form"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input
          className="cs__input"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t('commentPlaceholder')}
          maxLength={500}
        />
        <button className="btn btn--primary btn--sm" type="submit" disabled={busy || !body.trim()}>
          {t('commentSend')}
        </button>
      </form>
    </div>
  );
}
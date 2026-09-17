import { useEffect } from 'react';
import './Modal.css';
import { useLanguage } from '../context/LanguageContext';

export default function Modal({ open, onClose, title, children, footer }) {
  const { t } = useLanguage();

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {title ? (
          <div className="modal__header">
            <h3>{title}</h3>
            <button className="modal__close" onClick={onClose}>
              ×
            </button>
          </div>
        ) : null}
        <div className="modal__body">{children}</div>
        <div className="modal__footer">
          {footer !== undefined ? (
            footer
          ) : (
            <button className="modal__cancel" onClick={onClose}>
              {t('cancel')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
import { useEffect, useRef } from 'react';
import './Modal.css';
import { useLanguage } from '../context/LanguageContext';

export default function Modal({ open, onClose, title, children, footer, variant }) {
  const { t } = useLanguage();
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    // Move focus into the dialog on open; restore it to the opener on close.
    const previous = document.activeElement;
    dialogRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      if (previous && previous.focus) previous.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title || undefined}
        tabIndex={-1}
        className={`modal ${variant === 'sheet' ? 'modal--sheet' : ''}`.trim()}
        onClick={(e) => e.stopPropagation()}
      >
        {title ? (
          <div className="modal__header">
            <h3>{title}</h3>
            <button className="modal__close" onClick={onClose} aria-label={t('cancel')}>
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

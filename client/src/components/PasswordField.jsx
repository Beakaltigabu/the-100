import { useState } from 'react';
import './PasswordField.css';
import { useLanguage } from '../context/LanguageContext';
import { EyeIcon, EyeOffIcon } from './icons';
import { strengthLevel } from '../lib/password';

export default function PasswordField({ label, value, onChange, placeholder, showStrength, strength, ...props }) {
  const { t } = useLanguage();
  const [show, setShow] = useState(false);
  const score = typeof strength === 'number' ? strength : 0;
  const level = strengthLevel(score);
  const levelLabel = level === 'strong' ? t('passwordStrong') : level === 'ok' ? t('passwordOk') : t('passwordWeak');

  return (
    <label className="field">
      <span className="field__label">{label}</span>
      <div className="password-field">
        <input
          className="field__input password-field__input"
          type={show ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          {...props}
        />
        <button
          type="button"
          className="password-field__toggle"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? t('hidePassword') : t('showPassword')}
          tabIndex={-1}
        >
          {show ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
        </button>
      </div>
      {showStrength && value ? (
        <div className="password-strength" data-level={level}>
          <span className="password-strength__label">{levelLabel}</span>
          <div className="password-strength__bars" aria-hidden="true">
            {[1, 2, 3, 4].map((i) => (
              <i key={i} className={i <= score ? 'is-on' : ''} />
            ))}
          </div>
        </div>
      ) : null}
    </label>
  );
}
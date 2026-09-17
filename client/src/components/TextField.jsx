import './TextField.css';
import { MailIcon, LockIcon, UserIcon } from './icons';

const ICONS = { mail: MailIcon, lock: LockIcon, user: UserIcon };

export default function TextField({
  label,
  type = 'text',
  icon,
  invalid,
  hint,
  value,
  onChange,
  placeholder,
  autoComplete,
  ...props
}) {
  const Icon = icon ? ICONS[icon] : null;
  return (
    <label className={`field ${invalid ? 'is-invalid' : ''}`.trim()}>
      <span className="field__label">{label}</span>
      <span className={`text-field ${icon ? 'text-field--icon' : ''}`.trim()}>
        {Icon ? (
          <span className="text-field__icon">
            <Icon size={18} />
          </span>
        ) : null}
        <input
          className="field__input text-field__input"
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoComplete={autoComplete}
          {...props}
        />
      </span>
      {hint ? <span className="field__hint">{hint}</span> : null}
    </label>
  );
}
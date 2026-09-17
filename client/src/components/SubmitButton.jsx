import Button from './Button';
import { SpinnerIcon, CheckIcon } from './icons';

export default function SubmitButton({ busy, done, busyLabel, children, className = '', ...props }) {
  const classes = ['btn--submit', busy ? 'is-busy' : '', done ? 'is-done' : '', className].filter(Boolean).join(' ');
  const disabled = busy || done || props.disabled;
  return (
    <Button {...props} disabled={disabled} className={classes}>
      {busy ? (
        <>
          <SpinnerIcon size={18} />
          <span>{busyLabel || children}</span>
        </>
      ) : done ? (
        <CheckIcon size={20} />
      ) : (
        children
      )}
    </Button>
  );
}
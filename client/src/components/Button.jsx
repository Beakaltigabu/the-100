import './Button.css';

export default function Button({ variant = 'primary', size = 'md', full, className = '', children, ...props }) {
  const classes = ['btn', `btn--${variant}`, `btn--${size}`, full ? 'btn--full' : '', className]
    .filter(Boolean)
    .join(' ');
  return (
    <button className={classes} {...props}>
      {children}
    </button>
  );
}
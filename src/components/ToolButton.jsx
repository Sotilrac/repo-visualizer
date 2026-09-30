/**
 * Every button on the control bar.
 *
 * They were the same handful of class names written out a dozen times, with
 * a bespoke variant for the ones that had drifted: the export button came
 * with its own gradient, the jump-to-end button with its own size. One
 * component and one class is what keeps the row looking like a row.
 */
export default function ToolButton({
  onClick = undefined,
  title = undefined,
  label = title,
  active = false,
  danger = false,
  disabled = false,
  pressed = undefined,
  busy = undefined,
  children,
  ...rest
}) {
  const classes = ['btn', active ? 'is-active' : '', danger ? 'btn-danger' : '']
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      className={classes}
      onClick={onClick}
      title={title}
      aria-label={label}
      aria-pressed={pressed}
      aria-busy={busy}
      disabled={disabled}
      {...rest}
    >
      {children}
    </button>
  );
}

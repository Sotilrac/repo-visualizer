const STYLES = [
  { id: 'galaxy', label: 'Galaxy' },
  { id: 'organic', label: 'Organic' },
  { id: 'neural', label: 'Neural' },
  { id: 'minimal', label: 'Minimal' },
];

export default function StylePicker({ style, onChange }) {
  return (
    <div className="style-picker" role="tablist" aria-label="Visual style">
      {STYLES.map((s) => (
        <button
          key={s.id}
          type="button"
          className="style-btn"
          onClick={() => onChange(s.id)}
          aria-selected={style === s.id}
          role="tab"
        >
          <span className={`style-swatch ${s.id}`} />
          {s.label}
        </button>
      ))}
    </div>
  );
}

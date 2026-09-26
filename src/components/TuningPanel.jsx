import { useEffect, useRef } from 'react';
import { DEFAULT_TUNING, knobGroups } from '../engine/tuning.js';

/**
 * The layout, adjustable while it runs.
 *
 * Every value here was a constant picked against one dataset. Sixty repos
 * pack differently from six, so the numbers belong to whoever is watching
 * the graph rather than to the code.
 */
export default function TuningPanel({ tuning, onChange, onReset, onClose }) {
  const rootRef = useRef(null);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const changed = Object.entries(DEFAULT_TUNING).filter(
    ([key, value]) => tuning[key] !== value,
  ).length;

  return (
    <aside className="tuning-panel" ref={rootRef} aria-label="Layout settings">
      <header className="tuning-panel-header">
        <h3>Layout</h3>
        <div className="tuning-panel-header-actions">
          <button type="button" onClick={onReset} disabled={changed === 0} title="Back to defaults">
            reset
          </button>
          <button
            type="button"
            className="tuning-panel-close"
            onClick={onClose}
            aria-label="Close layout settings"
          >
            ×
          </button>
        </div>
      </header>

      <div className="tuning-panel-scroll">
        {knobGroups().map(([group, knobs]) => (
          <section key={group} className="tuning-group">
            <h4>{group}</h4>
            {knobs.map((knob) => (
              <label key={knob.key} className="tuning-knob" title={knob.hint}>
                <span className="tuning-knob-label">
                  {knob.label}
                  <output>{format(tuning[knob.key])}</output>
                </span>
                <input
                  type="range"
                  aria-label={knob.label}
                  min={knob.min}
                  max={knob.max}
                  step={knob.step}
                  value={tuning[knob.key]}
                  onChange={(e) => onChange(knob.key, Number(e.target.value))}
                />
              </label>
            ))}
          </section>
        ))}
      </div>
    </aside>
  );
}

/** Two decimals where they say something, none where they do not. */
function format(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0$/, '');
}

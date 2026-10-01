import { useState } from 'react';

const DEFAULT_OPTS = { format: 'webm', fps: 30, aspect: 16 / 9 };

const FORMATS = [
  { value: 'webm', label: 'WebM' },
  { value: 'gif', label: 'GIF' },
  { value: 'png', label: 'PNG' },
];

const FPS_OPTIONS = [
  { value: 24, label: '24' },
  { value: 30, label: '30' },
  { value: 60, label: '60' },
];

// The stage is framed to this while recording, and drawn at the screen's
// own resolution, so what the file holds is what the frame shows.
const ASPECT_OPTIONS = [
  { value: 16 / 9, label: '16:9' },
  { value: 4 / 3, label: '4:3' },
  { value: 1, label: '1:1' },
  { value: 9 / 16, label: '9:16' },
];

function ToggleRow({ label, options, value, onChange }) {
  return (
    <div className="export-toggle-row">
      <span className="export-toggle-label">{label}</span>
      {/* biome-ignore lint/a11y/useSemanticElements: a labelled group of toggle buttons, not a form field group */}
      <div className="export-toggle-group" role="group" aria-label={label}>
        {options.map((opt) => (
          <button
            key={String(opt.value)}
            type="button"
            className={`export-toggle-btn${value === opt.value ? ' active' : ''}`}
            aria-pressed={value === opt.value}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function ExportPanel({ open, onClose, onStartRecord }) {
  const [opts, setOpts] = useState(DEFAULT_OPTS);

  if (!open) return null;

  const isVideo = opts.format !== 'png';

  return (
    <div className="header-export-panel">
      <ToggleRow
        label="Format"
        options={FORMATS}
        value={opts.format}
        onChange={(format) => setOpts((o) => ({ ...o, format }))}
      />
      {isVideo && (
        <>
          <ToggleRow
            label="FPS"
            options={FPS_OPTIONS}
            value={opts.fps}
            onChange={(fps) => setOpts((o) => ({ ...o, fps }))}
          />
          <ToggleRow
            label="Frame"
            options={ASPECT_OPTIONS}
            value={opts.aspect}
            onChange={(aspect) => setOpts((o) => ({ ...o, aspect }))}
          />
        </>
      )}
      <div className="export-panel-actions">
        <button type="button" className="btn" onClick={onClose}>
          Close
        </button>
        <button type="button" className="btn btn-primary" onClick={() => onStartRecord(opts)}>
          {isVideo ? 'Record' : 'Save frame'}
        </button>
      </div>
    </div>
  );
}

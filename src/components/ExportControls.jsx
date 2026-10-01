import ToolButton from './ToolButton.jsx';

function ExportIcon() {
  return (
    <svg
      aria-hidden="true"
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8 11V2" />
      <path d="M4 6l4-4 4 4" />
      <rect x="2" y="11" width="12" height="3" rx="1" />
    </svg>
  );
}

/** How fast the graph is being drawn, off at the end of the row. */
export function FrameRate({ fps = null }) {
  if (fps === null) return null;
  return (
    <div
      className={`header-fps${fps < 24 ? ' is-slow' : fps < 45 ? ' is-fair' : ''}`}
      title="Frames drawn per second"
    >
      {fps} fps
    </div>
  );
}

/**
 * The export button, beside the transport controls it records.
 */
export default function ExportControls({
  exportOpen = false,
  onToggleExport,
  recording = false,
  recordingProgress = 0,
  encoding = false,
  encodeProgress = 0,
  encodeFormat = 'webm',
  recordingPlaying = false,
  onStopRecord,
  onPauseRecord,
}) {
  const recPct = Math.round(Math.min(1, Math.max(0, recordingProgress)) * 100);
  const encPct = Math.round(Math.min(1, Math.max(0, encodeProgress)) * 100);
  const encodeLabel = encodeFormat === 'gif' ? 'GIF' : 'video';

  return (
    <div className="export-controls">
      <div className="header-export-wrap">
        <div className="header-export-toolbar">
          {encoding ? (
            <div className="header-export-encoding" aria-live="polite">
              <span className="header-export-encoding-label">
                Creating {encodeLabel}… {encPct}%
              </span>
              <div
                className="header-export-encoding-bar"
                role="progressbar"
                aria-valuenow={encPct}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div className="header-export-encoding-bar-fill" style={{ width: `${encPct}%` }} />
              </div>
            </div>
          ) : recording ? (
            <>
              <ToolButton disabled label={`Recording ${recPct}%`} aria-live="polite">
                <span className="rec-pulse" aria-hidden />
                Recording {recPct}%
              </ToolButton>
              <ToolButton
                onClick={onPauseRecord}
                title={recordingPlaying ? 'Pause timeline' : 'Resume timeline'}
              >
                {recordingPlaying ? 'Pause' : 'Resume'}
              </ToolButton>
              <ToolButton onClick={onStopRecord} danger title="Stop and download">
                Stop
              </ToolButton>
            </>
          ) : (
            onToggleExport && (
              <ToolButton
                onClick={onToggleExport}
                active={exportOpen}
                pressed={exportOpen}
                title="Export timeline as video or GIF"
                label="Export timeline"
              >
                <ExportIcon />
                Export
              </ToolButton>
            )
          )}
        </div>
      </div>
    </div>
  );
}

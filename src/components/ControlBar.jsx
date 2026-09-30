import ExportControls, { FrameRate } from './ExportControls.jsx';
import StylePicker from './StylePicker.jsx';
import Timeline from './Timeline.jsx';

/** One commit forward. */
const StepIcon = () => (
  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <path d="M5 3 L12 8 L5 13 Z" />
  </svg>
);

/** Straight to the end of the history. */
const EndIcon = () => (
  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <path d="M3 3 L10 8 L3 13 Z" />
    <rect x="11" y="3" width="2" height="10" rx="0.6" />
  </svg>
);

const PlayIcon = () => (
  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <path d="M4 3 L13 8 L4 13 Z" />
  </svg>
);

const PauseIcon = () => (
  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <rect x="4" y="3" width="3" height="10" />
    <rect x="9" y="3" width="3" height="10" />
  </svg>
);

const RestartIcon = () => (
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
    <path d="M2 8a6 6 0 1 0 1.7-4.2" />
    <path d="M2 2v3h3" />
  </svg>
);

export default function ControlBar({
  commits,
  index,
  seekingTo = null,
  msPerCommit = 1200,
  playing,
  speed,
  speeds,
  onTogglePlay,
  onGoToFinal,
  buildingFinal = false,
  atFinal = false,
  onSeek,
  onSetSpeed,
  onRestart,
  style,
  onStyleChange,
  autoFit = true,
  followAction = false,
  onFollowActionChange,
  showActors = true,
  onShowActorsChange,
  onAutoFitChange,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  tuningOpen = false,
  onToggleTuning,
  showPlayHint = false,
  exportControls = null,
}) {
  return (
    <div className="control-bar">
      <Timeline
        commits={commits}
        index={index}
        seekingTo={seekingTo}
        msPerCommit={msPerCommit}
        onSeek={onSeek}
      />
      <div className="control-cluster">
        <div className="control-row control-row--playback">
          <button className="btn" onClick={onRestart} title="Restart" type="button">
            <span className="icon">
              <RestartIcon />
            </span>
          </button>
          <button
            className={`btn btn-play${showPlayHint ? ' is-cta' : ''}`}
            onClick={onTogglePlay}
            title={playing ? 'Pause' : 'Play'}
            type="button"
            disabled={buildingFinal}
          >
            {playing ? <PauseIcon /> : <PlayIcon />}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => onSeek(index + 1)}
            disabled={buildingFinal || atFinal || !commits.length}
            title="Next commit"
            aria-label="Next commit"
          >
            <StepIcon />
          </button>
          <button
            type="button"
            className={`btn btn-final-state${atFinal ? ' is-active' : ''}`}
            onClick={onGoToFinal}
            disabled={buildingFinal || atFinal || !commits.length}
            title={atFinal ? 'At final state' : 'Load final state (all commits)'}
            aria-label="Jump to the final state"
            aria-busy={buildingFinal}
          >
            <EndIcon />
          </button>
        </div>
        <div className="control-row control-row--tools">
          <div className="speed-control">
            <span>SPEED</span>
            <select value={speed} onChange={(e) => onSetSpeed(e.target.value)}>
              {speeds.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="control-sep" aria-hidden="true" />
          <div className="zoom-control" title="Canvas zoom">
            <button type="button" className="btn btn-sm" onClick={onZoomOut}>
              −
            </button>
            <button type="button" className="btn btn-sm" onClick={onZoomReset} title="Reset view">
              ◎
            </button>
            <button type="button" className="btn btn-sm" onClick={onZoomIn}>
              +
            </button>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={autoFit}
            className={`toggle-switch${autoFit ? ' is-on' : ''}`}
            title="Auto zoom to fit graph while playing"
            onClick={() => onAutoFitChange(!autoFit)}
          >
            <span className="toggle-switch-track" aria-hidden="true">
              <span className="toggle-switch-thumb" />
            </span>
            <span className="toggle-switch-label">Auto fit</span>
          </button>
          {autoFit && (
            <button
              type="button"
              role="switch"
              aria-checked={followAction}
              className={`toggle-switch${followAction ? ' is-on' : ''}`}
              title="Frame what is being worked on right now instead of the whole graph"
              onClick={() => onFollowActionChange(!followAction)}
            >
              <span className="toggle-switch-track" aria-hidden="true">
                <span className="toggle-switch-thumb" />
              </span>
              <span className="toggle-switch-label">Follow</span>
            </button>
          )}
          <button
            type="button"
            role="switch"
            aria-checked={showActors}
            className={`toggle-switch${showActors ? ' is-on' : ''}`}
            title="Show who made each commit, firing at the files they touched"
            onClick={() => onShowActorsChange(!showActors)}
          >
            <span className="toggle-switch-track" aria-hidden="true">
              <span className="toggle-switch-thumb" />
            </span>
            <span className="toggle-switch-label">People</span>
          </button>
          <div className="control-sep" aria-hidden="true" />
          <button
            type="button"
            className={`btn btn-sm btn-tuning${tuningOpen ? ' is-active' : ''}`}
            title="Adjust the layout: pull, spacing, sizes"
            aria-pressed={tuningOpen}
            onClick={onToggleTuning}
          >
            layout
          </button>
          <StylePicker style={style} onChange={onStyleChange} />
          {exportControls && <ExportControls {...exportControls} />}
          <div className="spacer" />
          <FrameRate fps={exportControls?.fps ?? null} />
        </div>
      </div>
    </div>
  );
}

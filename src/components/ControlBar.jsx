import ExportControls, { FrameRate } from './ExportControls.jsx';
import StylePicker from './StylePicker.jsx';
import Timeline from './Timeline.jsx';
import ToolButton from './ToolButton.jsx';

/** One commit back. */
const BackIcon = () => (
  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <path d="M8 3 L2 8 L8 13 Z" />
    <path d="M14 3 L8 8 L14 13 Z" />
  </svg>
);

/** One commit forward. */
const StepIcon = () => (
  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <path d="M2 3 L8 8 L2 13 Z" />
    <path d="M8 3 L14 8 L8 13 Z" />
  </svg>
);

/*
 * The zoom controls, as icons rather than as characters.
 *
 * A plus typed into a button is set at the button's own font size, which
 * beside a 16px icon reads as a different size of control.
 */
const ZoomOutIcon = () => (
  <svg
    aria-hidden="true"
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
  >
    <path d="M3.5 8h9" />
  </svg>
);

const ZoomInIcon = () => (
  <svg
    aria-hidden="true"
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
  >
    <path d="M3.5 8h9" />
    <path d="M8 3.5v9" />
  </svg>
);

const ZoomResetIcon = () => (
  <svg
    aria-hidden="true"
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
  >
    <circle cx="8" cy="8" r="5.2" />
    <circle cx="8" cy="8" r="1.4" fill="currentColor" stroke="none" />
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

/** Back to the first commit. */
const RestartIcon = () => (
  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <rect x="3" y="3" width="2" height="10" rx="0.6" />
    <path d="M13 3 L6 8 L13 13 Z" />
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
          <ToolButton onClick={onRestart} title="Back to the first commit">
            <RestartIcon />
          </ToolButton>
          <ToolButton
            onClick={() => onSeek(index - 1)}
            disabled={buildingFinal || index < 0 || !commits.length}
            title="Previous commit"
          >
            <BackIcon />
          </ToolButton>
          <button
            className={`btn btn-play${showPlayHint ? ' is-cta' : ''}`}
            onClick={onTogglePlay}
            title={playing ? 'Pause' : 'Play'}
            type="button"
            disabled={buildingFinal}
          >
            {playing ? <PauseIcon /> : <PlayIcon />}
          </button>
          <ToolButton
            onClick={() => onSeek(index + 1)}
            disabled={buildingFinal || atFinal || !commits.length}
            title="Next commit"
          >
            <StepIcon />
          </ToolButton>
          <ToolButton
            onClick={onGoToFinal}
            active={atFinal}
            busy={buildingFinal}
            disabled={buildingFinal || atFinal || !commits.length}
            title={atFinal ? 'At final state' : 'Load final state (all commits)'}
            label="Jump to the final state"
          >
            <EndIcon />
          </ToolButton>
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
            <ToolButton onClick={onZoomOut} title="Zoom out">
              <ZoomOutIcon />
            </ToolButton>
            <ToolButton onClick={onZoomReset} title="Reset view">
              <ZoomResetIcon />
            </ToolButton>
            <ToolButton onClick={onZoomIn} title="Zoom in">
              <ZoomInIcon />
            </ToolButton>
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
          <button
            type="button"
            role="switch"
            aria-checked={followAction}
            className={`toggle-switch${followAction ? ' is-on' : ''}`}
            title={
              autoFit
                ? 'Frame what is being worked on right now instead of the whole graph'
                : 'Turn auto fit on to follow the work'
            }
            disabled={!autoFit}
            onClick={() => onFollowActionChange(!followAction)}
          >
            <span className="toggle-switch-track" aria-hidden="true">
              <span className="toggle-switch-thumb" />
            </span>
            <span className="toggle-switch-label">Follow</span>
          </button>
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
          <ToolButton
            onClick={onToggleTuning}
            active={tuningOpen}
            pressed={tuningOpen}
            title="Adjust the layout: pull, spacing, sizes"
          >
            Layout
          </ToolButton>
          <StylePicker style={style} onChange={onStyleChange} />
          {exportControls && <ExportControls {...exportControls} />}
          <div className="spacer" />
          <FrameRate fps={exportControls?.fps ?? null} />
        </div>
      </div>
    </div>
  );
}

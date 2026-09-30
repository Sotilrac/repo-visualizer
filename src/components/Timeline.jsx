import { useEffect, useMemo, useRef, useState } from 'react';
import { playbackTime } from '../engine/playbackClock.js';
import { createTimeScale } from '../engine/timelineScale.js';
import { timelineTicks } from '../engine/timelineTicks.js';

/**
 * Interactive scrubber, marked out in months, half years and years.
 *
 * The handle tracks the pointer immediately for instant visual feedback.
 * The actual onSeek is debounced during drag so large async rebuilds don't
 * pile up on every mouse-move frame; it always fires immediately on release.
 *
 * Three positions feed the handle, in order of precedence: where the pointer
 * is while dragging, where the timeline is still rebuilding towards, and
 * where it actually is. Without the middle one the handle drops back to the
 * commit it came from the instant the pointer is released, sits there for as
 * long as the rebuild takes and then jumps, which reads as a click that
 * missed and landed somewhere else.
 */
export default function Timeline({ commits, index, seekingTo = null, msPerCommit = 1200, onSeek }) {
  const trackRef = useRef(null);
  // Visual position during drag (null = use committed index).
  const [pendingIdx, setPendingIdx] = useState(null);
  const pendingIdxRef = useRef(null);
  const draggingRef = useRef(false);
  const debounceRef = useRef(null);

  const ticks = useMemo(() => timelineTicks(commits), [commits]);
  const scale = useMemo(() => createTimeScale(commits), [commits]);
  const scaleRef = useRef(scale);
  scaleRef.current = scale;

  const idxFromEvent = (ev) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const x = ev.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, x / rect.width));
    return scaleRef.current.indexAt(pct * 100);
  };

  const setPending = (idx) => {
    pendingIdxRef.current = idx;
    setPendingIdx(idx);
  };

  const handleKeyDown = (ev) => {
    const last = commits.length - 1;
    const current = pendingIdxRef.current ?? index;
    const page = Math.max(1, Math.round(commits.length / 20));
    const targets = {
      ArrowLeft: current - 1,
      ArrowRight: current + 1,
      ArrowDown: current - 1,
      ArrowUp: current + 1,
      PageDown: current - page,
      PageUp: current + page,
      Home: 0,
      End: last,
    };
    const next = targets[ev.key];
    if (next === undefined) return;
    ev.preventDefault();
    ev.stopPropagation();
    const clamped = Math.max(0, Math.min(last, next));
    setPending(clamped);
    onSeek(clamped);
  };

  const handleMouseDown = (ev) => {
    draggingRef.current = true;
    const idx = idxFromEvent(ev);
    if (idx === null) return;
    clearTimeout(debounceRef.current);
    setPending(idx);
    onSeek(idx); // immediate on initial click
  };

  const handleMouseMove = (ev) => {
    if (!draggingRef.current || ev.buttons !== 1) return;
    const idx = idxFromEvent(ev);
    if (idx === null) return;
    setPending(idx); // move handle instantly
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onSeek(idx), 180);
  };

  // Catch mouseup anywhere in the window so releasing outside the track works.
  useEffect(() => {
    const onMouseUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      clearTimeout(debounceRef.current);
      const finalIdx = pendingIdxRef.current;
      pendingIdxRef.current = null;
      setPendingIdx(null);
      if (finalIdx !== null) onSeek(finalIdx);
    };
    window.addEventListener('mouseup', onMouseUp);
    return () => window.removeEventListener('mouseup', onMouseUp);
  }, [onSeek]);

  const handleClick = (ev) => {
    // handled by mouseDown, so suppress it here to avoid a double fire
    ev.preventDefault();
  };

  const progress = pendingIdx ?? seekingTo ?? (index < 0 ? -1 : index);
  const progressPct = progress < 0 ? 0 : scale.pctOf(progress);

  const firstDate = commits[0]?.date && new Date(commits[0].date);
  const fmt = (d) => (d ? d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }) : '');
  const clock = playbackTime(index, commits.length, msPerCommit);

  return (
    <div className="timeline">
      <div
        className="timeline-track"
        ref={trackRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="slider"
        aria-label="Commit timeline"
        aria-valuemin={0}
        aria-valuemax={commits.length - 1}
        aria-valuenow={Math.max(0, progress)}
      >
        <div className="timeline-progress" style={{ width: `${progressPct}%` }} />
        <div className="timeline-handle" style={{ left: `${progressPct}%` }} />
        <div className="timeline-ticks">
          {ticks.map((t) => (
            <div
              key={`${t.kind}-${t.pct}`}
              className={`timeline-tick timeline-tick--${t.kind}`}
              style={{ left: `${t.pct}%` }}
            >
              {t.label && <span className="timeline-year">{t.label}</span>}
            </div>
          ))}
        </div>
        <div className="timeline-start">{fmt(firstDate)}</div>
        <div className="timeline-clock" aria-live="off">
          {clock.at}
          <span className="timeline-clock-dim"> / {clock.of}</span>
        </div>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CommitCard from './components/CommitCard.jsx';
import ControlBar from './components/ControlBar.jsx';
import Header from './components/Header.jsx';
import Legend from './components/Legend.jsx';
import NodeInspector from './components/NodeInspector.jsx';
import TuningPanel from './components/TuningPanel.jsx';
import { isClusterExcluded } from './engine/excludes.js';
import { clusterPalette, collectAllClusters } from './engine/graphState.js';
import { startRecording } from './engine/recorder.js';
import { recordingSpan } from './engine/recordingOverlay.js';
import { DEFAULT_TUNING, loadTuning, saveTuning } from './engine/tuning.js';
import { useDataset } from './engine/useDataset.js';
import { useFrameRate } from './engine/useFrameRate.js';
import { isCompactLayout, useLayoutMode } from './engine/useLayoutMode.js';
import { resolveAuthor as resolveFromDirectory, usePeople } from './engine/usePeople.js';
import { useTimeline } from './engine/useTimeline.js';
import { recordingName, recordingSubtitle, tabTitle } from './shared/pageTitle.js';
import PixiVisualizer from './visualizers/PixiVisualizer.jsx';

/** Breathing room between the layout card and the topmost year marker. */
const TIMELINE_CLEARANCE = 10;

function loadBool(key, defaultVal) {
  try {
    const v = localStorage.getItem(key);
    if (v === null || v === '') return defaultVal;
    return v === 'true';
  } catch {
    return defaultVal;
  }
}

function waitMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function App() {
  const { dataset, loading } = useDataset();
  const fps = useFrameRate();
  const timeline = useTimeline(dataset);
  const [style, setStyle] = useState('galaxy');
  const [exportOpen, setExportOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingProgress, setRecordingProgress] = useState(0);
  const [encoding, setEncoding] = useState(false);
  const [encodeProgress, setEncodeProgress] = useState(0);
  const [encodeFormat, setEncodeFormat] = useState('webm');
  const [selectedPath, setSelectedPath] = useState(null);
  const [selectedCluster, setSelectedCluster] = useState(null);
  const wasPlayingRef = useRef(false);
  const [autoFit, setAutoFit] = useState(() => loadBool('rv-auto-fit', true));
  // Auto fit frames the whole graph; following the action frames only what
  // is being worked on right now.
  const [followAction, setFollowAction] = useState(() => loadBool('rv-follow-action', false));
  const [showActors, setShowActors] = useState(() => loadBool('rv-show-actors', true));
  const directory = usePeople();
  const resolveAuthor = useCallback(
    (commit) => resolveFromDirectory(directory, commit),
    [directory],
  );
  const [tuning, setTuning] = useState(() => loadTuning());
  const [tuningOpen, setTuningOpen] = useState(false);
  // A video is a capture of the canvas, so an export asking for 2x draws
  // the whole scene at twice the screen's pixel ratio.
  const [exportResolution, setExportResolution] = useState(1);
  const layoutMode = useLayoutMode();
  const compactLayout = isCompactLayout(layoutMode);
  const [mobileControlsOpen, setMobileControlsOpen] = useState(false);
  const [mobileInfoOpen, setMobileInfoOpen] = useState(false);
  const [hasStartedPlayback, setHasStartedPlayback] = useState(false);
  const [commitCardCollapsed, setCommitCardCollapsed] = useState(() =>
    loadBool('rv-commit-card-collapsed', false),
  );

  const stageRef = useRef(null);
  const timelineRef = useRef(timeline);
  const cameraApiRef = useRef(null);
  const recordStopRef = useRef(false);
  timelineRef.current = timeline;

  useEffect(() => {
    document.title = tabTitle(dataset?.title);
  }, [dataset?.title]);

  // The layout card is bottom aligned with the scrubber, and the control
  // bar is sized by what is in it, so where the scrubber starts is measured
  // rather than assumed. The year markers hang above the scrubber's own box,
  // so they are measured too: aligning to the box alone covers them up.
  useEffect(() => {
    const report = () => {
      const scrubber = document.querySelector('.timeline');
      if (!scrubber) return;
      const above = [scrubber, ...document.querySelectorAll('.timeline-year')];
      const highest = Math.min(...above.map((el) => el.getBoundingClientRect().top));
      const top = window.innerHeight - highest + TIMELINE_CLEARANCE;
      document.documentElement.style.setProperty('--timeline-top', `${Math.round(top)}px`);
    };
    report();
    const bar = document.querySelector('.control-bar');
    const watch = bar ? new ResizeObserver(report) : null;
    if (bar && watch) watch.observe(bar);
    window.addEventListener('resize', report);
    return () => {
      watch?.disconnect();
      window.removeEventListener('resize', report);
    };
  }, []);

  const adjust = useCallback((key, value) => {
    setTuning((previous) => {
      const next = { ...previous, [key]: value };
      saveTuning(next);
      return next;
    });
  }, []);

  const resetTuning = useCallback(() => {
    saveTuning(DEFAULT_TUNING);
    setTuning({ ...DEFAULT_TUNING });
  }, []);

  const excludePatterns = useMemo(() => dataset?.exclude ?? [], [dataset?.exclude]);

  const currentCommit = timeline.index >= 0 ? timeline.commits[timeline.index] : null;
  // A commit by someone the config hides has nobody on the graph firing at
  // it, so the card holds the last one that did rather than naming a person
  // who is deliberately not being shown.
  const shownCommitRef = useRef(null);
  const currentAuthor = currentCommit ? resolveAuthor(currentCommit) : null;
  if (currentAuthor) shownCommitRef.current = currentCommit;
  const shownCommit = currentAuthor ? currentCommit : shownCommitRef.current;
  // The title over a recording, and the name its file is saved under.
  const repoName = recordingName(dataset?.title, dataset?.repo);
  // Under it, what the dataset holds and how far back it goes.
  const subtitle = useMemo(() => {
    const commits = timeline.commits;
    const span = recordingSpan(commits[0]?.date, commits[commits.length - 1]?.date);
    return [recordingSubtitle(dataset?.title, dataset?.repo), span].filter(Boolean).join(' · ');
  }, [dataset?.title, dataset?.repo, timeline.commits]);
  const recordingOverlay = useMemo(() => {
    if (!recording) return null;
    return {
      repoName,
      subtitle,
      commitDate: currentCommit?.date ?? null,
    };
  }, [recording, repoName, subtitle, currentCommit?.date]);
  const allClusters = useMemo(
    () => collectAllClusters(timeline.commits, excludePatterns),
    [timeline.commits, excludePatterns],
  );
  const palette = useMemo(
    () => clusterPalette(timeline.state, allClusters),
    [timeline.state, allClusters],
  );

  const pauseForFocus = useCallback(() => {
    if (timeline.playing) {
      wasPlayingRef.current = true;
      timeline.pause();
    }
  }, [timeline]);

  const resumeAfterFocus = useCallback(() => {
    if (wasPlayingRef.current) {
      wasPlayingRef.current = false;
      timeline.play();
    }
  }, [timeline]);

  const handleCloseInspector = useCallback(() => {
    setSelectedPath(null);
    resumeAfterFocus();
  }, [resumeAfterFocus]);

  const handleClusterSelect = useCallback(
    (cluster) => {
      if (cluster) {
        pauseForFocus();
        setSelectedPath(null);
        setSelectedCluster(cluster);
      } else {
        setSelectedCluster(null);
        if (!selectedPath) resumeAfterFocus();
      }
    },
    [pauseForFocus, resumeAfterFocus, selectedPath],
  );

  const handleNodeClick = useCallback(
    (path) => {
      if (path) {
        pauseForFocus();
        setSelectedCluster(null);
        setSelectedPath(path);
      } else {
        setSelectedCluster(null);
        handleCloseInspector();
      }
    },
    [pauseForFocus, handleCloseInspector],
  );

  const visProps = {
    state: timeline.state,
    commitIndex: timeline.index,
    dataset,
    tuning,
    palette,
    autoFit,
    followAction,
    showActors,
    resolveAuthor,
    selectedPath,
    selectedCluster,
    excludePatterns,
    onNodeClick: handleNodeClick,
    cameraApiRef,
    recordingOverlay,
  };

  useEffect(() => {
    if (selectedCluster && isClusterExcluded(selectedCluster, excludePatterns)) {
      setSelectedCluster(null);
    }
  }, [selectedCluster, excludePatterns]);

  useEffect(() => {
    try {
      localStorage.setItem('rv-auto-fit', String(autoFit));
    } catch {
      /* ignore */
    }
  }, [autoFit]);

  useEffect(() => {
    try {
      localStorage.setItem('rv-follow-action', String(followAction));
    } catch {
      /* ignore */
    }
  }, [followAction]);

  useEffect(() => {
    try {
      localStorage.setItem('rv-show-actors', String(showActors));
    } catch {
      // Private browsing, or storage refused. The toggle still works.
    }
  }, [showActors]);

  useEffect(() => {
    try {
      if (localStorage.getItem('rv-auto-fit') === null) {
        localStorage.setItem('rv-auto-fit', 'true');
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!compactLayout) {
      localStorage.setItem('rv-commit-card-collapsed', String(commitCardCollapsed));
    }
  }, [commitCardCollapsed, compactLayout]);

  const toggleCommitCardCollapsed = useCallback(() => {
    setCommitCardCollapsed((c) => !c);
  }, []);

  useEffect(() => {
    if (compactLayout) {
      setMobileControlsOpen(false);
      setMobileInfoOpen(false);
    }
  }, [compactLayout]);

  useEffect(() => {
    if (compactLayout && selectedPath) {
      setMobileInfoOpen(false);
    }
  }, [compactLayout, selectedPath]);

  useEffect(() => {
    if (timeline.playing) setHasStartedPlayback(true);
  }, [timeline.playing]);

  const updateRecordingProgress = useCallback(() => {
    const total = timelineRef.current.commits.length;
    const idx = timelineRef.current.index;
    setRecordingProgress(total > 1 ? Math.max(0, (idx + 1) / total) : 0);
  }, []);

  const handleStopRecord = useCallback(() => {
    recordStopRef.current = true;
    timeline.pause();
  }, [timeline]);

  const handlePauseRecord = useCallback(() => {
    if (!recording) return;
    timeline.toggle();
  }, [recording, timeline]);

  const handleEncodingStart = useCallback((format) => {
    setRecording(false);
    setEncoding(true);
    setEncodeProgress(0);
    setEncodeFormat(format);
  }, []);

  const handleStartRecord = useCallback(
    async (opts) => {
      const getCanvas = () => stageRef.current?.querySelector('canvas');

      if (opts.format === 'png') {
        const canvas = getCanvas();
        if (!canvas) return;
        setExportOpen(false);
        await startRecording({
          canvas,
          opts,
          shouldStop: () => true,
          repo: repoName,
        });
        return;
      }

      recordStopRef.current = false;

      if (opts.resolution !== 1) {
        setExportResolution(opts.resolution);
        await waitMs(250);
      }

      const canvas = getCanvas();
      if (!canvas) return;

      setExportOpen(false);
      setRecording(true);
      setRecordingProgress(0);

      timeline.restart();
      await waitMs(200);
      timeline.play();

      const total = timeline.commits.length;

      try {
        await startRecording({
          canvas,
          opts,
          onCaptureProgress: updateRecordingProgress,
          onEncodeProgress: setEncodeProgress,
          onEncodingStart: handleEncodingStart,
          shouldStop: () => recordStopRef.current || timelineRef.current.index >= total - 1,
          repo: repoName,
        });
      } finally {
        timeline.pause();
        setRecording(false);
        setEncoding(false);
        setRecordingProgress(0);
        setEncodeProgress(0);
        setExportOpen(false);
        setExportResolution(1);
      }
    },
    [repoName, timeline, updateRecordingProgress, handleEncodingStart],
  );

  const handleToggleExport = useCallback(() => {
    if (recording || encoding) return;
    setExportOpen((open) => !open);
  }, [recording, encoding]);

  const handleTogglePlay = useCallback(() => {
    if (!timeline.playing) setHasStartedPlayback(true);
    timeline.toggle();
  }, [timeline]);

  useEffect(() => {
    const onKey = (ev) => {
      if (ev.target.matches('input, select, textarea')) return;
      if (ev.code === 'Escape') {
        if (recording) handleStopRecord();
        else if (encoding) {
          /* wait for encode to finish */
        } else if (exportOpen) setExportOpen(false);
        else {
          setSelectedCluster(null);
          handleCloseInspector();
        }
      } else if (ev.code === 'End' && !timeline.buildingFinal && !recording) {
        ev.preventDefault();
        timeline.goToFinal();
      } else if (
        ev.code === 'Space' &&
        !selectedPath &&
        !selectedCluster &&
        !recording &&
        !timeline.buildingFinal
      ) {
        ev.preventDefault();
        handleTogglePlay();
      } else if (ev.code === 'ArrowRight') timeline.seek(timeline.index + 1);
      else if (ev.code === 'ArrowLeft') timeline.seek(timeline.index - 1);
      else if (ev.code === 'Digit1') setStyle('galaxy');
      else if (ev.code === 'Digit2') setStyle('paper');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    timeline,
    selectedPath,
    selectedCluster,
    handleCloseInspector,
    recording,
    exportOpen,
    handleStopRecord,
    handleTogglePlay,
    encoding,
  ]);

  if (loading || !dataset) {
    return (
      <div className="loader">
        <div className="spinner" />
        <div>Loading repository history…</div>
      </div>
    );
  }

  const controlsExpanded = !compactLayout || mobileControlsOpen;
  const infoExpanded = !compactLayout || mobileInfoOpen;
  const showMobilePlayHint = compactLayout && !hasStartedPlayback;

  return (
    <div
      className="app"
      data-style={style}
      data-layout={layoutMode}
      data-controls-open={controlsExpanded ? 'true' : 'false'}
      data-info-open={infoExpanded ? 'true' : 'false'}
    >
      <div className="stage" ref={stageRef}>
        <PixiVisualizer {...visProps} style={style} exportResolution={exportResolution} />
        {timeline.buildingFinal && (
          <div className="final-state-loader" role="status" aria-live="polite">
            <div className="final-state-loader-card">
              <div className="final-state-loader-title">Loading final state</div>
              <div className="final-state-loader-track">
                <div
                  className="final-state-loader-bar"
                  style={{ width: `${Math.round(timeline.buildProgress * 100)}%` }}
                />
              </div>
              <div className="final-state-loader-meta">
                {Math.round(timeline.buildProgress * 100)}%
                <span className="dim"> · applying commits in batches</span>
              </div>
            </div>
          </div>
        )}
        {timeline.seeking && (
          <div className="final-state-loader" role="status" aria-live="polite">
            <div className="final-state-loader-card">
              <div className="final-state-loader-title">Seeking…</div>
              <div className="final-state-loader-track">
                <div
                  className="final-state-loader-bar"
                  style={{ width: `${Math.round(timeline.seekProgress * 100)}%` }}
                />
              </div>
              <div className="final-state-loader-meta">
                {Math.round(timeline.seekProgress * 100)}%
                <span className="dim"> · applying commits in batches</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {showMobilePlayHint && (
        <div className="mobile-play-hint-overlay" aria-live="polite">
          <span className="mobile-play-hint">Play the Repo</span>
        </div>
      )}

      <Header
        dataset={dataset}
        aside={
          <Legend
            state={timeline.state}
            palette={palette}
            style={style}
            commitIndex={timeline.index}
            excludePatterns={excludePatterns}
            selectedCluster={selectedCluster}
            onClusterSelect={handleClusterSelect}
            onSelectPath={handleNodeClick}
          />
        }
        layout={layoutMode}
        mobileControlsOpen={mobileControlsOpen}
        mobileInfoOpen={mobileInfoOpen}
        onToggleMobileControls={() => {
          setMobileControlsOpen((open) => {
            const next = !open;
            if (next && compactLayout) setMobileInfoOpen(false);
            return next;
          });
        }}
        onToggleMobileInfo={() => {
          setMobileInfoOpen((open) => {
            const next = !open;
            if (next && compactLayout) setMobileControlsOpen(false);
            return next;
          });
        }}
      />
      <CommitCard
        author={shownCommit ? resolveAuthor(shownCommit) : null}
        commit={shownCommit}
        commitIndex={timeline.index}
        commitCount={timeline.commits.length}
        collapsible={!compactLayout}
        collapsed={!compactLayout && commitCardCollapsed}
        onToggleCollapse={toggleCommitCardCollapsed}
      />

      {selectedPath && (
        <NodeInspector
          path={selectedPath}
          state={timeline.state}
          commits={timeline.commits}
          palette={palette}
          style={style}
          onSeek={timeline.seek}
          onSelectPath={setSelectedPath}
          onClose={handleCloseInspector}
        />
      )}

      {tuningOpen && (
        <TuningPanel
          tuning={tuning}
          onChange={adjust}
          onReset={resetTuning}
          onClose={() => setTuningOpen(false)}
        />
      )}

      <ControlBar
        commits={timeline.commits}
        index={timeline.index}
        seekingTo={timeline.seekingTo}
        msPerCommit={timeline.msPerCommit}
        playing={timeline.playing}
        speed={timeline.speed}
        speeds={timeline.speeds}
        onTogglePlay={handleTogglePlay}
        onGoToFinal={timeline.goToFinal}
        buildingFinal={timeline.buildingFinal}
        atFinal={timeline.atFinal}
        onSeek={timeline.seek}
        onSetSpeed={timeline.setSpeed}
        onRestart={timeline.restart}
        style={style}
        onStyleChange={setStyle}
        autoFit={autoFit}
        followAction={followAction}
        onFollowActionChange={setFollowAction}
        onAutoFitChange={setAutoFit}
        showActors={showActors}
        onShowActorsChange={setShowActors}
        onZoomIn={() => cameraApiRef.current?.zoomIn()}
        onZoomOut={() => cameraApiRef.current?.zoomOut()}
        onZoomReset={() => cameraApiRef.current?.reset()}
        tuningOpen={tuningOpen}
        onToggleTuning={() => setTuningOpen((open) => !open)}
        showPlayHint={showMobilePlayHint}
        exportControls={{
          fps,
          exportOpen,
          onToggleExport: handleToggleExport,
          onCloseExport: () => setExportOpen(false),
          recording,
          recordingProgress,
          encoding,
          encodeProgress,
          encodeFormat,
          recordingPlaying: timeline.playing,
          onStartRecord: handleStartRecord,
          onStopRecord: handleStopRecord,
          onPauseRecord: handlePauseRecord,
        }}
      />
    </div>
  );
}

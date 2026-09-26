/**
 * Shared scaffolding for canvas-based visualizers.
 */

import { useEffect, useMemo, useRef } from 'react';
import { createActors } from '../engine/actors.js';
import { createAvatarImages } from '../engine/avatarImages.js';
import { levelKey, projectsOf, simulatedLevels } from '../engine/bodies.js';
import {
  applyCameraTransform,
  createCamera,
  fitBounds,
  lerpCamera,
  resetCamera,
  snapCamera,
  zoomAt,
} from '../engine/camera.js';
import { attachCanvasGestures } from '../engine/canvasGestures.js';
import { editIntensity, FLOOR } from '../engine/editIntensity.js';
import { getDepsForPath, resolveFocusSet } from '../engine/graphState.js';
import { createLayout } from '../engine/layout.js';
import { createLodTransitions } from '../engine/lodTransitions.js';
import { drawRecordingOverlay } from '../engine/recordingOverlay.js';
import { buildRepoClock } from '../engine/repoClock.js';
import { syncBodies } from '../engine/syncBodies.js';
import { isNodeVisible, nodeOpacity } from '../engine/visibility.js';
import { drawActors } from './drawActors.js';

/** Stable empty list, so effects do not refire on a fresh literal. */
const NO_REPOS = Object.freeze([]);

export function useVisualizerCore({
  hostRef,
  state,
  commitIndex,
  dataset = null,
  onBodyCount = null,
  draw,
  clearStrategy = 'full',
  trailAlpha = 0.12,
  background = '#05060d',
  onBeforeDraw = null,
  onScreenDraw = null,
  onScreenOverlay = null,
  autoFit = true,
  showActors = true,
  resolveAuthor = null,
  selectedPath = null,
  selectedCluster = null,
  excludePatterns = [],
  onNodeClick,
  cameraApiRef,
  recordingOverlay = null,
}) {
  const canvasRef = useRef(null);
  const layoutRef = useRef(null);
  const cameraRef = useRef(createCamera());
  const ripplesRef = useRef([]);
  const actorsRef = useRef(null);
  if (!actorsRef.current) actorsRef.current = createActors();
  const avatarsRef = useRef(createAvatarImages());
  const lastCommitIdxRef = useRef(-1);
  const stateRef = useRef(state);
  const transitionsRef = useRef(null);
  if (!transitionsRef.current) transitionsRef.current = createLodTransitions();
  // What is drawn right now: the level each repo is at, and the body each
  // file was rolled into. The frame loop reads both.
  const hierarchyRef = useRef({ targets: {}, key: '', idFor: () => null });
  const rebuildRef = useRef(null);
  const intensityRef = useRef(new Map());

  const repos = dataset?.repos ?? NO_REPOS;
  const folderDepth = dataset?.folderDepth ?? 2;
  const clock = useMemo(() => buildRepoClock(dataset?.commits ?? []), [dataset?.commits]);
  const projects = useMemo(() => projectsOf(dataset), [dataset]);
  const paramsRef = useRef({
    draw,
    onBeforeDraw,
    onScreenDraw,
    onScreenOverlay,
    clearStrategy,
    trailAlpha,
    background,
    autoFit,
    selectedPath,
    selectedCluster,
    excludePatterns,
    onNodeClick,
    commitIndex,
    recordingOverlay,
    showActors,
  });
  paramsRef.current = {
    draw,
    onBeforeDraw,
    onScreenDraw,
    onScreenOverlay,
    clearStrategy,
    trailAlpha,
    background,
    autoFit,
    selectedPath,
    selectedCluster,
    excludePatterns,
    onNodeClick,
    commitIndex,
    recordingOverlay,
    showActors,
  };
  stateRef.current = state;

  if (cameraApiRef) {
    cameraApiRef.current = {
      zoomIn: () => {
        const host = hostRef.current;
        if (!host) return;
        zoomAt(cameraRef.current, host.clientWidth / 2, host.clientHeight / 2, 1.2);
      },
      zoomOut: () => {
        const host = hostRef.current;
        if (!host) return;
        zoomAt(cameraRef.current, host.clientWidth / 2, host.clientHeight / 2, 1 / 1.2);
      },
      reset: () => {
        const host = hostRef.current;
        const layout = layoutRef.current;
        if (!host || !layout) return;
        const cam = cameraRef.current;
        const w = host.clientWidth;
        const h = host.clientHeight;
        resetCamera(cam);
        const idx = paramsRef.current.commitIndex;
        const pts = layout.getNodes().filter((n) => isNodeVisible(n, idx));
        fitBounds(cam, pts, w, h);
        snapCamera(cam);
      },
    };
  }

  // Mount-only on purpose: the canvas, layout and frame loop are created once
  // and every live value is read through paramsRef inside the loop.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see above
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    host.style.touchAction = 'none';
    const canvas = document.createElement('canvas');
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    canvas.style.cursor = 'grab';
    host.appendChild(canvas);
    canvasRef.current = canvas;

    const layout = createLayout({ width: host.clientWidth, height: host.clientHeight });
    layoutRef.current = layout;

    const ctx = canvas.getContext('2d', { alpha: true });
    let dpr = Math.min(2, window.devicePixelRatio || 1);

    function resize() {
      const w = host.clientWidth;
      const h = host.clientHeight;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      layout.resize(w, h);
      const cam = cameraRef.current;
      if (paramsRef.current.autoFit && !cam.userAdjusted) {
        const idx = paramsRef.current.commitIndex;
        const pts = layout.getNodes().filter((n) => isNodeVisible(n, idx));
        fitBounds(cam, pts, w, h);
        snapCamera(cam);
      }
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    const detachGestures = attachCanvasGestures(canvas, {
      getCamera: () => cameraRef.current,
      getLayout: () => layoutRef.current,
      getCommitIndex: () => paramsRef.current.commitIndex,
      onNodeClick: (path) => paramsRef.current.onNodeClick?.(path),
    });

    const onPointerDownCursor = () => {
      canvas.style.cursor = 'grabbing';
    };
    const onPointerUpCursor = () => {
      canvas.style.cursor = 'grab';
    };
    canvas.addEventListener('pointerdown', onPointerDownCursor);
    canvas.addEventListener('pointerup', onPointerUpCursor);
    canvas.addEventListener('pointercancel', onPointerUpCursor);

    let raf;
    let lastTime = performance.now();
    function frameLoop(now) {
      const dt = now - lastTime;
      lastTime = now;
      const w = host.clientWidth;
      const h = host.clientHeight;
      const p = paramsRef.current;
      const cam = cameraRef.current;

      const hasFocus = !!(p.selectedPath || p.selectedCluster);
      const focusKey = `${p.selectedPath ?? ''}|${p.selectedCluster ?? ''}|${p.commitIndex}`;

      if (p.autoFit && !cam.userAdjusted) {
        const allPts = layout.getNodes().filter((n) => isNodeVisible(n, p.commitIndex));
        let fitPts = allPts;
        if (hasFocus && stateRef.current) {
          const focusSet = resolveFocusSet(
            stateRef.current,
            p.commitIndex,
            p.selectedPath,
            p.selectedCluster,
            p.excludePatterns,
          );
          if (focusSet.size > 0) {
            fitPts = allPts.filter((n) => focusSet.has(n.path));
          }
        }
        if (fitPts.length > 0) {
          const refit = !hasFocus || focusKey !== cam._focusFitKey;
          if (refit) {
            fitBounds(cam, fitPts, w, h);
            if (!hasFocus) {
              if (!cam._fitted) snapCamera(cam);
              cam._fitted = true;
            } else {
              snapCamera(cam);
              cam._focusFitKey = focusKey;
            }
          }
        }
      } else if (!hasFocus) {
        cam._focusFitKey = null;
      }
      lerpCamera(cam, dt);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (p.clearStrategy === 'trail') {
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = withAlpha(p.background, p.trailAlpha);
        ctx.fillRect(0, 0, w, h);
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = p.background;
        ctx.fillRect(0, 0, w, h);
      }

      if (p.onScreenDraw) p.onScreenDraw(ctx, { w, h, dt, now });

      // Level of detail moves on wall-clock time, so the transitions are
      // advanced every frame. A repo crossing into a new level changes what
      // there is to simulate, which is the only reason to rebuild here.
      const transitions = transitionsRef.current;
      transitions.update(hierarchyRef.current.targets, now);
      const levels = simulatedLevels(hierarchyRef.current.targets, transitions);
      if (levelKey(levels) !== hierarchyRef.current.key) rebuildRef.current?.();
      layout.setMotion((repo) => transitions.stateFor(repo));

      if (!hasFocus) layout.tick();

      const ripples = ripplesRef.current;
      const nowMs = now;
      for (let i = ripples.length - 1; i >= 0; i--) {
        const r = ripples[i];
        const age = nowMs - r.bornAt;
        if (age > r.ttl) ripples.splice(i, 1);
        else r.progress = Math.max(0, Math.min(1, age / r.ttl));
      }

      ctx.save();
      applyCameraTransform(ctx, cam, dpr);

      if (p.onBeforeDraw) p.onBeforeDraw(ctx, { w, h, dt, now });

      const allNodes = layout.getNodes();
      const allLinks = layout.getLinks();
      const idx = p.commitIndex;
      const nodes = allNodes.filter((n) => isNodeVisible(n, idx));
      const nodeSet = new Set(nodes.map((n) => n.path));
      const links = allLinks.filter(
        (l) => nodeSet.has(l.source.path) && nodeSet.has(l.target.path),
      );

      const focusSet = resolveFocusSet(
        stateRef.current,
        idx,
        p.selectedPath,
        p.selectedCluster,
        p.excludePatterns,
      );

      const pathToNode = new Map(nodes.map((n) => [n.path, n]));
      const highlightLinks = [];
      if (p.selectedPath && stateRef.current) {
        const { inbound, outbound } = getDepsForPath(stateRef.current, p.selectedPath);
        for (const e of [...outbound, ...inbound]) {
          const from = pathToNode.get(e.from);
          const to = pathToNode.get(e.to);
          if (from && to) highlightLinks.push({ source: from, target: to, weight: e.weight });
        }
      }

      // A beam triggers its file's ripple when it lands, so the two effects
      // stay in step rather than both firing on the commit.
      if (p.showActors) actorsRef.current.setClusters(layout.getClusterCenters().values());
      const landed = p.showActors ? actorsRef.current.tick(dt) : [];
      for (const path of landed) {
        ripplesRef.current.push({
          path,
          intensity: intensityRef.current.get(path) ?? FLOOR,
          status: 'M',
          bornAt: now,
          ttl: 2400,
          progress: 0,
        });
      }

      p.draw(ctx, {
        w,
        h,
        dt,
        now,
        nodes,
        links,
        highlightLinks,
        clusters: layout.getClusterCenters(),
        ripples,
        state: stateRef.current,
        commitIndex: idx,
        selectedPath: p.selectedPath,
        selectedCluster: p.selectedCluster,
        focusSet,
        // A body mid-collapse is faded by the transition on top of the
        // ordinary fade-in.
        nodeOpacity: (n) => nodeOpacity(n, idx) * (n.alpha ?? 1),
        dimOthers: focusSet.size > 0,
        cameraScale: cam.scale,
        excludePatterns: p.excludePatterns,
      });

      if (p.showActors) {
        drawActors(ctx, {
          actors: actorsRef.current.list(),
          beams: actorsRef.current.beams(),
          images: avatarsRef.current,
          cameraScale: cam.scale,
        });
      }

      ctx.restore();

      if (p.onScreenOverlay) p.onScreenOverlay(ctx, { w, h, dt, now });

      if (p.recordingOverlay) {
        drawRecordingOverlay(ctx, { w, h, dpr }, p.recordingOverlay, p.background);
      }

      raf = requestAnimationFrame(frameLoop);
    }
    raf = requestAnimationFrame(frameLoop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      layout.stop();
      detachGestures();
      canvas.removeEventListener('pointerdown', onPointerDownCursor);
      canvas.removeEventListener('pointerup', onPointerUpCursor);
      canvas.removeEventListener('pointercancel', onPointerUpCursor);
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    };
  }, []);

  // The people export arrives after the first render, so hand the resolver
  // over whenever it changes instead of freezing the one that existed at
  // mount. Without this every address is its own actor.
  useEffect(() => {
    if (resolveAuthor) actorsRef.current.setResolver(resolveAuthor);
  }, [resolveAuthor]);

  useEffect(() => {
    const layout = layoutRef.current;
    if (!layout || !state) return;

    const rebuild = () => {
      const { targets, levels, count, idFor } = syncBodies(layout, state, commitIndex, {
        repos,
        folderDepth,
        projects,
        clock,
        transitions: transitionsRef.current,
        excludePatterns,
        at: performance.now(),
      });
      hierarchyRef.current = { targets, key: levelKey(levels), idFor };
      onBodyCount?.(count);
    };

    rebuildRef.current = rebuild;
    rebuild();
  }, [state, commitIndex, excludePatterns, repos, folderDepth, projects, clock, onBodyCount]);

  useEffect(() => {
    if (commitIndex === lastCommitIdxRef.current) return;
    if (paramsRef.current.selectedPath || paramsRef.current.selectedCluster) return;
    if (commitIndex >= 0 && state?.lastCommit && commitIndex > lastCommitIdxRef.current) {
      const now = performance.now();
      const layout = layoutRef.current;
      // A commit touches files, but at most levels a file is not on screen:
      // what is drawn is the folder or repo it was rolled into. Collect the
      // edit per body so one beam is fired at each, carrying how much of
      // that body the commit rewrote.
      const idFor = hierarchyRef.current.idFor;
      const edits = new Map();
      for (const ch of state.lastCommit.changes) {
        const id = idFor(ch.path);
        if (!id) continue;
        const edit = edits.get(id) ?? { path: id, added: 0, removed: 0, status: 'M' };
        edit.added += ch.added || 0;
        edit.removed += ch.removed || 0;
        if (ch.status === 'D' && id === ch.path) edit.status = 'D';
        edits.set(id, edit);
      }

      const nodesById = {};
      intensityRef.current.clear();
      for (const [id, edit] of edits) {
        const node = layout?.getNode(id);
        if (node) nodesById[id] = node;
        intensityRef.current.set(id, editIntensity(edit, { lines: node?.size }));
      }

      if (paramsRef.current.showActors) {
        actorsRef.current.onCommit(
          { ...state.lastCommit, changes: [...edits.values()] },
          nodesById,
          now,
        );
      }
      // With actors on, the ripple waits for the beam. Without them it fires
      // straight away, which is what the visualizer did before.
      if (!paramsRef.current.showActors) {
        for (const edit of edits.values()) {
          ripplesRef.current.push({
            path: edit.path,
            intensity: intensityRef.current.get(edit.path) ?? FLOOR,
            status: edit.status,
            bornAt: now,
            ttl: 2400,
            progress: 0,
          });
        }
      }
      const host = hostRef.current;
      if (host && paramsRef.current.autoFit) {
        const cam = cameraRef.current;
        cam.userAdjusted = false;
        cam._fitted = false;
      }
    }
    if (commitIndex < lastCommitIdxRef.current) actorsRef.current.clear();
    lastCommitIdxRef.current = commitIndex;
  }, [commitIndex, state, hostRef]);

  return { canvasRef, layoutRef, cameraRef };
}

function withAlpha(hexOrRgb, alpha) {
  if (hexOrRgb.startsWith('#')) {
    const h = hexOrRgb.slice(1);
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return hexOrRgb;
}

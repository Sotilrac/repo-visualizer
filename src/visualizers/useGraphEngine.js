/**
 * Everything the picture is made of, and nothing about how it is drawn.
 *
 * The layout, the people, the level of detail, the camera, the commits and
 * the frame clock live here; the renderer is handed a plain description of
 * one frame and nothing else. That split is what let four visualizers that
 * each redrew the same graph their own way become one renderer with a
 * handful of numbers between the looks.
 */

import { useEffect, useMemo, useRef } from 'react';
import { AVATAR_RADIUS, createActors } from '../engine/actors.js';
import { createAvatarImages } from '../engine/avatarImages.js';
import { levelKey, projectsOf, simulatedLevels, submoduleParents } from '../engine/bodies.js';
import {
  createCamera,
  fitBounds,
  lerpCamera,
  resetCamera,
  snapCamera,
  zoomAt,
} from '../engine/camera.js';
import { attachCanvasGestures } from '../engine/canvasGestures.js';
import { editIntensity, FLOOR } from '../engine/editIntensity.js';
import { activePoints } from '../engine/followAction.js';
import { getDepsForPath, resolveFocusSet } from '../engine/graphState.js';
import { createLayout } from '../engine/layout.js';
import { createLodTransitions } from '../engine/lodTransitions.js';
import { buildRepoClock } from '../engine/repoClock.js';
import { createStepClock } from '../engine/stepClock.js';
import { syncBodies } from '../engine/syncBodies.js';
import { cameraSpeed } from '../engine/tuning.js';
import { isNodeVisible, nodeOpacity } from '../engine/visibility.js';
import { starfield } from './pixi/starfield.js';
import { styleFor } from './pixi/styles.js';

/** Stable empty list, so effects do not refire on a fresh literal. */
const NO_REPOS = Object.freeze([]);

/**
 * @param {{
 *   hostRef: { current: HTMLElement | null },
 *   rendererRef: { current: { resize: Function, draw: Function } | null },
 * } & Record<string, any>} options
 */
export function useGraphEngine({
  hostRef,
  rendererRef,
  state,
  commitIndex,
  dataset = null,
  tuning = null,
  onBodyCount = null,
  style = 'galaxy',
  palette,
  autoFit = true,
  followAction = false,
  showActors = true,
  showLabels = true,
  resolveAuthor = null,
  selectedPath = null,
  selectedCluster = null,
  excludePatterns = [],
  onNodeClick,
  cameraApiRef,
  recordingOverlay = null,
}) {
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
  const resizeRef = useRef(null);
  const intensityRef = useRef(new Map());

  const repos = dataset?.repos ?? NO_REPOS;
  const folderDepth = dataset?.folderDepth ?? 2;
  const clock = useMemo(() => buildRepoClock(dataset?.commits ?? []), [dataset?.commits]);
  const projects = useMemo(() => projectsOf(dataset), [dataset]);
  const groups = useMemo(() => submoduleParents(dataset), [dataset]);
  const stars = useMemo(() => starfield(), []);

  const params = {
    autoFit,
    followAction,
    selectedPath,
    selectedCluster,
    excludePatterns,
    onNodeClick,
    commitIndex,
    recordingOverlay,
    showActors,
    showLabels,
    style,
    palette,
    tuning,
  };
  const paramsRef = useRef(params);
  paramsRef.current = params;
  stateRef.current = state;

  /**
   * Room the camera leaves for the people standing outside the repos: how
   * far off they stand, plus how far a crowd of them spreads pushing each
   * other apart.
   */
  const actorMargin = (p) => {
    if (!p.showActors) return 0;
    const standoff = p.tuning?.standoff ?? 0;
    const spread = Math.max(AVATAR_RADIUS * 2, (p.tuning?.avatarSpacing ?? 0) / 2);
    return standoff + spread;
  };

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
        resetCamera(cam);
        const idx = paramsRef.current.commitIndex;
        const pts = layout.getNodes().filter((n) => isNodeVisible(n, idx));
        fitBounds(
          cam,
          pts,
          host.clientWidth,
          host.clientHeight,
          undefined,
          actorMargin(paramsRef.current),
        );
        snapCamera(cam);
      },
    };
  }

  // Mount-only on purpose: the layout and frame loop are created once and
  // every live value is read through paramsRef inside the loop.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see above
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    host.style.touchAction = 'none';

    const layout = createLayout({
      width: host.clientWidth,
      height: host.clientHeight,
      tuning: paramsRef.current.tuning,
    });
    layoutRef.current = layout;
    // Someone leaning on a bubble moves it, and a settled graph is not
    // stepped, so the people have to be able to wake it.
    actorsRef.current.setWake(() => layout.wake());

    function resize() {
      const w = host.clientWidth;
      const h = host.clientHeight;
      rendererRef.current?.resize(w, h);
      layout.resize(w, h);
      const cam = cameraRef.current;
      if (paramsRef.current.autoFit && !cam.userAdjusted) {
        const idx = paramsRef.current.commitIndex;
        const pts = layout.getNodes().filter((n) => isNodeVisible(n, idx));
        fitBounds(cam, pts, w, h, undefined, actorMargin(paramsRef.current));
        snapCamera(cam);
      }
    }
    resizeRef.current = resize;
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    const detachGestures = attachCanvasGestures(host, {
      getCamera: () => cameraRef.current,
      getLayout: () => layoutRef.current,
      getCommitIndex: () => paramsRef.current.commitIndex,
      onNodeClick: (path) => paramsRef.current.onNodeClick?.(path),
    });

    const onPointerDownCursor = () => {
      host.style.cursor = 'grabbing';
    };
    const onPointerUpCursor = () => {
      host.style.cursor = 'grab';
    };
    host.addEventListener('pointerdown', onPointerDownCursor);
    host.addEventListener('pointerup', onPointerUpCursor);
    host.addEventListener('pointercancel', onPointerUpCursor);

    let raf;
    // The simulation runs at its own rate whatever the monitor does, so the
    // graph settles in the same place and at the same speed on any machine.
    const steps = createStepClock();
    let lastTime = performance.now();

    function frameLoop(now) {
      const dt = now - lastTime;
      lastTime = now;
      raf = requestAnimationFrame(frameLoop);

      const w = host.clientWidth;
      const h = host.clientHeight;
      const p = paramsRef.current;
      const cam = cameraRef.current;
      const idx = p.commitIndex;

      const hasFocus = !!(p.selectedPath || p.selectedCluster);
      const focusKey = `${p.selectedPath ?? ''}|${p.selectedCluster ?? ''}|${idx}`;

      // Level of detail moves on wall-clock time, so the transitions are
      // advanced every frame. A repo crossing into a new level changes what
      // there is to simulate, which is the only reason to rebuild here.
      const transitions = transitionsRef.current;
      transitions.update(hierarchyRef.current.targets, now);
      const levels = simulatedLevels(hierarchyRef.current.targets, transitions);
      if (levelKey(levels) !== hierarchyRef.current.key) rebuildRef.current?.();
      layout.setMotion((repo) => transitions.stateFor(repo));

      const ticks = steps.advance(dt);
      if (!hasFocus) {
        for (let step = 0; step < ticks; step++) layout.tick();
      }

      const ripples = ripplesRef.current;
      for (let i = ripples.length - 1; i >= 0; i--) {
        const r = ripples[i];
        const age = now - r.bornAt;
        if (age > r.ttl) ripples.splice(i, 1);
        else r.progress = Math.max(0, Math.min(1, age / r.ttl));
      }

      const nodes = layout.getNodes().filter((n) => isNodeVisible(n, idx));
      const nodeByPath = new Map(nodes.map((n) => [n.path, n]));
      const links = layout
        .getLinks()
        .filter((l) => nodeByPath.has(l.source.path) && nodeByPath.has(l.target.path));

      const focusSet = resolveFocusSet(
        stateRef.current,
        idx,
        p.selectedPath,
        p.selectedCluster,
        p.excludePatterns,
      );
      const dimOthers = focusSet.size > 0;

      const highlightLinks = [];
      if (p.selectedPath && stateRef.current) {
        const { inbound, outbound } = getDepsForPath(stateRef.current, p.selectedPath);
        for (const e of [...outbound, ...inbound]) {
          const from = nodeByPath.get(e.from);
          const to = nodeByPath.get(e.to);
          if (from && to) highlightLinks.push({ source: from, target: to, weight: e.weight });
        }
      }

      // A beam triggers its file's ripple when it lands, so the two effects
      // stay in step rather than both firing on the commit.
      if (p.showActors) {
        actorsRef.current.setClusters(layout.getClusterCenters().values());
        // Everything on screen, which is what nobody may be drawn on top of.
        actorsRef.current.setBodies(nodes);
      }
      const crowd = p.showActors ? actorsRef.current.list() : [];
      const landed = p.showActors ? actorsRef.current.tick(dt, ticks) : [];
      if (p.showActors) actorsRef.current.interpolate(steps.alpha());
      for (const path of landed) {
        ripples.push({
          path,
          intensity: intensityRef.current.get(path) ?? FLOOR,
          status: 'M',
          bornAt: now,
          ttl: 2400,
          progress: 0,
        });
      }

      // Framed last, because following the action means framing what the
      // people are doing and that is not known until they have moved.
      if (p.autoFit && !cam.userAdjusted) {
        const everything = nodes;
        const following = p.followAction
          ? activePoints({ ripples, actors: crowd, nodeByPath })
          : [];
        let fitPts = following.length ? following : everything;
        let margin = following.length ? AVATAR_RADIUS * 3 : actorMargin(p);
        if (hasFocus && focusSet.size > 0) {
          fitPts = everything.filter((n) => focusSet.has(n.path));
          margin = actorMargin(p);
        }
        if (fitPts.length > 0 && (!hasFocus || focusKey !== cam._focusFitKey)) {
          fitBounds(cam, fitPts, w, h, undefined, margin);
          if (hasFocus) {
            snapCamera(cam);
            cam._focusFitKey = focusKey;
          } else {
            if (!cam._fitted) snapCamera(cam);
            cam._fitted = true;
          }
        }
      } else if (!hasFocus) {
        cam._focusFitKey = null;
      }
      lerpCamera(cam, dt, cameraSpeed(p.tuning?.cameraEase ?? 420));

      rendererRef.current?.draw({
        w,
        h,
        dt,
        now,
        cam,
        styleName: p.style,
        style: styleFor(p.style),
        palette: p.palette,
        stars,
        nodes,
        links,
        highlightLinks,
        nodeByPath,
        clusters: layout.getClusterCenters(),
        ripples,
        actors: crowd,
        beams: p.showActors ? actorsRef.current.beams() : [],
        images: avatarsRef.current,
        showLabels: p.showLabels,
        focused: dimOthers ? focusSet : null,
        selectedPath: p.selectedPath,
        // A body mid-collapse is faded by the transition on top of the
        // ordinary fade-in.
        nodeOpacity: (n) => {
          const base = nodeOpacity(n, idx) * (n.alpha ?? 1);
          if (!dimOthers) return base;
          if (n.path === p.selectedPath) return 1;
          return focusSet.has(n.path) ? Math.max(base, 0.9) : 0.08;
        },
        linkAlpha: (a, b) => {
          if (!dimOthers) return 1;
          return focusSet.has(a) && focusSet.has(b) ? 1 : 0.07;
        },
        showRipple: (path) => !dimOthers || focusSet.has(path),
        recording: p.recordingOverlay,
      });
    }
    raf = requestAnimationFrame(frameLoop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      layout.stop();
      detachGestures();
      host.removeEventListener('pointerdown', onPointerDownCursor);
      host.removeEventListener('pointerup', onPointerUpCursor);
      host.removeEventListener('pointercancel', onPointerUpCursor);
    };
  }, []);

  useEffect(() => {
    if (!tuning) return;
    layoutRef.current?.setTuning(tuning);
    actorsRef.current.setTuning(tuning);
  }, [tuning]);

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
        groups,
        at: performance.now(),
      });
      hierarchyRef.current = { targets, key: levelKey(levels), idFor };
      onBodyCount?.(count);
    };

    rebuildRef.current = rebuild;
    rebuild();
  }, [
    state,
    commitIndex,
    excludePatterns,
    repos,
    folderDepth,
    projects,
    groups,
    clock,
    onBodyCount,
  ]);

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
        const changes = [...edits.values()];
        // A squashed pull request has one git author and names the rest in
        // the message. Everyone on the commit fires at everything it
        // touched: the work was the pair's, not the person who pressed the
        // button.
        const everyone = [
          state.lastCommit,
          ...(state.lastCommit.coAuthors ?? []).map((person) => ({
            ...state.lastCommit,
            author: person.name,
            authorEmail: person.email,
          })),
        ];
        for (const commit of everyone) {
          actorsRef.current.onCommit({ ...commit, changes }, nodesById, now);
        }
      } else {
        // With actors on, the ripple waits for the beam. Without them it
        // fires straight away.
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
      if (hostRef.current && paramsRef.current.autoFit) {
        // Auto-fit picks up again, but the camera eases there. Clearing
        // `_fitted` as well made it snap to a new fit on every commit,
        // which is the jump that reads as a glitch while playing.
        cameraRef.current.userAdjusted = false;
      }
    }
    if (commitIndex < lastCommitIdxRef.current) actorsRef.current.clear();
    lastCommitIdxRef.current = commitIndex;
  }, [commitIndex, state, hostRef]);

  return { layoutRef, cameraRef, resizeRef };
}

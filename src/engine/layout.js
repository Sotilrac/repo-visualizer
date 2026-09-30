/**
 * Force-directed layout engine.
 *
 * There is no centring force. The blobs are placed around the middle of
 * the viewport and each body is held inside its own, so nothing needs
 * pulling back to the centre. A centring force also translates every body
 * at once whenever the average of their positions moves, which a single
 * new bubble is enough to do: the whole scene lurches on a commit.
 *
 * What it simulates is a list of bodies, not a list of files: at one level
 * of detail a body is a file, at another it is the folder or the repo the
 * files were rolled up into. A body mid-transition is drawn part of the way
 * towards the repo it is falling into, which is the collapse animation, and
 * the same interpolation run backwards is the burst outward.
 */

import { forceCollide, forceLink, forceManyBody, forceSimulation } from 'd3-force';
import { clusterRadii, forceContain, placeClusters } from './clusters.js';
import { withDefaults } from './tuning.js';

/**
 * How big to draw a body.
 *
 * A container is sized by how much it holds, a file by how big it is. File
 * counts run from one to thousands, so the container scale is logarithmic:
 * a square root saturates against any cap low enough to keep the biggest
 * repo on screen, and once a hundred folders all sit at the cap the graph
 * is a field of identical circles.
 *
 * @param {{ kind?: string, files?: number, size?: number }} body
 * @param {number} inbound how many other bodies import this one
 * @param {{ repoSize?: number, fileSize?: number }} [scale]
 */
export function bodyRadius(body, inbound = 0, scale = {}) {
  const importBoost = Math.min(5, Math.sqrt(inbound) * 0.65);
  if (body.kind && body.kind !== 'file') {
    const r = Math.min(64, 8 + 14 * Math.log10(1 + (body.files ?? 0)));
    return r * (scale.repoSize ?? 1) + importBoost;
  }
  const r = 6 + Math.min(22, Math.sqrt(Math.max(10, body.size ?? 0)) * 1.35);
  return r * (scale.fileSize ?? 1) + importBoost;
}

function inboundCounts(edges) {
  const counts = new Map();
  for (const edge of edges) counts.set(edge.target, (counts.get(edge.target) ?? 0) + 1);
  return counts;
}

function applyDegrees(nodes, links) {
  for (const n of nodes) {
    n._degree = 0;
  }
  for (const l of links) {
    const s = l.source;
    const t = l.target;
    if (s?._degree != null) s._degree += 1;
    if (t?._degree != null) t._degree += 1;
  }
}

/**
 * @param {{ width: number, height: number, tuning?: Record<string, number> | null }} options
 */
export function createLayout({ width, height, tuning = null }) {
  let tune = withDefaults(tuning);
  const nodes = [];
  const links = [];
  const nodeByPath = new Map();
  // Where a body was when it was last on screen. A repo that goes quiet
  // drops a level and its folders leave; when it is touched again they come
  // back, and coming back in a random spot inside the blob scatters a repo
  // that has not otherwise changed.
  const remembered = new Map();
  const clusterCenters = new Map();
  // The order the repos first appeared in, which is the order they are laid
  // out in, so an existing repo keeps its place when a new one turns up.
  const clusterOrder = [];
  /** @type {Map<string, string>} */
  let groupParent = new Map();
  /** Repos grouped by the one at the top of their stack, in arrival order. */
  const clusterGroups = new Map();
  let syncCount = 0;
  let lastClusterKey = '';
  let lastSpread = 0;
  let lastVisibleCount = 0;
  let lastLinkCount = 0;

  const sim = forceSimulation(nodes)
    .force(
      'charge',
      forceManyBody()
        // Scaled by size: a repo bubble is five times the radius of a file
        // and has to push five times as hard to keep the same clear space.
        .strength((d) => {
          const deg = d._degree || 1;
          return (-(16 + (d.r ?? 6) * 2.6) * tune.repel) / Math.sqrt(deg);
        })
        .distanceMax(460),
    )
    .force(
      'link',
      forceLink(links)
        .id((d) => d.path)
        .distance((l) => {
          const ds = l.source._degree || 1;
          const dt = l.target._degree || 1;
          return tune.linkDistance + 18 / Math.sqrt(ds + dt);
        })
        .strength((l) => {
          const ds = l.source._degree || 1;
          const dt = l.target._degree || 1;
          return (0.14 * tune.linkPull) / Math.sqrt(ds * dt);
        }),
    )
    .force(
      'collide',
      forceCollide()
        .radius((d) => d.r + tune.spacing)
        .strength(0.95)
        // One pass leaves a crowd overlapping; the second resolves what the
        // first pushed into something else.
        .iterations(2),
    )
    .force(
      'contain',
      forceContain({ centers: () => clusterCenters, strength: () => tune.clusterPull }),
    )
    .alpha(0.32)
    .alphaDecay(0.022)
    .alphaTarget(0)
    .velocityDecay(0.38);

  function scaleForSize() {
    const n = nodes.length;
    if (n > 200) {
      sim.velocityDecay(0.42);
    } else if (n > 80) {
      sim.velocityDecay(0.4);
    } else {
      sim.velocityDecay(0.38);
    }
  }

  function resize(w, h) {
    width = w;
    height = h;
    rebuildClusterCenters(true);
    sim.alpha(0.22).restart();
  }

  function rebuildClusterCenters(force = false) {
    const radii = clusterRadii(nodes, { pad: tune.spacing + 3, slack: tune.clusterRoom });
    const spread = [...radii.values()].reduce((sum, r) => sum + r, 0);
    const key = [...radii.keys()].sort().join('\0');

    // The blobs are only laid out again when the repos on screen change or
    // when they have grown enough to need the room. Re-placing them every
    // sync drags the whole graph around while it is being watched.
    const grown = spread > lastSpread * 1.12 || spread < lastSpread * 0.88;
    if (!force && key === lastClusterKey && !grown) {
      // The blobs stay put, but each one still tracks what it now holds.
      for (const [dir, center] of clusterCenters) center.radius = radii.get(dir) ?? center.radius;
      return false;
    }
    lastClusterKey = key;
    lastSpread = spread;

    for (const dir of radii.keys()) {
      if (!clusterOrder.includes(dir)) placeInOrder(dir);
    }

    const placed = placeClusters(radii, {
      width,
      height,
      gap: tune.clusterGap,
      order: clusterOrder,
      groups: [...clusterGroups.values()],
    });

    for (const [dir, center] of placed) {
      const current = clusterCenters.get(dir);
      // A repo that is already on screen drifts to its new place rather
      // than jumping to it, so the bodies inside it come along instead of
      // being left behind by a blob that teleported.
      if (current) {
        current.angle = center.angle;
        current.ring = center.ring;
        current.target = center;
      } else {
        clusterCenters.set(dir, { ...center, target: center });
      }
    }
    for (const dir of [...clusterCenters.keys()]) {
      if (!placed.has(dir)) clusterCenters.delete(dir);
    }

    return true;
  }

  /**
   * Put a repo in the running order: with the repos it belongs to.
   *
   * A stack of repos is one thing, so they take one run of slots on the
   * spiral. Which repo of a stack turns up first is an accident of the
   * history, so the group is keyed by the repo at the top of it, whether or
   * not that one has been drawn yet.
   *
   * @param {string} dir
   */
  function placeInOrder(dir) {
    const root = rootOf(dir);
    let group = clusterGroups.get(root);
    if (!group) {
      group = [];
      clusterGroups.set(root, group);
    }
    // The repo at the top of the stack holds the middle of its group.
    if (!group.includes(dir)) {
      if (dir === root) group.unshift(dir);
      else group.push(dir);
    }

    clusterOrder.length = 0;
    for (const members of clusterGroups.values()) clusterOrder.push(...members);
  }

  /** The repo at the top of a stack of submodules. */
  function rootOf(dir) {
    const seen = new Set([dir]);
    let root = dir;
    let parent = groupParent.get(root);
    while (parent && !seen.has(parent)) {
      seen.add(parent);
      root = parent;
      parent = groupParent.get(root);
    }
    return root;
  }

  /**
   * Which repo carries which, from the dataset.
   *
   * @param {Map<string, string>} parents
   */
  function setGroups(parents) {
    groupParent = parents ?? new Map();
  }

  /** Carry each blob a little further towards where it now belongs. */
  function easeClusters() {
    for (const center of clusterCenters.values()) {
      const to = center.target;
      if (!to) continue;
      // Slowly: a repo relocating takes a second, and everything inside it
      // travels with it, so a quick move reads as the scene lurching.
      center.x += (to.x - center.x) * 0.035;
      center.y += (to.y - center.y) * 0.035;
      center.radius += (to.radius - center.radius) * 0.035;
      if (Math.abs(to.x - center.x) + Math.abs(to.y - center.y) < 0.4) {
        center.x = to.x;
        center.y = to.y;
        center.radius = to.radius;
        center.target = null;
      }
    }
  }

  /**
   * @param {any[]} bodies what to simulate now, from `bodyIndex`
   * @param {Array<{ source: string, target: string, weight: number }>} edges
   *   already lifted to those bodies
   * @param {{ forceRestart?: boolean }} [options]
   */
  function sync(bodies, edges = [], options = {}) {
    const { forceRestart = false } = options;
    syncCount++;
    const inbound = inboundCounts(edges);
    const prevVisible = lastVisibleCount;
    const prevLinks = lastLinkCount;

    const seen = new Set();
    for (const body of bodies) {
      const id = body.id;
      seen.add(id);
      const targetR = bodyRadius(body, inbound.get(id) ?? 0, tune);
      let node = nodeByPath.get(id);
      if (!node) {
        const center = clusterCenters.get(body.repo) || { x: width / 2, y: height / 2 };
        const jitter = 22 + Math.random() * 28;
        const a = Math.random() * Math.PI * 2;
        const was = remembered.get(id);
        node = {
          path: id,
          dir: body.repo,
          x: was ? was.x : center.x + Math.cos(a) * jitter,
          y: was ? was.y : center.y + Math.sin(a) * jitter,
          vx: 0,
          vy: 0,
          r: targetR,
        };
        nodeByPath.set(id, node);
      }
      node._targetR = targetR;
      node.dir = body.repo;
      node.kind = body.kind;
      node.parent = body.parent;
      node.size = body.size;
      node.churn = body.churn;
      node.files = body.files;
      node.commits = body.commits;
      node.lastTouchedAt = body.lastTouchedAt;
      node.bornAt = body.bornAt;
      node.deleted = false;
    }

    for (const id of [...nodeByPath.keys()]) {
      if (seen.has(id)) continue;
      const node = nodeByPath.get(id);
      remembered.set(id, { x: node.x, y: node.y });
      nodeByPath.delete(id);
    }
    // Bounded, so a long timeline does not carry every folder it ever drew.
    if (remembered.size > 4000) {
      for (const id of [...remembered.keys()].slice(0, 2000)) remembered.delete(id);
    }
    nodes.length = 0;
    for (const node of nodeByPath.values()) nodes.push(node);

    links.length = 0;
    for (const edge of edges) {
      const from = nodeByPath.get(edge.source);
      const to = nodeByPath.get(edge.target);
      if (from && to) links.push({ source: from, target: to, weight: edge.weight, bornAt: 0 });
    }

    applyDegrees(nodes, links);
    const replaced = rebuildClusterCenters();
    sim.nodes(nodes);
    sim.force('link').links(links);
    scaleForSize();

    const visibleCount = seen.size;
    const linkCount = links.length;
    const nodesAdded = Math.max(0, visibleCount - prevVisible);
    const nodesRemoved = Math.max(0, prevVisible - visibleCount);
    const linksChanged = linkCount !== prevLinks;
    const topologyChanged =
      nodesAdded > 0 || nodesRemoved > 0 || linksChanged || forceRestart || syncCount <= 1;

    lastVisibleCount = visibleCount;
    lastLinkCount = linkCount;

    // Moving the blobs leaves every body in the wrong place, and a cold
    // simulation will not carry them to the new one: they sit wherever they
    // were until something else warms it up.
    if (replaced) {
      sim.alpha(Math.max(sim.alpha(), 0.3)).restart();
      lastVisibleCount = visibleCount;
      lastLinkCount = linkCount;
      return;
    }

    if (!topologyChanged) {
      return;
    }

    const large = linkCount > 80;
    let heat;
    if (forceRestart) {
      heat = large ? 0.28 : 0.38;
    } else if (nodesAdded <= 2 && nodesRemoved === 0 && large) {
      heat = 0.045;
    } else if (nodesAdded <= 5 && nodesRemoved <= 2) {
      heat = large ? 0.07 : 0.12;
    } else {
      heat = large ? 0.1 : 0.18;
    }

    sim.alpha(Math.max(sim.alpha(), heat)).restart();
  }

  /**
   * How far each body has fallen towards its repo, and how solid it is.
   *
   * Called every frame, so it only touches the bodies that are moving.
   *
   * @param {(repo: string) => { phase: string, progress: number } | null} stateFor
   */
  function setMotion(stateFor) {
    for (const node of nodes) {
      const transition = stateFor(node.dir);
      if (!transition || transition.phase === 'steady') {
        node.pull = 0;
        node.alpha = 1;
        continue;
      }
      const collapsing = transition.phase === 'collapsing';
      node.pull = collapsing ? transition.progress : 1 - transition.progress;
      node.alpha = collapsing ? 1 - transition.progress : transition.progress;
    }
  }

  /**
   * Interpolate the moving bodies towards what they are falling into, and
   * keep the position the simulation gave them so the next frame starts
   * from the trajectory rather than from the interpolated point.
   */
  function applyPull() {
    for (const node of nodes) {
      if (node._sx !== undefined) {
        node.x = node._sx;
        node.y = node._sy;
      }
      if (!node.pull) {
        // Out of the transition: hand the body back to the simulation.
        // Holding on to the position it was interpolated from pins it there
        // for good, and the graph slowly silts up wherever bodies were born.
        node._sx = undefined;
        node._sy = undefined;
        continue;
      }

      node._sx = node.x;
      node._sy = node.y;
      const into = (node.parent && nodeByPath.get(node.parent)) || clusterCenters.get(node.dir);
      if (!into) continue;
      node.x += (into.x - node.x) * node.pull;
      node.y += (into.y - node.y) * node.pull;
    }
  }

  /**
   * Take new settings and put them to work on the running graph, without
   * rebuilding it: the forces read the same object every tick, and d3 only
   * needs telling that the parameters it caches have moved.
   *
   * @param {Record<string, number>} next
   */
  function setTuning(next) {
    tune = withDefaults(next);

    sim.force('charge').strength(sim.force('charge').strength());
    sim.force('collide').radius(sim.force('collide').radius());
    sim.force('link').distance(sim.force('link').distance());
    sim.force('link').strength(sim.force('link').strength());

    for (const node of nodes) {
      node._targetR = bodyRadius(node, 0, tune);
    }
    rebuildClusterCenters(true);
    sim.alpha(Math.max(sim.alpha(), 0.35)).restart();
  }

  function getNode(path) {
    return nodeByPath.get(path) ?? null;
  }

  function getNodes() {
    return nodes;
  }
  function getLinks() {
    return links;
  }
  function getClusterCenters() {
    return clusterCenters;
  }
  function getAlpha() {
    return sim.alpha();
  }

  function tick() {
    easeClusters();

    if (sim.alpha() < 0.0008) {
      if ([...clusterCenters.values()].some((center) => center.target)) {
        sim.alpha(0.05).restart();
      }
      sim.stop();
      for (const n of nodes) {
        if (n._targetR != null) n.r = n._targetR;
        n.vx = 0;
        n.vy = 0;
      }
      applyPull();
      return;
    }

    for (const n of nodes) {
      if (n._targetR != null && n.r !== n._targetR) {
        n.r += (n._targetR - n.r) * 0.14;
        if (Math.abs(n.r - n._targetR) < 0.15) n.r = n._targetR;
      }
      const deg = n._degree || 1;
      const cap = deg > 12 ? 1.8 : deg > 6 ? 2.4 : 3.2;
      if (n.vx) n.vx = Math.max(-cap, Math.min(cap, n.vx));
      if (n.vy) n.vy = Math.max(-cap, Math.min(cap, n.vy));
    }

    sim.tick();
    applyPull();
  }

  function stop() {
    sim.stop();
  }

  return {
    sync,
    setGroups,
    setTuning,
    setMotion,
    getNode,
    resize,
    tick,
    stop,
    getNodes,
    getLinks,
    getClusterCenters,
    getAlpha,
  };
}

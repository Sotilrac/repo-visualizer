/**
 * Force-directed layout engine.
 *
 * What it simulates is a list of bodies, not a list of files: at one level
 * of detail a body is a file, at another it is the folder or the repo the
 * files were rolled up into. A body mid-transition is drawn part of the way
 * towards the repo it is falling into, which is the collapse animation, and
 * the same interpolation run backwards is the burst outward.
 */

import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
} from 'd3-force';

function layoutRadius(body, inbound) {
  const importBoost = Math.min(5, Math.sqrt(inbound) * 0.65);
  // A container is sized by how much it holds, a file by how big it is.
  if (body.kind !== 'file') return 10 + Math.min(38, Math.sqrt(body.files) * 4.2) + importBoost;
  return 6 + Math.min(22, Math.sqrt(Math.max(10, body.size)) * 1.35) + importBoost;
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

export function createLayout({ width, height }) {
  const nodes = [];
  const links = [];
  const nodeByPath = new Map();
  const clusterCenters = new Map();
  let syncCount = 0;
  let lastClusterKey = '';
  let lastVisibleCount = 0;
  let lastLinkCount = 0;

  const sim = forceSimulation(nodes)
    .force(
      'charge',
      forceManyBody()
        .strength((d) => {
          const deg = d._degree || 1;
          return -72 / Math.sqrt(deg);
        })
        .distanceMax(380),
    )
    .force(
      'link',
      forceLink(links)
        .id((d) => d.path)
        .distance((l) => {
          const ds = l.source._degree || 1;
          const dt = l.target._degree || 1;
          return 52 + 18 / Math.sqrt(ds + dt);
        })
        .strength((l) => {
          const ds = l.source._degree || 1;
          const dt = l.target._degree || 1;
          return 0.14 / Math.sqrt(ds * dt);
        }),
    )
    .force('center', forceCenter(width / 2, height / 2).strength(0.035))
    .force(
      'collide',
      forceCollide()
        .radius((d) => d.r + 1.5)
        .strength(0.72),
    )
    .force('x', forceX((d) => clusterCenters.get(d.dir)?.x ?? width / 2).strength(0.045))
    .force('y', forceY((d) => clusterCenters.get(d.dir)?.y ?? height / 2).strength(0.045))
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
    sim.force('center', forceCenter(w / 2, h / 2).strength(0.035));
    rebuildClusterCenters(true);
    sim.alpha(0.22).restart();
  }

  function rebuildClusterCenters(force = false) {
    const clusters = [...new Set(nodes.map((n) => n.dir))].sort();
    const key = clusters.join('\0');
    if (!force && key === lastClusterKey) return;
    lastClusterKey = key;

    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(width, height) * 0.32;
    clusterCenters.clear();
    clusters.forEach((c, i) => {
      const angle = (clusters.length > 0 ? i / clusters.length : 0) * Math.PI * 2 - Math.PI / 2;
      clusterCenters.set(c, {
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius,
        angle,
        radius,
      });
    });
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
      const targetR = layoutRadius(body, inbound.get(id) ?? 0);
      let node = nodeByPath.get(id);
      if (!node) {
        const center = clusterCenters.get(body.repo) || { x: width / 2, y: height / 2 };
        const jitter = 22 + Math.random() * 28;
        const a = Math.random() * Math.PI * 2;
        node = {
          path: id,
          dir: body.repo,
          x: center.x + Math.cos(a) * jitter,
          y: center.y + Math.sin(a) * jitter,
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
      if (!seen.has(id)) nodeByPath.delete(id);
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
    rebuildClusterCenters();
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
      if (!node.pull) continue;

      node._sx = node.x;
      node._sy = node.y;
      const into = (node.parent && nodeByPath.get(node.parent)) || clusterCenters.get(node.dir);
      if (!into) continue;
      node.x += (into.x - node.x) * node.pull;
      node.y += (into.y - node.y) * node.pull;
    }
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
    if (sim.alpha() < 0.0008) {
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

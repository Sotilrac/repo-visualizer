/**
 * Where each repo's bodies live on screen, and how much room they get.
 *
 * A repo is a blob of bubbles. Pulling every bubble at the same strength
 * towards one point piles them on top of each other, so instead each repo
 * gets a radius wide enough to hold what is in it, the pull only acts on
 * bubbles that have drifted outside it, and the repos are spread around a
 * ring big enough that two blobs do not overlap.
 */

/** What the knobs are worth when nobody has touched them. */
const PAD = 5;
const SLACK = 1.25;
const GAP = 1.35;

/**
 * How wide each repo's blob has to be to hold its bubbles without crushing
 * them, from the area they cover rather than their count: ten small folders
 * need less room than ten large ones.
 *
 * @param {Array<{ dir: string, r: number }>} nodes
 * @param {{ pad?: number, slack?: number }} [spacing]
 * @returns {Map<string, number>}
 */
export function clusterRadii(nodes, { pad = PAD, slack = SLACK } = {}) {
  /** @type {Map<string, { area: number, largest: number }>} */
  const totals = new Map();

  for (const node of nodes) {
    const entry = totals.get(node.dir) ?? { area: 0, largest: 0 };
    const r = (node.r ?? 6) + pad;
    entry.area += r * r;
    entry.largest = Math.max(entry.largest, r);
    totals.set(node.dir, entry);
  }

  const radii = new Map();
  for (const [dir, { area, largest }] of totals) {
    radii.set(dir, Math.max(largest, Math.sqrt(area) * slack));
  }
  return radii;
}

/** The golden angle, which is what keeps a spiral from growing arms. */
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

/**
 * Lay blobs out over a disc, each placed where the area already covered
 * runs out, turning by the golden angle between one and the next.
 *
 * @param {Array<[string, number]>} entries name and radius, in order
 * @param {{ x: number, y: number, gap: number, centerFirst?: boolean }} around
 *   `centerFirst` holds the first entry in the middle and rings the rest
 *   around it, which is how a repo sits among the ones it pulls in.
 */
function spiral(entries, { x, y, gap, centerFirst = false }) {
  /** @type {Array<{ name: string, x: number, y: number, angle: number, ring: number }>} */
  const placed = [];
  if (entries.length === 1) {
    return [{ name: entries[0][0], x, y, angle: -Math.PI / 2, ring: 0 }];
  }

  let covered = 0;
  entries.forEach(([name, radius], i) => {
    const area = Math.PI * (radius * gap) ** 2;
    // The first entry can be held in the middle, with the rest ringed
    // around it: that is a repo sitting among the ones it pulls in.
    const ring = centerFirst && i === 0 ? 0 : Math.sqrt((covered + area / 2) / Math.PI);
    covered += area;
    const angle = i * GOLDEN - Math.PI / 2;
    placed.push({
      name,
      x: x + Math.cos(angle) * ring,
      y: y + Math.sin(angle) * ring,
      angle,
      ring,
    });
  });
  return placed;
}

/**
 * Where each repo's blob goes.
 *
 * A single ring leaves the middle of the screen empty and pushes sixty
 * repos so far apart that nothing is legible at a zoom that fits them, so
 * the blobs fill a disc instead.
 *
 * Repos that belong together, a repo and the ones it pulls in as
 * submodules, are laid out as one blob of blobs: the group takes a slot on
 * the disc, and its members take slots inside that. Spreading them by the
 * golden angle is what makes the disc even, and it is also what would
 * scatter a stack of repos to opposite sides, since the turn between one
 * slot and the next is most of a circle.
 *
 * Repos keep the order they are given, which is the order they first
 * appeared. Reordering them as they grow moves every blob at once, and the
 * bodies spend the rest of the run chasing a home that has moved again.
 *
 * @param {Map<string, number>} radii
 * @param {{
 *   width: number,
 *   height: number,
 *   gap?: number,
 *   order?: string[],
 *   groups?: string[][],
 * }} viewport
 * @returns {Map<string, { x: number, y: number, angle: number, radius: number, ring: number }>}
 */
export function placeClusters(radii, { width, height, gap = GAP, order, groups }) {
  /** @type {Map<string, any>} */
  const centers = new Map();
  const cx = width / 2;
  const cy = height / 2;

  const listed = order
    ? order.filter((dir) => radii.has(dir))
    : [...radii.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  if (listed.length === 0) return centers;

  const known = new Set(listed);
  const stacks = (groups ?? listed.map((dir) => [dir]))
    .map((members) => members.filter((dir) => known.has(dir)))
    .filter((members) => members.length > 0);

  /** A group is as wide as the blobs in it, packed together. */
  const groupRadius = (members) =>
    Math.sqrt(members.reduce((sum, dir) => sum + (radii.get(dir) ?? 0) ** 2, 0));

  const slots = spiral(
    stacks.map((members) => [members[0], groupRadius(members)]),
    { x: cx, y: cy, gap },
  );

  slots.forEach((slot, i) => {
    const members = stacks[i];
    const inside = spiral(
      members.map((dir) => [dir, radii.get(dir) ?? 0]),
      { x: slot.x, y: slot.y, gap, centerFirst: true },
    );
    for (const place of inside) {
      centers.set(place.name, {
        x: place.x,
        y: place.y,
        angle: place.angle,
        radius: radii.get(place.name) ?? 0,
        ring: slot.ring,
      });
    }
  });

  return centers;
}

/**
 * Hold each bubble inside its repo's blob, and leave it alone while it is
 * already there. A spring that pulls from the first pixel is what collapses
 * a repo into a single point.
 *
 * @param {{
 *   centers: () => Map<string, { x: number, y: number, radius: number }>,
 *   strength?: number | (() => number),
 * }} options
 */
export function forceContain({ centers, strength = 0.35 }) {
  /** @type {any[]} */
  let nodes = [];

  /** @param {number} alpha */
  function force(alpha) {
    const byDir = centers();
    const pull = typeof strength === 'function' ? strength() : strength;
    for (const node of nodes) {
      const home = byDir.get(node.dir);
      if (!home) continue;

      const dx = home.x - node.x;
      const dy = home.y - node.y;
      const distance = Math.hypot(dx, dy);
      // Room for this bubble inside the blob, not for its centre: a big
      // bubble is held further in so it does not hang over the edge.
      const slack = Math.max(0, home.radius - (node.r ?? 0));
      if (distance <= slack || distance < 1e-6) continue;

      const step = ((distance - slack) / distance) * alpha * pull;
      node.vx += dx * step;
      node.vy += dy * step;
    }
  }

  force.initialize = (/** @type {any[]} */ next) => {
    nodes = next;
  };

  return force;
}

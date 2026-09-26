/**
 * Where each repo's bodies live on screen, and how much room they get.
 *
 * A repo is a blob of bubbles. Pulling every bubble at the same strength
 * towards one point piles them on top of each other, so instead each repo
 * gets a radius wide enough to hold what is in it, the pull only acts on
 * bubbles that have drifted outside it, and the repos are spread around a
 * ring big enough that two blobs do not overlap.
 */

/** Clear space kept around each bubble inside its blob. */
const PAD = 8;

/** How much wider than the bubbles themselves a blob sits. */
const SLACK = 1.25;

/** Space between neighbouring blobs, as a share of their size. */
const GAP = 1.35;

/**
 * How wide each repo's blob has to be to hold its bubbles without crushing
 * them, from the area they cover rather than their count: ten small folders
 * need less room than ten large ones.
 *
 * @param {Array<{ dir: string, r: number }>} nodes
 * @returns {Map<string, number>}
 */
export function clusterRadii(nodes) {
  /** @type {Map<string, { area: number, largest: number }>} */
  const totals = new Map();

  for (const node of nodes) {
    const entry = totals.get(node.dir) ?? { area: 0, largest: 0 };
    const r = (node.r ?? 6) + PAD;
    entry.area += r * r;
    entry.largest = Math.max(entry.largest, r);
    totals.set(node.dir, entry);
  }

  const radii = new Map();
  for (const [dir, { area, largest }] of totals) {
    radii.set(dir, Math.max(largest, Math.sqrt(area) * SLACK));
  }
  return radii;
}

/**
 * Lay the blobs out over a disc, biggest first, each one placed where the
 * area already covered runs out.
 *
 * A single ring leaves the middle of the screen empty and pushes sixty
 * repos so far apart that nothing is legible at a zoom that fits them. The
 * golden angle between successive blobs is what keeps a spiral from growing
 * arms, and placing each at the radius that matches the area already used
 * keeps the density even from the middle out.
 *
 * @param {Map<string, number>} radii
 * @param {{ width: number, height: number }} viewport
 * @returns {Map<string, { x: number, y: number, angle: number, radius: number, ring: number }>}
 */
export function placeClusters(radii, { width, height }) {
  /** @type {Map<string, any>} */
  const centers = new Map();
  const cx = width / 2;
  const cy = height / 2;
  // Biggest first, so the repo with the most in it holds the middle, with
  // the name breaking ties to keep the layout the same between runs.
  const entries = [...radii.entries()].sort(
    ([nameA, a], [nameB, b]) => b - a || (nameA < nameB ? -1 : nameA > nameB ? 1 : 0),
  );
  if (entries.length === 0) return centers;

  if (entries.length === 1) {
    const [dir, radius] = entries[0];
    centers.set(dir, { x: cx, y: cy, angle: -Math.PI / 2, radius, ring: 0 });
    return centers;
  }

  const GOLDEN = Math.PI * (3 - Math.sqrt(5));
  let covered = 0;

  entries.forEach(([dir, radius], i) => {
    const area = Math.PI * (radius * GAP) ** 2;
    const ring = Math.sqrt((covered + area / 2) / Math.PI);
    covered += area;
    const angle = i * GOLDEN - Math.PI / 2;
    centers.set(dir, {
      x: cx + Math.cos(angle) * ring,
      y: cy + Math.sin(angle) * ring,
      angle,
      radius,
      ring,
    });
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
 *   strength?: number,
 * }} options
 */
export function forceContain({ centers, strength = 0.35 }) {
  /** @type {any[]} */
  let nodes = [];

  /** @param {number} alpha */
  function force(alpha) {
    const byDir = centers();
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

      const pull = ((distance - slack) / distance) * alpha * strength;
      node.vx += dx * pull;
      node.vy += dy * pull;
    }
  }

  force.initialize = (/** @type {any[]} */ next) => {
    nodes = next;
  };

  return force;
}

/**
 * Lift import edges from files to whatever is actually drawn.
 *
 * An edge recorded between two files still means something when those files
 * are inside collapsed repos: it becomes an edge between the repos. Several
 * file edges usually collapse onto the same pair, so their weights add up,
 * and an edge with both ends inside one body says nothing and goes.
 */

/** Past this a pair is already as strong as the layout should let it be. */
const MAX_WEIGHT = 20;

/**
 * @param {Iterable<{ from: string, to: string, weight?: number }>} edges
 * @param {(path: string) => string | null} bodyFor the drawn body standing in
 *   for a path, or null when nothing is drawn for it
 */
export function aggregateEdges(edges, bodyFor) {
  /** @type {Map<string, { source: string, target: string, weight: number }>} */
  const merged = new Map();

  for (const edge of edges) {
    const source = bodyFor(edge.from);
    const target = bodyFor(edge.to);
    if (!source || !target || source === target) continue;

    const key = `${source}\u0000${target}`;
    const seen = merged.get(key);
    if (seen) seen.weight = Math.min(MAX_WEIGHT, seen.weight + (edge.weight ?? 1));
    else merged.set(key, { source, target, weight: Math.min(MAX_WEIGHT, edge.weight ?? 1) });
  }

  return [...merged.values()];
}

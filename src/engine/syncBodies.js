/**
 * Hand the layout what to simulate at this point on the timeline.
 *
 * Both the canvas visualizers and the WebGL one drive their own layout, and
 * both need the same three steps: work out the level each repo is at, roll
 * the live files up into bodies at that level, and lift the import edges to
 * whatever is drawn.
 */

import { aggregateEdges } from './aggregateEdges.js';
import { bodyIndex, levelsFor, simulatedLevels } from './bodies.js';
import { isClusterExcluded, isPathExcluded } from './excludes.js';
import { isEdgeVisible } from './visibility.js';

/**
 * @param {{ sync: Function }} layout
 * @param {any} state
 * @param {number} commitIndex
 * @param {{
 *   repos?: Array<{ name: string, lod?: number, project?: string }>,
 *   folderDepth?: number,
 *   projects?: Record<string, string>,
 *   clock: Map<string, { at: number[], on: number[] }>,
 *   transitions: any,
 *   excludePatterns?: string[],
 *   at?: number,
 * }} options
 * @returns {{ targets: Record<string, number>, levels: Record<string, number>,
 *   idFor: (path: string) => string | null }}
 */
export function syncBodies(layout, state, commitIndex, options) {
  const {
    repos = [],
    folderDepth = 2,
    projects = {},
    clock,
    transitions,
    excludePatterns = [],
    at = 0,
  } = options;

  const now = state.lastCommit ? new Date(state.lastCommit.date).getTime() : 0;
  const targets = levelsFor(repos, { clock, commitIndex, now });
  transitions.update(targets, at);
  const levels = simulatedLevels(targets, transitions);

  const index = bodyIndex(state, commitIndex, { levels, folderDepth, projects });
  const bodies = index.bodies.filter(
    (body) =>
      !isClusterExcluded(body.repo, excludePatterns) && !isPathExcluded(body.id, excludePatterns),
  );

  const edges = [];
  for (const [, edge] of state.edges) {
    if (!isEdgeVisible(edge, commitIndex)) continue;
    if (isPathExcluded(edge.from, excludePatterns)) continue;
    if (isPathExcluded(edge.to, excludePatterns)) continue;
    edges.push(edge);
  }

  layout.sync(bodies, aggregateEdges(edges, index.idFor), {
    forceRestart: commitIndex === 0,
  });

  return { targets, levels, idFor: index.idFor };
}

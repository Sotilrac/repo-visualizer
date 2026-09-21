/**
 * Exclude helpers for the web app, over the shared pattern matcher.
 */

import { matchesExcludePattern } from '../shared/matchExclude.js';
import { isNodeVisible } from './visibility.js';

export { matchesExcludePattern };

/** Repo-relative file path excluded from the graph. */
export function isPathExcluded(filePath, patterns) {
  return matchesExcludePattern(filePath, patterns);
}

/** Feature cluster / top-level folder excluded (e.g. docs, public). */
export function isClusterExcluded(cluster, patterns) {
  if (!cluster || cluster === '~root' || !patterns?.length) return false;
  return isPathExcluded(cluster, patterns) || isPathExcluded(`${cluster}/.`, patterns);
}

export function resolveExcludePatterns(dataset, configExclude = []) {
  if (dataset?.exclude?.length) return dataset.exclude;
  if (configExclude.length) return configExclude;
  return [];
}

/** Legend + labels: cluster has at least one visible, non-excluded node. */
export function isClusterActive(state, cluster, commitIndex, excludePatterns) {
  if (!cluster || isClusterExcluded(cluster, excludePatterns)) return false;
  for (const node of state.nodes.values()) {
    if (node.dir !== cluster) continue;
    if (isNodeVisible(node, commitIndex)) return true;
  }
  return false;
}

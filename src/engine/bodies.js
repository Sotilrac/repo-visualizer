/**
 * What the simulation draws, rolled up from the files.
 *
 * The graph state knows every file. Only one level per repo is drawn, the
 * level that repo is currently at, so each live file is folded into whatever
 * stands in for it: its own bubble at level three, its folder at level two,
 * its repo at level one. A body carries the totals of everything folded into
 * it, which is what sizes it on screen.
 *
 * Rolling up from the files each time, rather than keeping a tree in step
 * with the timeline, costs one pass over the live files and is right at any
 * playhead position, including after a seek backwards.
 */

import { visibleEntity } from './hierarchy.js';
import { effectiveLod } from './lodDecay.js';
import { touchedAt } from './repoClock.js';
import { isNodeVisible } from './visibility.js';

/**
 * The level each repo should be at, after time has worn it down.
 *
 * @param {Array<{ name: string, lod?: number }>} repos
 * @param {{
 *   clock: Map<string, { at: number[], on: number[] }>,
 *   commitIndex: number,
 *   now: number,
 *   quietPeriod?: number,
 * }} at
 * @returns {Record<string, number>}
 */
export function levelsFor(repos, { clock, commitIndex, now, quietPeriod }) {
  /** @type {Record<string, number>} */
  const levels = {};
  for (const repo of repos) {
    levels[repo.name] = effectiveLod(repo.lod ?? 1, {
      now,
      lastTouchedAt: touchedAt(clock, repo.name, commitIndex),
      ...(quietPeriod ? { quietPeriod } : {}),
    });
  }
  return levels;
}

/**
 * The levels to actually simulate, which lag the target mid-transition: a
 * collapsing repo keeps its children until they have fallen in.
 *
 * @param {Record<string, number>} targets
 * @param {{ stateFor: (repo: string) => { level?: number } | null }} transitions
 */
export function simulatedLevels(targets, transitions) {
  /** @type {Record<string, number>} */
  const levels = {};
  for (const [repo, target] of Object.entries(targets)) {
    levels[repo] = transitions.stateFor(repo)?.level ?? target;
  }
  return levels;
}

/**
 * A level map as a string, for telling one frame's levels from the last.
 *
 * @param {Record<string, number>} levels
 */
export function levelKey(levels) {
  let key = '';
  for (const repo of Object.keys(levels).sort()) key += `${repo}:${levels[repo]},`;
  return key;
}

/**
 * Which project each repo belongs to, for the repos that are in one.
 *
 * @param {{ repos?: Array<{ name: string, project?: string }> } | null} dataset
 * @returns {Record<string, string>}
 */
export function projectsOf(dataset) {
  /** @type {Record<string, string>} */
  const byRepo = {};
  for (const repo of dataset?.repos ?? []) if (repo.project) byRepo[repo.name] = repo.project;
  return byRepo;
}

/**
 * The repo that pulls each submodule in, for the repos that are one.
 *
 * @param {{ repos?: Array<{ name: string, submodules?: string[] }> } | null} dataset
 * @returns {Map<string, string>} submodule name to the repo that carries it
 */
export function submoduleParents(dataset) {
  /** @type {Map<string, string>} */
  const parents = new Map();
  for (const repo of dataset?.repos ?? []) {
    for (const child of repo.submodules ?? []) {
      // The first parent wins, so a submodule shared by two repos sits with
      // one of them rather than flitting between the two.
      if (child !== repo.name && !parents.has(child)) parents.set(child, repo.name);
    }
  }
  return parents;
}

/**
 * @param {{ nodes: Map<string, any> }} state
 * @param {number} commitIndex
 * @param {{
 *   levels?: Record<string, number>,
 *   folderDepth?: number,
 *   projects?: Record<string, string>,
 * }} [options]
 * @returns {{ bodies: any[], idFor: (path: string) => string | null }}
 */
export function bodyIndex(state, commitIndex, options = {}) {
  const { levels = {}, folderDepth = 2, projects = {} } = options;

  const settingsFor = (repo) => ({
    lod: levels[repo] ?? 1,
    folderDepth,
    ...(projects[repo] ? { project: projects[repo] } : {}),
  });

  /** @type {Map<string, any>} */
  const bodies = new Map();

  for (const [path, node] of state.nodes) {
    if (!isNodeVisible(node, commitIndex)) continue;

    const repo = node.dir;
    const id = visibleEntity(path, settingsFor(repo));
    if (!id) continue;

    let body = bodies.get(id);
    if (!body) {
      const project = projects[repo];
      const repoId = project ? `~${project}/${repo}` : repo;
      const fileId = project ? `~${project}/${path}` : path;
      body = {
        id,
        // Read off what the id turned out to be, rather than guessed from
        // its shape: a folder called `v1.2` is not a file.
        kind: id === fileId ? 'file' : id === repoId ? 'repo' : 'folder',
        repo,
        parent: id === repoId ? (project ? `~${project}` : null) : repoId,
        churn: 0,
        files: 0,
        commits: 0,
        size: 0,
        bornAt: node.bornAt,
        lastTouchedAt: node.lastTouchedAt,
      };
      bodies.set(id, body);
    }

    body.files += 1;
    body.churn += node.churn ?? 0;
    body.commits += node.commits ?? 0;
    body.size += node.size ?? 0;
    body.bornAt = Math.min(body.bornAt, node.bornAt);
    body.lastTouchedAt = Math.max(body.lastTouchedAt, node.lastTouchedAt);
  }

  return {
    bodies: [...bodies.values()],
    idFor(path) {
      const node = state.nodes.get(path);
      const repo = node ? node.dir : path.split('/')[0];
      return visibleEntity(path, settingsFor(repo));
    },
  };
}

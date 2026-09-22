/**
 * The bodies to simulate right now.
 *
 * The tree has every project, repo, folder and file in it. Only one level
 * per repo is drawn, the one that repo is set to, and this picks it. Each
 * body comes back with the rolled-up numbers a renderer needs to size it,
 * and the container it belongs to.
 *
 * During a transition the bodies are the ones being animated: a collapsing
 * repo keeps showing its children while they fall into it, and an expanding
 * one shows the new children on their way out. `pull` is how far they are
 * towards the parent, which is what the layout interpolates, and `alpha` is
 * how solid they are along the way.
 */

const KIND_DEPTH = { repo: 1, folder: 2, file: 3 };

/**
 * @param {{ entities: () => Iterable<any> }} tree
 * @param {{
 *   levels?: Record<string, number>,
 *   transitions?: Record<string, { phase: string, progress: number }>,
 * }} options
 */
export function frontierOf(tree, { levels = {}, transitions = {} } = {}) {
  /** @type {any[]} */
  const bodies = [];
  // Which repos have a live folder, worked out in one pass. Asking per
  // entity turns this into a scan of the tree for every node in it, which on
  // a real dataset took 2.5 seconds a frame.
  const foldered = reposWithLiveFolders(tree);

  for (const entity of tree.entities()) {
    if (entity.kind === 'project') continue;

    const repo = repoOf(entity.id);
    const level = levels[repo] ?? 1;
    if (level <= 0) continue;

    // A deleted file is gone, and a container whose files have all gone has
    // no reason to stay on screen.
    if (entity.kind === 'file' && entity.deleted) continue;
    if (entity.kind !== 'file' && entity.files <= 0) continue;

    if (KIND_DEPTH[entity.kind] !== depthDrawnAt(level, repo, foldered)) continue;

    const transition = transitions[repo];
    bodies.push({
      id: entity.id,
      kind: entity.kind,
      repo,
      parent: entity.parent,
      churn: entity.churn,
      files: entity.files,
      commits: entity.commits,
      bornAt: entity.bornAt,
      lastTouchedAt: entity.lastTouchedAt,
      ...motionOf(transition, repo),
    });
  }

  return bodies;
}

/** @param {string} id */
function repoOf(id) {
  const parts = id.split('/');
  // A project prefixes the repo, and takes no level of its own.
  return parts[0].startsWith('~') ? parts[1] : parts[0];
}

/**
 * The depth this entity would have to be at to be the one drawn.
 *
 * Level 2 means the deepest folder, which is not a fixed depth: a repo with
 * every file at its root has no folders, so its bubble is drawn instead.
 */
function depthDrawnAt(level, repo, foldered) {
  if (level >= 3) return KIND_DEPTH.file;
  if (level <= 1) return KIND_DEPTH.repo;

  // Level 2: a folder where the repo has one, otherwise its bubble.
  return foldered.has(repo) ? KIND_DEPTH.folder : KIND_DEPTH.repo;
}

/** @returns {Set<string>} */
function reposWithLiveFolders(tree) {
  const repos = new Set();
  for (const entity of tree.entities()) {
    if (entity.kind === 'folder' && entity.files > 0) repos.add(repoOf(entity.id));
  }
  return repos;
}

/** How far towards its parent a body is, and how solid, mid-transition. */
function motionOf(transition, repo) {
  if (!transition || transition.phase === 'steady') return { alpha: 1, pull: 0, pullTo: null };

  const collapsing = transition.phase === 'collapsing';
  const pull = collapsing ? transition.progress : 1 - transition.progress;

  return {
    // Fading out on the way in, fading in on the way out.
    alpha: collapsing ? 1 - transition.progress : transition.progress,
    pull,
    pullTo: repo,
  };
}

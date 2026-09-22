/**
 * The tree behind the graph: projects, repos, folders and files.
 *
 * A file records its own churn and each container above it records the sum,
 * so a repo bubble can be sized without walking its contents every frame.
 * The sums are kept as commits are applied and undone as they are reverted,
 * because scrubbing backwards has to land on exactly the tree a forward
 * rebuild produces. Every field a revert changes is snapshotted first; the
 * round-trip tests compare the two.
 */

import { ancestorsOf, entityChain, entityKind } from './hierarchy.js';

/**
 * @param {{
 *   folderDepth?: number,
 *   projectFor?: (repo: string) => string | undefined,
 * }} [settings]
 */
export function createEntityTree({ folderDepth = 2, projectFor } = {}) {
  /** @type {Map<string, any>} */
  const entities = new Map();

  const repoOf = (path) => path.split('/')[0];

  const chainFor = (path) =>
    entityChain(path, { folderDepth, project: projectFor?.(repoOf(path)) });

  const ensure = (id, bornAt, created) => {
    let entity = entities.get(id);
    if (entity) return entity;

    entity = {
      id,
      kind: entityKind(id),
      parent: ancestorsOf(id).pop() ?? null,
      churn: 0,
      commits: 0,
      files: 0,
      bornAt,
      lastTouchedAt: bornAt,
      deleted: false,
    };
    entities.set(id, entity);
    created.push(id);
    return entity;
  };

  return {
    entities: () => entities.values(),
    get: (id) => entities.get(id),
    size: () => entities.size,

    /**
     * Apply one commit's changes.
     *
     * @param {Array<{ path: string, added?: number, removed?: number, status?: string }>} changes
     * @param {number} commitIdx
     * @returns {{ created: string[], before: Array<[string, any]> }} what to undo
     */
    apply(changes, commitIdx) {
      /** @type {string[]} */
      const created = [];
      /** @type {Array<[string, any]>} */
      const before = [];
      const snapshotted = new Set();
      // A commit counts once against a container, however many of its files
      // it touched.
      const counted = new Set();

      const snapshot = (entity) => {
        if (snapshotted.has(entity.id)) return;
        snapshotted.add(entity.id);
        before.push([
          entity.id,
          {
            churn: entity.churn,
            commits: entity.commits,
            files: entity.files,
            bornAt: entity.bornAt,
            lastTouchedAt: entity.lastTouchedAt,
            deleted: entity.deleted,
          },
        ]);
      };

      for (const change of changes) {
        const chain = chainFor(change.path);
        if (chain.length === 0) continue;

        const fileId = chain[chain.length - 1];
        const weight = (change.added ?? 0) + (change.removed ?? 0);
        const deleting = change.status === 'D';

        // Whether it existed has to be read before `ensure` makes one, or a
        // brand new file looks like one that was already alive, and the count
        // on every container above it never moves.
        const existed = entities.has(fileId);
        const file = ensure(fileId, commitIdx, created);
        snapshot(file);
        const wasLive = existed && !file.deleted;

        file.churn += weight;
        file.lastTouchedAt = commitIdx;
        file.deleted = deleting;
        file.commits += 1;
        file.files = deleting ? 0 : 1;

        // A file appearing or disappearing changes every container's count.
        const liveDelta = (deleting ? 0 : 1) - (wasLive ? 1 : 0);

        for (const id of chain.slice(0, -1)) {
          const container = ensure(id, commitIdx, created);
          snapshot(container);
          container.churn += weight;
          container.lastTouchedAt = commitIdx;
          container.files += liveDelta;
          if (!counted.has(id)) {
            counted.add(id);
            container.commits += 1;
          }
        }
      }

      return { created, before };
    },

    /** @param {{ created: string[], before: Array<[string, any]> }} undo */
    revert(undo) {
      for (const [id, fields] of undo.before) {
        const entity = entities.get(id);
        if (entity) Object.assign(entity, fields);
      }
      // Reverse order, so a container is removed after the files inside it.
      for (let i = undo.created.length - 1; i >= 0; i--) entities.delete(undo.created[i]);
    },
  };
}

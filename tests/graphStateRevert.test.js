/**
 * Scrubbing backwards has to land on exactly the graph a forward rebuild
 * produces. These are the cases where it did not.
 */

import { describe, expect, it } from 'vitest';
import {
  applyCommit,
  emptyState,
  rebuildToCommit,
  revertCommit,
} from '../src/engine/graphState.js';

function commit(sha, changes) {
  return { sha, shortSha: sha.slice(0, 7), date: '2024-01-01', author: 'T', message: sha, changes };
}

/**
 * @param {string} path
 * @param {{ added?: number, removed?: number, status?: string, imports?: string[] }} [opts]
 */
function change(path, { added = 10, removed = 0, status = 'M', imports } = {}) {
  const c = { path, added, removed, status };
  if (imports) c.resolvedImports = imports;
  return c;
}

/** Comparable snapshot of everything the renderer reads off a state. */
function digest(state) {
  return {
    nodes: [...state.nodes.entries()]
      .map(([p, n]) => [p, n.churn, n.commits, n.bornAt, n.lastTouchedAt, n.deleted, n.dir])
      .sort(),
    edges: [...state.edges.keys()].sort(),
    edgesByFrom: [...state.edgesByFrom.entries()].map(([k, v]) => [k, [...v].sort()]).sort(),
    clusters: [...state.clusters].sort(),
    cluster: [...state.cluster.entries()].sort(),
  };
}

describe('an edge that predates its target file', () => {
  // applyCommit records an edge to a target whether or not that target has a
  // node yet, so a.js can import b.js one commit before b.js is first touched.
  const commits = [
    commit('c0', [change('a.js', { imports: ['b.js'] })]),
    commit('c1', [change('b.js')]),
  ];

  it('survives reverting the commit that first touched the target', () => {
    const state = emptyState();
    applyCommit(state, commits[0], 0);
    applyCommit(state, commits[1], 1);
    revertCommit(state, commits[1], 1);

    expect([...state.edges.keys()]).toEqual(['a.js→b.js']);
  });

  it('leaves the state identical to a rebuild', () => {
    const state = emptyState();
    applyCommit(state, commits[0], 0);
    applyCommit(state, commits[1], 1);
    revertCommit(state, commits[1], 1);

    expect(digest(state)).toEqual(digest(rebuildToCommit(commits, 0)));
  });
});

describe('apply and revert round-trip', () => {
  /** Deterministic pseudo-random history, so a failure reproduces exactly. */
  function history(seed, length) {
    let s = seed;
    const rand = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 0x100000000;
    };
    const files = ['src/a.js', 'src/b.js', 'lib/c.js', 'lib/d.js', 'e.js'];
    const commits = [];
    for (let i = 0; i < length; i++) {
      const changes = [];
      for (const f of files) {
        if (rand() < 0.45) continue;
        changes.push(
          change(f, {
            added: Math.floor(rand() * 40),
            removed: Math.floor(rand() * 10),
            status: rand() < 0.12 ? 'D' : 'M',
            imports: rand() < 0.4 ? [files[Math.floor(rand() * files.length)]] : undefined,
          }),
        );
      }
      commits.push(commit(`c${i}`, changes));
    }
    return commits;
  }

  it.each([1, 7, 42, 1337, 20240101])(
    'reverting to any point matches a rebuild to that point (seed %i)',
    (seed) => {
      const commits = history(seed, 30);
      const state = emptyState();
      for (let i = 0; i < commits.length; i++) applyCommit(state, commits[i], i);

      for (let i = commits.length - 1; i >= 0; i--) {
        revertCommit(state, commits[i], i);
        expect(digest(state), `after reverting commit ${i}`).toEqual(
          digest(rebuildToCommit(commits, i - 1)),
        );
      }
    },
  );

  it('rebuilding to the last commit matches applying every commit', () => {
    const commits = history(9, 25);
    const state = emptyState();
    for (let i = 0; i < commits.length; i++) applyCommit(state, commits[i], i);

    expect(digest(rebuildToCommit(commits, commits.length - 1))).toEqual(digest(state));
  });

  it('rebuilding to a negative index gives an empty graph', () => {
    expect(digest(rebuildToCommit(history(3, 5), -1))).toEqual(digest(emptyState()));
  });
});

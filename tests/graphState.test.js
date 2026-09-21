import { describe, expect, it } from 'vitest';
import {
  applyCommit,
  collectAllClusters,
  emptyState,
  fileExt,
  getDepsForPath,
  revertCommit,
  topLevelDir,
} from '../src/engine/graphState.js';

function commit(sha, changes) {
  return { sha, shortSha: sha.slice(0, 7), date: '2024-01-01', author: 'T', message: sha, changes };
}

/**
 * @param {string} path
 * @param {{ added?: number, removed?: number, status?: string, imports?: string[] }} [opts]
 */
function change(path, { added = 10, removed = 0, status = 'M', imports } = {}) {
  // The analyzer resolves `imports` to `resolvedImports` before the app ever
  // sees a commit, so that is the field the graph reads.
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
    clusters: [...state.clusters].sort(),
    cluster: [...state.cluster.entries()].sort(),
  };
}

describe('path helpers', () => {
  it('names the top-level folder', () => {
    expect(topLevelDir('lib/deep/thing.js')).toBe('lib');
  });

  it('goes one level deeper inside src, where the top level says nothing', () => {
    expect(topLevelDir('src/engine/layout.js')).toBe('src/engine');
    expect(topLevelDir('tests/unit/a.js')).toBe('tests/unit');
  });

  it('stays at the top level for a file directly inside src', () => {
    expect(topLevelDir('src/App.jsx')).toBe('src');
  });

  it('gives a root-level file its own bucket', () => {
    expect(topLevelDir('README.md')).toBe('~root');
  });

  it('lowercases the extension', () => {
    expect(fileExt('a/B.JS')).toBe('.js');
  });

  it('returns an empty extension for a file that has none', () => {
    expect(fileExt('Makefile')).toBe('');
  });
});

describe('applyCommit', () => {
  it('creates a node on first touch and records when it was born', () => {
    const state = emptyState();
    applyCommit(state, commit('a', [change('src/a.js')]), 0);

    const node = state.nodes.get('src/a.js');
    expect(node.bornAt).toBe(0);
    expect(node.commits).toBe(1);
    expect(node.deleted).toBe(false);
  });

  it('accumulates churn across commits', () => {
    const state = emptyState();
    applyCommit(state, commit('a', [change('src/a.js', { added: 10 })]), 0);
    applyCommit(state, commit('b', [change('src/a.js', { added: 5, removed: 2 })]), 1);

    const node = state.nodes.get('src/a.js');
    expect(node.commits).toBe(2);
    expect(node.churn).toBe(17);
    expect(node.lastTouchedAt).toBe(1);
  });

  it('marks a node deleted without forgetting it', () => {
    const state = emptyState();
    applyCommit(state, commit('a', [change('src/a.js')]), 0);
    applyCommit(state, commit('b', [change('src/a.js', { status: 'D' })]), 1);

    expect(state.nodes.get('src/a.js').deleted).toBe(true);
  });

  it('records an import as a directed edge', () => {
    const state = emptyState();
    applyCommit(
      state,
      commit('a', [change('src/a.js', { imports: ['src/b.js'] }), change('src/b.js')]),
      0,
    );

    const { outbound } = getDepsForPath(state, 'src/a.js');
    expect(outbound.map((e) => e.to)).toEqual(['src/b.js']);
    expect(getDepsForPath(state, 'src/b.js').inbound.map((e) => e.from)).toEqual(['src/a.js']);
  });

  it('skips a path matching an exclude pattern', () => {
    const state = emptyState();
    applyCommit(state, commit('a', [change('vendor/x.js'), change('src/a.js')]), 0, ['vendor']);

    expect([...state.nodes.keys()]).toEqual(['src/a.js']);
  });
});

describe('revertCommit', () => {
  it('undoes a commit that created a node', () => {
    const state = emptyState();
    const before = digest(state);
    applyCommit(state, commit('a', [change('src/a.js')]), 0);
    revertCommit(state, commit('a', [change('src/a.js')]), 0);

    expect(digest(state)).toEqual(before);
  });

  it('restores the previous churn rather than zeroing it', () => {
    const state = emptyState();
    applyCommit(state, commit('a', [change('src/a.js', { added: 10 })]), 0);
    const afterFirst = digest(state);
    applyCommit(state, commit('b', [change('src/a.js', { added: 5 })]), 1);
    revertCommit(state, commit('b', [change('src/a.js', { added: 5 })]), 1);

    expect(digest(state)).toEqual(afterFirst);
  });

  it('brings a deleted node back', () => {
    const state = emptyState();
    applyCommit(state, commit('a', [change('src/a.js')]), 0);
    const alive = digest(state);
    applyCommit(state, commit('b', [change('src/a.js', { status: 'D' })]), 1);
    revertCommit(state, commit('b', [change('src/a.js', { status: 'D' })]), 1);

    expect(digest(state)).toEqual(alive);
  });

  it('is a no-op for a commit that was never applied', () => {
    const state = emptyState();
    applyCommit(state, commit('a', [change('src/a.js')]), 0);
    const before = digest(state);
    revertCommit(state, commit('z', [change('src/z.js')]), 99);

    expect(digest(state)).toEqual(before);
  });
});

describe('collectAllClusters', () => {
  it('lists every folder that appears anywhere in history', () => {
    const commits = [commit('a', [change('src/a.js')]), commit('b', [change('lib/b.js')])];
    expect([...collectAllClusters(commits)].sort()).toEqual(['lib', 'src']);
  });

  it('leaves out excluded folders', () => {
    const commits = [commit('a', [change('src/a.js')]), commit('b', [change('vendor/b.js')])];
    expect([...collectAllClusters(commits, ['vendor'])]).toEqual(['src']);
  });
});

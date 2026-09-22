import { describe, expect, it } from 'vitest';
import { applyCommit, emptyState } from '../src/engine/graphState.js';
import { createLodTransitions } from '../src/engine/lodTransitions.js';
import { buildRepoClock } from '../src/engine/repoClock.js';
import { syncBodies } from '../src/engine/syncBodies.js';

const commits = [
  {
    repo: 'battery',
    date: '2021-01-01T00:00:00Z',
    changes: [
      { path: 'battery/src/cell.c', added: 40, removed: 0, resolvedImports: ['battery/src/bms.h'] },
      { path: 'battery/src/bms.h', added: 10, removed: 0 },
      { path: 'battery/doc/notes.md', added: 5, removed: 0 },
    ],
  },
  {
    repo: 'core',
    date: '2021-01-02T00:00:00Z',
    changes: [
      { path: 'core/main.c', added: 20, removed: 0, resolvedImports: ['battery/src/bms.h'] },
    ],
  },
];

/** Records what the layout was handed. */
function fakeLayout() {
  const calls = [];
  return { calls, sync: (bodies, edges, options) => calls.push({ bodies, edges, options }) };
}

function run(repos, { commitIndex = 1, excludePatterns = [] } = {}) {
  const state = emptyState();
  commits.slice(0, commitIndex + 1).forEach((commit, i) => {
    applyCommit(state, commit, i);
  });
  const layout = fakeLayout();
  const result = syncBodies(layout, state, commitIndex, {
    repos,
    clock: buildRepoClock(commits),
    transitions: createLodTransitions(),
    excludePatterns,
    at: 0,
  });
  return { ...layout.calls.at(-1), result };
}

describe('syncBodies', () => {
  it('hands the layout one bubble per repo at level one', () => {
    const { bodies } = run([
      { name: 'battery', lod: 1 },
      { name: 'core', lod: 1 },
    ]);

    expect(bodies.map((b) => b.id).sort()).toEqual(['battery', 'core']);
  });

  it('opens a repo up to its folders without touching the other', () => {
    const { bodies } = run([
      { name: 'battery', lod: 2 },
      { name: 'core', lod: 1 },
    ]);

    expect(bodies.map((b) => b.id).sort()).toEqual(['battery/doc', 'battery/src', 'core']);
  });

  it('lifts an import between two repos to the bubbles that are drawn', () => {
    const { edges } = run([
      { name: 'battery', lod: 1 },
      { name: 'core', lod: 1 },
    ]);

    expect(edges).toEqual([{ source: 'core', target: 'battery', weight: 1 }]);
  });

  it('drops an import that no longer crosses anything', () => {
    const { edges } = run([
      { name: 'battery', lod: 1 },
      { name: 'core', lod: 0 },
    ]);

    // Both ends of the remaining import are inside the one battery bubble.
    expect(edges).toEqual([]);
  });

  it('leaves out an excluded repo', () => {
    const { bodies } = run(
      [
        { name: 'battery', lod: 1 },
        { name: 'core', lod: 1 },
      ],
      {
        excludePatterns: ['core'],
      },
    );

    expect(bodies.map((b) => b.id)).toEqual(['battery']);
  });

  it('restarts the layout on the first commit', () => {
    const { options } = run([{ name: 'battery', lod: 1 }], { commitIndex: 0 });

    expect(options.forceRestart).toBe(true);
  });

  it('reports the level each repo settled at', () => {
    const { result } = run([
      { name: 'battery', lod: 2 },
      { name: 'core', lod: 1 },
    ]);

    expect(result.levels).toEqual({ battery: 2, core: 1 });
  });

  it('reports how many bodies there are, which is what picks the renderer', () => {
    const { bodies, result } = run([
      { name: 'battery', lod: 2 },
      { name: 'core', lod: 1 },
    ]);

    expect(result.count).toBe(bodies.length);
  });

  it('tells the caller which body a file was rolled into', () => {
    const { result } = run([{ name: 'battery', lod: 2 }]);

    expect(result.idFor('battery/src/cell.c')).toBe('battery/src');
  });
});

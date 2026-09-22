import { describe, expect, it } from 'vitest';
import { applyCommit, emptyState, summarizeSubtree } from '../src/engine/graphState.js';

function stateAfter(commits) {
  const state = emptyState();
  commits.forEach((commit, i) => {
    applyCommit(state, commit, i);
  });
  return state;
}

const state = stateAfter([
  {
    changes: [
      { path: 'battery/src/cell.c', added: 40, removed: 0 },
      { path: 'battery/doc/notes.md', added: 5, removed: 0 },
    ],
  },
  { changes: [{ path: 'battery/src/cell.c', added: 3, removed: 1 }] },
  { changes: [{ path: 'core/main.c', added: 9, removed: 0 }] },
]);

describe('summarizeSubtree', () => {
  it('counts the files under a repo', () => {
    expect(summarizeSubtree(state, 'battery').files).toBe(2);
  });

  it('counts only the files under a folder', () => {
    expect(summarizeSubtree(state, 'battery/src').files).toBe(1);
  });

  it('adds up the commits that touched them', () => {
    expect(summarizeSubtree(state, 'battery').commits).toBe(3);
  });

  it('adds up their churn', () => {
    expect(summarizeSubtree(state, 'battery').churn).toBe(49);
  });

  it('lists the commits to scrub to, in order', () => {
    expect(summarizeSubtree(state, 'battery').touches).toEqual([0, 1]);
  });

  it('reads through a project prefix', () => {
    expect(summarizeSubtree(state, '~power/battery').files).toBe(2);
  });

  it('names the repo the container is in', () => {
    expect(summarizeSubtree(state, 'battery/src').dir).toBe('battery');
  });

  it('does not count a neighbouring folder with a shared prefix', () => {
    const shared = stateAfter([
      { changes: [{ path: 'core/src/a.c', added: 1, removed: 0 }] },
      { changes: [{ path: 'core/srcs/b.c', added: 1, removed: 0 }] },
    ]);

    expect(summarizeSubtree(shared, 'core/src').files).toBe(1);
  });

  it('leaves out a deleted file', () => {
    const gone = stateAfter([
      { changes: [{ path: 'core/a.c', added: 1, removed: 0 }] },
      { changes: [{ path: 'core/a.c', added: 0, removed: 1, status: 'D' }] },
    ]);

    expect(summarizeSubtree(gone, 'core').files).toBe(0);
  });
});

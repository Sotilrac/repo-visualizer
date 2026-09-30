import { describe, expect, it } from 'vitest';
import { createActors, massOf } from '../src/engine/actors.js';

const bubble = (path, x, y, r = 10, extra = {}) => ({
  path,
  x,
  y,
  r,
  vx: 0,
  vy: 0,
  kind: 'file',
  ...extra,
});

const commit = (author, paths) => ({
  author,
  authorEmail: `${author.toLowerCase()}@acme.com`,
  changes: paths.map((path) => ({ path, added: 10, removed: 0 })),
});

/**
 * One person pressed against one bubble, for a single step, with nothing
 * else pulling on them: what moves is the contact and only the contact.
 */
function leanOn(target, options = {}) {
  const actors = createActors({ idleMs: 60000, ...options });
  actors.setBodies([target]);
  actors.onCommit(commit('Ada', [target.path]), { [target.path]: target }, 0);
  const [ada] = actors.list();
  ada.aims.clear();
  ada.x = target.x + 2;
  ada.y = target.y;
  ada.vx = 0;
  ada.vy = 0;
  actors.tick(1000 / 60);
  return { actors, ada: actors.list()[0] };
}

describe('how heavy a bubble is', () => {
  it('weighs a folder more than a file the same size', () => {
    expect(massOf({ r: 20, kind: 'folder' })).toBeGreaterThan(massOf({ r: 20, kind: 'file' }));
  });

  it('weighs a big bubble more than a small one', () => {
    expect(massOf({ r: 40, kind: 'file' })).toBeGreaterThan(massOf({ r: 8, kind: 'file' }));
  });

  it('never makes one lighter than a person', () => {
    expect(massOf({ r: 1, kind: 'file' })).toBeGreaterThanOrEqual(1);
  });

  it('caps the heaviest, so even a repo can be shifted', () => {
    expect(massOf({ r: 64, kind: 'repo' })).toBe(massOf({ r: 400, kind: 'repo' }));
  });
});

describe('leaning on a bubble', () => {
  it('moves it out of the way', () => {
    const target = bubble('a.js', 0, 0);
    leanOn(target);

    // The person stood to the right of it, so it is pushed left.
    expect(target.vx).toBeLessThan(0);
  });

  it('moves the person more than the bubble', () => {
    // A folder, which is the sort of thing someone actually walks into.
    const target = bubble('src', 0, 0, 20, { kind: 'folder' });
    const { ada } = leanOn(target);

    expect(Math.abs(ada.vx)).toBeGreaterThan(Math.abs(target.vx) * 4);
  });

  it('gives the bubble the same push divided by its weight', () => {
    const target = bubble('src', 0, 0, 20, { kind: 'folder' });
    const { ada } = leanOn(target);

    // The person keeps what damping leaves of the impulse; the bubble takes
    // the same impulse over its mass. Equal and opposite, as contact is.
    const impulse = Math.abs(target.vx) * massOf(target);
    expect(Math.abs(ada.vx)).toBeCloseTo(impulse * (1 - 0.45), 5);
  });

  it('shifts a file further than a repo', () => {
    const file = bubble('a.js', 0, 0, 10, { kind: 'file' });
    const repo = bubble('r', 0, 0, 10, { kind: 'repo' });
    leanOn(file);
    leanOn(repo);

    expect(Math.abs(file.vx)).toBeGreaterThan(Math.abs(repo.vx));
  });

  it('leaves a bubble that is being carried somewhere alone', () => {
    // Mid-collapse: the level of detail is taking it into its repo, and a
    // shove would fight that.
    const moving = bubble('a.js', 0, 0, 10, { pull: 0.5 });
    leanOn(moving);

    expect(moving.vx).toBe(0);
  });

  it('wakes the graph, which would otherwise never step the bubble', () => {
    let woken = 0;
    const target = bubble('a.js', 0, 0);
    leanOn(target, { wake: () => woken++ });

    expect(woken).toBeGreaterThan(0);
  });

  it('leaves the graph asleep when nobody is near anything', () => {
    let woken = 0;
    const far = bubble('a.js', 0, 0);
    const actors = createActors({ idleMs: 60000, wake: () => woken++ });
    actors.setBodies([far]);
    actors.onCommit(commit('Ada', ['a.js']), { 'a.js': far }, 0);
    const [ada] = actors.list();
    ada.x = 4000;
    ada.y = 4000;
    actors.tick(1000 / 60);

    expect(woken).toBe(0);
  });
});

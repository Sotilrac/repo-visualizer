import { describe, expect, it } from 'vitest';
import { AVATAR_FOOTPRINT, createActors } from '../src/engine/actors.js';

const bubble = (path, x, y, r = 10) => ({ path, x, y, r });

const commit = (author, paths) => ({
  author,
  authorEmail: `${author.toLowerCase()}@acme.com`,
  changes: paths.map((path) => ({ path, added: 10, removed: 0 })),
});

/**
 * Run the simulation, checking `invariant` after every step rather than
 * only at the end: a face that passes through a bubble and comes out the
 * other side looks fine once it has stopped.
 */
function run(actors, steps, invariant = () => {}) {
  for (let i = 0; i < steps; i++) {
    actors.tick(1000 / 60);
    actors.interpolate(1);
    invariant();
  }
}

const gap = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const drawnGap = (a, b) => Math.hypot(a.sx - b.sx, a.sy - b.sy);

describe('keeping off the bubbles', () => {
  it('never crosses the centre of the bubble it is firing at', () => {
    const target = bubble('a.js', 0, 0, 40);
    const actors = createActors();
    actors.setBodies([target]);
    actors.onCommit(commit('Ada', ['a.js']), { 'a.js': target }, 0);

    run(actors, 600, () => {
      const [ada] = actors.list();
      expect(gap(ada, target)).toBeGreaterThanOrEqual(AVATAR_FOOTPRINT + target.r);
    });
  });

  it('never crosses a bubble standing between it and its work', () => {
    const wall = bubble('wall', 0, 0, 60);
    const target = bubble('a.js', -300, 0, 8);
    const actors = createActors();
    actors.setBodies([wall, target]);
    const ada = { ...commit('Ada', ['a.js']) };
    actors.onCommit(ada, { 'a.js': target }, 0);
    const [person] = actors.list();
    person.x = 300;
    person.y = 0;

    run(actors, 600, () => {
      const [p] = actors.list();
      expect(gap(p, wall)).toBeGreaterThanOrEqual(AVATAR_FOOTPRINT + wall.r);
    });
  });

  it('holds the drawn position clear of the bubbles too', () => {
    const target = bubble('a.js', 0, 0, 40);
    const actors = createActors();
    actors.setBodies([target]);
    actors.onCommit(commit('Ada', ['a.js']), { 'a.js': target }, 0);

    for (let i = 0; i < 400; i++) {
      actors.tick(1000 / 60);
      // Part way between two steps, which is what is actually drawn.
      actors.interpolate(0.5);
      const [ada] = actors.list();
      expect(Math.hypot(ada.sx - target.x, ada.sy - target.y)).toBeGreaterThanOrEqual(
        AVATAR_FOOTPRINT + target.r,
      );
    }
  });

  it('still gets close to the work it is firing at', () => {
    const target = bubble('a.js', 0, 0, 20);
    const actors = createActors();
    actors.setBodies([target]);
    actors.onCommit(commit('Ada', ['a.js']), { 'a.js': target }, 0);

    run(actors, 600);
    const [ada] = actors.list();
    expect(gap(ada, target)).toBeLessThan(260);
  });
});

describe('never touching each other', () => {
  const team = ['Ada', 'Bo', 'Cy', 'Di', 'Eve', 'Fox', 'Gil', 'Hal'];

  it('holds a crowd apart on every step, not only once it settles', () => {
    const target = bubble('a.js', 0, 0, 12);
    const actors = createActors();
    actors.setBodies([target]);
    for (const name of team) actors.onCommit(commit(name, ['a.js']), { 'a.js': target }, 0);

    const min = actors.minSeparation;
    run(actors, 400, () => {
      const people = actors.list();
      for (let i = 0; i < people.length; i++) {
        for (let j = i + 1; j < people.length; j++) {
          expect(gap(people[i], people[j])).toBeGreaterThanOrEqual(min - 0.01);
          expect(drawnGap(people[i], people[j])).toBeGreaterThanOrEqual(min - 0.01);
        }
      }
    });
  });
});

describe('what they are drawn to', () => {
  it('closes on its work faster while the beam is still flying', () => {
    const target = bubble('a.js', 0, 0, 10);
    const nodes = { 'a.js': target };

    const measure = (settleSteps) => {
      const actors = createActors();
      actors.setBodies([target]);
      actors.onCommit(commit('Ada', ['a.js']), nodes, 0);
      run(actors, settleSteps);
      const [ada] = actors.list();
      // Put them back where they started, at rest, and watch them set off.
      ada.x = 400;
      ada.y = 0;
      ada.vx = 0;
      ada.vy = 0;
      run(actors, 20);
      return 400 - gap(actors.list()[0], target);
    };

    // Straight after the commit the beam is still in flight; 120 steps
    // later it landed long ago and the pull is the ordinary one.
    expect(measure(1)).toBeGreaterThan(measure(120) * 1.5);
  });
});

describe('coming to rest', () => {
  it('stops rather than circling its work forever', () => {
    const target = bubble('a.js', 0, 0, 20);
    const actors = createActors();
    actors.setBodies([target]);
    actors.onCommit(commit('Ada', ['a.js']), { 'a.js': target }, 0);

    run(actors, 500);
    const [ada] = actors.list();
    const before = { x: ada.x, y: ada.y };
    run(actors, 60);

    expect(gap(actors.list()[0], before)).toBeLessThan(1);
  });
});

describe('the same motion at any frame rate', () => {
  it('lands in the same place whether sampled at 60 or 144 frames a second', () => {
    const place = (dt, frames) => {
      const target = bubble('a.js', 0, 0, 20);
      const actors = createActors();
      actors.setBodies([target]);
      actors.onCommit(commit('Ada', ['a.js']), { 'a.js': target }, 0);
      for (let i = 0; i < frames; i++) actors.tick(dt, 1);
      const [ada] = actors.list();
      return ada;
    };

    // The same number of steps is the same simulation, whatever wall clock
    // time the frames claim to have taken.
    const slow = place(1000 / 60, 300);
    const fast = place(1000 / 144, 300);
    expect(gap(slow, fast)).toBeLessThan(0.001);
  });
});

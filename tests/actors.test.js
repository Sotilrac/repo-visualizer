import { describe, expect, it } from 'vitest';
import { createActors } from '../src/engine/actors.js';

const node = (path, x, y) => ({ path, x, y });

/** A commit as the timeline hands it over, plus where its files sit. */
const commit = (author, email, paths) => ({
  author,
  authorEmail: email,
  changes: paths.map((path) => ({ path, added: 10, removed: 0 })),
});

describe('spawning', () => {
  it('creates one actor per author', () => {
    const actors = createActors();
    actors.onCommit(commit('Ada', 'ada@acme.com', ['a.js']), { 'a.js': node('a.js', 10, 10) }, 0);

    expect(actors.list()).toHaveLength(1);
    expect(actors.list()[0].name).toBe('Ada');
  });

  it('reuses the actor when the same person commits again', () => {
    const actors = createActors();
    const nodes = { 'a.js': node('a.js', 10, 10) };
    actors.onCommit(commit('Ada', 'ada@acme.com', ['a.js']), nodes, 0);
    actors.onCommit(commit('Ada', 'ada@acme.com', ['a.js']), nodes, 100);

    expect(actors.list()).toHaveLength(1);
  });

  it('keys on the address, so a new spelling of a name is the same actor', () => {
    const actors = createActors();
    const nodes = { 'a.js': node('a.js', 10, 10) };
    actors.onCommit(commit('Ada', 'ada@acme.com', ['a.js']), nodes, 0);
    actors.onCommit(commit('ada lovelace', 'ada@acme.com', ['a.js']), nodes, 100);

    expect(actors.list()).toHaveLength(1);
  });

  it('keeps two authors apart', () => {
    const actors = createActors();
    const nodes = { 'a.js': node('a.js', 10, 10) };
    actors.onCommit(commit('Ada', 'ada@acme.com', ['a.js']), nodes, 0);
    actors.onCommit(commit('Bo', 'bo@acme.com', ['a.js']), nodes, 0);

    expect(actors.list()).toHaveLength(2);
  });

  it('ignores a commit whose files are not on screen', () => {
    const actors = createActors();
    actors.onCommit(commit('Ada', 'ada@acme.com', ['gone.js']), {}, 0);

    expect(actors.list()).toHaveLength(0);
  });
});

describe('beams', () => {
  it('fires one at each file the commit touched', () => {
    const actors = createActors();
    const nodes = { 'a.js': node('a.js', 0, 0), 'b.js': node('b.js', 50, 0) };
    actors.onCommit(commit('Ada', 'ada@acme.com', ['a.js', 'b.js']), nodes, 0);

    expect(actors.beams()).toHaveLength(2);
  });

  it('starts at nothing and reaches its target', () => {
    const actors = createActors({ beamMs: 1000 });
    actors.onCommit(commit('Ada', 'ada@acme.com', ['a.js']), { 'a.js': node('a.js', 0, 0) }, 0);

    expect(actors.beams()[0].progress).toBe(0);
    actors.tick(500);
    expect(actors.beams()[0].progress).toBeCloseTo(0.5, 2);
  });

  it('is gone once it has landed', () => {
    const actors = createActors({ beamMs: 1000 });
    actors.onCommit(commit('Ada', 'ada@acme.com', ['a.js']), { 'a.js': node('a.js', 0, 0) }, 0);

    actors.tick(1200);

    expect(actors.beams()).toHaveLength(0);
  });

  it('reports the files it landed on, so the ripple fires on arrival', () => {
    const actors = createActors({ beamMs: 1000 });
    actors.onCommit(commit('Ada', 'ada@acme.com', ['a.js']), { 'a.js': node('a.js', 0, 0) }, 0);

    expect(actors.tick(400)).toEqual([]);
    expect(actors.tick(700)).toEqual(['a.js']);
  });
});

describe('where an actor sits', () => {
  it('arrives from off to one side rather than on top of the work', () => {
    const actors = createActors();
    actors.onCommit(commit('Ada', 'ada@acme.com', ['a.js']), { 'a.js': node('a.js', 100, 0) }, 0);

    expect(Math.abs(actors.list()[0].x - 100)).toBeGreaterThan(10);
  });

  it('closes on the files it is working on', () => {
    const actors = createActors();
    actors.onCommit(commit('Ada', 'ada@acme.com', ['a.js']), { 'a.js': node('a.js', 100, 0) }, 0);
    const before = Math.abs(actors.list()[0].x - 100);

    for (let i = 0; i < 40; i++) actors.tick(16);

    expect(Math.abs(actors.list()[0].x - 100)).toBeLessThan(before / 2);
  });

  it('settles between two files rather than picking one', () => {
    const actors = createActors();
    actors.onCommit(
      commit('Ada', 'ada@acme.com', ['a.js', 'b.js']),
      { 'a.js': node('a.js', 0, 0), 'b.js': node('b.js', 100, 0) },
      0,
    );

    for (let i = 0; i < 200; i++) actors.tick(16);

    expect(actors.list()[0].x).toBeCloseTo(50, 0);
  });
});

describe('fading out', () => {
  it('keeps an actor at full strength while it is working', () => {
    const actors = createActors({ idleMs: 1000 });
    actors.onCommit(commit('Ada', 'ada@acme.com', ['a.js']), { 'a.js': node('a.js', 0, 0) }, 0);

    actors.tick(100);

    expect(actors.list()[0].alpha).toBe(1);
  });

  it('dims one that has stopped', () => {
    const actors = createActors({ idleMs: 1000 });
    actors.onCommit(commit('Ada', 'ada@acme.com', ['a.js']), { 'a.js': node('a.js', 0, 0) }, 0);

    actors.tick(600);

    expect(actors.list()[0].alpha).toBeLessThan(1);
  });

  it('removes one that has been idle long enough', () => {
    const actors = createActors({ idleMs: 1000 });
    actors.onCommit(commit('Ada', 'ada@acme.com', ['a.js']), { 'a.js': node('a.js', 0, 0) }, 0);

    actors.tick(1100);

    expect(actors.list()).toHaveLength(0);
  });
});

describe('crowds', () => {
  it('keeps only the busiest actors when there are too many', () => {
    const actors = createActors({ maxActors: 2 });
    const nodes = { 'a.js': node('a.js', 0, 0) };
    /** @type {Array<{ name: string, commits: number }>} */
    const load = [
      { name: 'Ada', commits: 5 },
      { name: 'Bo', commits: 3 },
      { name: 'Cy', commits: 1 },
    ];
    for (const { name, commits: count } of load) {
      for (let i = 0; i < count; i++) {
        actors.onCommit(commit(name, `${name}@acme.com`, ['a.js']), nodes, i);
      }
    }

    expect(actors.list().map((a) => a.name)).toEqual(['Ada', 'Bo']);
  });
});

describe('clear', () => {
  it('drops everything, for a scrub or a restart', () => {
    const actors = createActors();
    actors.onCommit(commit('Ada', 'ada@acme.com', ['a.js']), { 'a.js': node('a.js', 0, 0) }, 0);

    actors.clear();

    expect(actors.list()).toHaveLength(0);
    expect(actors.beams()).toHaveLength(0);
  });
});

describe('identity from the config', () => {
  const resolve = (commit) => {
    const known = {
      'ada@acme.com': { key: 'ada', name: 'Ada Lovelace', hue: 210, avatar: 'a.png' },
      'a.lovelace@example.net': { key: 'ada', name: 'Ada Lovelace', hue: 210, avatar: 'a.png' },
      'ci@acme.com': null,
    };
    return commit.authorEmail in known
      ? known[commit.authorEmail]
      : { key: commit.authorEmail, name: commit.author };
  };

  it('folds two addresses into one actor', () => {
    const actors = createActors({ resolve });
    const nodes = { 'a.js': node('a.js', 0, 0) };
    actors.onCommit(commit('ada', 'ada@acme.com', ['a.js']), nodes, 0);
    actors.onCommit(commit('Ada L', 'a.lovelace@example.net', ['a.js']), nodes, 1);

    expect(actors.list()).toHaveLength(1);
    expect(actors.list()[0].name).toBe('Ada Lovelace');
  });

  it('carries the avatar and the team colour onto the actor', () => {
    const actors = createActors({ resolve });
    actors.onCommit(commit('ada', 'ada@acme.com', ['a.js']), { 'a.js': node('a.js', 0, 0) }, 0);

    expect(actors.list()[0]).toMatchObject({ avatar: 'a.png', hue: 210 });
  });

  it('leaves out someone the config hides', () => {
    const actors = createActors({ resolve });
    actors.onCommit(commit('ci', 'ci@acme.com', ['a.js']), { 'a.js': node('a.js', 0, 0) }, 0);

    expect(actors.list()).toHaveLength(0);
    expect(actors.beams()).toHaveLength(0);
  });

  it('still draws an address the config has never seen', () => {
    const actors = createActors({ resolve });
    actors.onCommit(commit('New', 'new@acme.com', ['a.js']), { 'a.js': node('a.js', 0, 0) }, 0);

    expect(actors.list()[0].name).toBe('New');
  });
});

describe('keeping clear of the bubbles', () => {
  const settle = (actors, frames = 400) => {
    for (let i = 0; i < frames; i++) actors.tick(16);
  };

  it('hovers near its file rather than on top of it', () => {
    const actors = createActors({ nodeClearance: 30, idleMs: 60000 });
    actors.onCommit(commit('Ada', 'ada@acme.com', ['a.js']), { 'a.js': node('a.js', 0, 0) }, 0);

    settle(actors);
    const { x, y } = actors.list()[0];

    expect(Math.hypot(x, y)).toBeGreaterThan(20);
  });

  it('stays close, rather than being pushed away', () => {
    const actors = createActors({ nodeClearance: 30, idleMs: 60000 });
    actors.onCommit(commit('Ada', 'ada@acme.com', ['a.js']), { 'a.js': node('a.js', 0, 0) }, 0);

    settle(actors);
    const { x, y } = actors.list()[0];

    expect(Math.hypot(x, y)).toBeLessThan(70);
  });

  it('allows for a bigger bubble', () => {
    const big = { path: 'a.js', x: 0, y: 0, r: 40 };
    const actors = createActors({ nodeClearance: 30, idleMs: 60000 });
    actors.onCommit(commit('Ada', 'ada@acme.com', ['a.js']), { 'a.js': big }, 0);

    settle(actors);
    const { x, y } = actors.list()[0];

    expect(Math.hypot(x, y)).toBeGreaterThan(40);
  });
});

describe('keeping clear of each other', () => {
  const twoOnOneFile = (options) => {
    const actors = createActors({ idleMs: 60000, ...options });
    const nodes = { 'a.js': node('a.js', 0, 0) };
    actors.onCommit(commit('Ada', 'ada@acme.com', ['a.js']), nodes, 0);
    actors.onCommit(commit('Bo', 'bo@acme.com', ['a.js']), nodes, 1);
    for (let i = 0; i < 250; i++) actors.tick(16);
    return actors.list();
  };

  it('does not let two avatars sit on the same spot', () => {
    const [a, b] = twoOnOneFile({ actorClearance: 36 });

    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(20);
  });

  it('keeps them close enough to read as working together', () => {
    const [a, b] = twoOnOneFile({ actorClearance: 36 });

    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(120);
  });

  it('leaves two people working far apart alone', () => {
    const actors = createActors({ idleMs: 60000 });
    actors.onCommit(commit('Ada', 'ada@acme.com', ['a.js']), { 'a.js': node('a.js', 0, 0) }, 0);
    actors.onCommit(commit('Bo', 'bo@acme.com', ['b.js']), { 'b.js': node('b.js', 600, 0) }, 1);

    for (let i = 0; i < 250; i++) actors.tick(16);
    const [a, b] = actors.list();

    expect(Math.abs(a.x - b.x)).toBeGreaterThan(400);
  });

  it('settles rather than jittering', () => {
    const actors = createActors({ idleMs: 60000 });
    const nodes = { 'a.js': node('a.js', 0, 0) };
    actors.onCommit(commit('Ada', 'ada@acme.com', ['a.js']), nodes, 0);
    actors.onCommit(commit('Bo', 'bo@acme.com', ['a.js']), nodes, 1);
    for (let i = 0; i < 250; i++) actors.tick(16);

    const before = actors.list().map((a) => ({ x: a.x, y: a.y }));
    for (let i = 0; i < 20; i++) actors.tick(16);
    const after = actors.list().map((a) => ({ x: a.x, y: a.y }));

    for (const [i, position] of before.entries()) {
      expect(Math.hypot(position.x - after[i].x, position.y - after[i].y)).toBeLessThan(1.5);
    }
  });
});

describe('standing off the repo blobs', () => {
  const blob = { x: 0, y: 0, radius: 200 };

  /** An actor that has just committed to a file in the middle of the blob. */
  function actorInBlob() {
    const actors = createActors();
    actors.setClusters([blob]);
    actors.onCommit(
      { author: 'Ada', authorEmail: 'ada@acme.com', changes: [{ path: 'a.c' }] },
      { 'a.c': { x: 0, y: 0, r: 10 } },
      0,
    );
    return actors;
  }

  it('pushes an avatar out past the edge of the repo it is working on', () => {
    const actors = actorInBlob();
    for (let i = 0; i < 250; i++) actors.tick(16);
    const [actor] = actors.list();

    expect(Math.hypot(actor.x, actor.y)).toBeGreaterThan(blob.radius);
  });

  it('leaves an avatar alone when no blob is anywhere near it', () => {
    const actors = actorInBlob();
    actors.setClusters([{ x: 5000, y: 5000, radius: 100 }]);
    for (let i = 0; i < 200; i++) actors.tick(16);
    const [actor] = actors.list();

    expect(Math.hypot(actor.x, actor.y)).toBeLessThan(50);
  });
});

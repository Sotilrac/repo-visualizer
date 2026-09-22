import { describe, expect, it } from 'vitest';
import { createEntityTree } from '../src/engine/entities.js';

const change = (path, { added = 10, removed = 0, status = 'M' } = {}) => ({
  path,
  added,
  removed,
  status,
});

const settings = { folderDepth: 2, lodFor: () => 3 };

/** Everything a renderer would read, in a comparable shape. */
const digest = (tree) =>
  [...tree.entities()]
    .map((e) => [e.id, e.kind, e.churn, e.commits, e.files, e.bornAt, e.lastTouchedAt])
    .sort();

describe('building the tree', () => {
  it('creates an entity for the file and each container above it', () => {
    const tree = createEntityTree(settings);
    tree.apply([change('battery/src/a/b.js')], 0);

    expect([...tree.entities()].map((e) => e.id).sort()).toEqual([
      'battery',
      'battery/src',
      'battery/src/a',
      'battery/src/a/b.js',
    ]);
  });

  it('knows what kind each one is', () => {
    const tree = createEntityTree(settings);
    tree.apply([change('battery/src/a.js')], 0);

    const kinds = Object.fromEntries([...tree.entities()].map((e) => [e.id, e.kind]));
    expect(kinds).toEqual({
      battery: 'repo',
      'battery/src': 'folder',
      'battery/src/a.js': 'file',
    });
  });

  it('shares a container between two files', () => {
    const tree = createEntityTree(settings);
    tree.apply([change('battery/src/a.js'), change('battery/src/b.js')], 0);

    expect(tree.get('battery/src').files).toBe(2);
  });

  it('puts a project above the repo when one is configured', () => {
    const tree = createEntityTree({ ...settings, projectFor: () => 'power' });
    tree.apply([change('battery/a.js')], 0);

    expect([...tree.entities()].map((e) => e.id)).toContain('~power');
  });
});

describe('rolling up', () => {
  it('adds churn to every container', () => {
    const tree = createEntityTree(settings);
    tree.apply([change('battery/src/a.js', { added: 10, removed: 5 })], 0);

    expect(tree.get('battery').churn).toBe(15);
    expect(tree.get('battery/src').churn).toBe(15);
  });

  it('sums churn from two files under one container', () => {
    const tree = createEntityTree(settings);
    tree.apply(
      [change('battery/src/a.js', { added: 10 }), change('battery/src/b.js', { added: 4 })],
      0,
    );

    expect(tree.get('battery').churn).toBe(14);
  });

  it('counts a commit once per container, not once per file it touched', () => {
    const tree = createEntityTree(settings);
    tree.apply([change('battery/src/a.js'), change('battery/src/b.js')], 0);

    expect(tree.get('battery').commits).toBe(1);
  });

  it('records when a container was first and last touched', () => {
    const tree = createEntityTree(settings);
    tree.apply([change('battery/src/a.js')], 3);
    tree.apply([change('battery/src/b.js')], 7);

    expect(tree.get('battery')).toMatchObject({ bornAt: 3, lastTouchedAt: 7 });
  });

  it('counts the live files under a container', () => {
    const tree = createEntityTree(settings);
    tree.apply([change('battery/src/a.js'), change('battery/other/b.js')], 0);

    expect(tree.get('battery').files).toBe(2);
    expect(tree.get('battery/src').files).toBe(1);
  });

  it('stops counting a file once it is deleted', () => {
    const tree = createEntityTree(settings);
    tree.apply([change('battery/src/a.js'), change('battery/src/b.js')], 0);
    tree.apply([change('battery/src/a.js', { status: 'D' })], 1);

    expect(tree.get('battery').files).toBe(1);
  });

  it('counts it again if it comes back', () => {
    const tree = createEntityTree(settings);
    tree.apply([change('battery/a.js')], 0);
    tree.apply([change('battery/a.js', { status: 'D' })], 1);
    tree.apply([change('battery/a.js')], 2);

    expect(tree.get('battery').files).toBe(1);
  });
});

describe('reverting', () => {
  const roundTrip = (commits) => {
    const forward = createEntityTree(settings);
    const undos = commits.map((changes, i) => forward.apply(changes, i));

    for (let i = commits.length - 1; i >= 1; i--) {
      forward.revert(undos[i]);
      const rebuilt = createEntityTree(settings);
      for (let j = 0; j < i; j++) rebuilt.apply(commits[j], j);
      expect(digest(forward), `after reverting commit ${i}`).toEqual(digest(rebuilt));
    }
  };

  it('undoes churn added by a commit', () => {
    roundTrip([
      [change('battery/src/a.js', { added: 10 })],
      [change('battery/src/a.js', { added: 5 })],
    ]);
  });

  it('undoes a file that a commit created', () => {
    roundTrip([[change('battery/a.js')], [change('battery/b.js')]]);
  });

  it('undoes a deletion, bringing the file count back', () => {
    roundTrip([
      [change('battery/a.js'), change('battery/b.js')],
      [change('battery/a.js', { status: 'D' })],
    ]);
  });

  it('undoes a container that a commit created', () => {
    roundTrip([[change('battery/src/a.js')], [change('battery/other/b.js')]]);
  });

  it('matches a rebuild across a longer history', () => {
    const files = ['battery/src/a.js', 'battery/src/b.js', 'battery/lib/c.js', 'core/d.js'];
    let seed = 7;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0x100000000;
    };
    const commits = Array.from({ length: 25 }, () =>
      files
        .filter(() => rand() > 0.5)
        .map((f) =>
          change(f, {
            added: Math.floor(rand() * 30),
            removed: Math.floor(rand() * 8),
            status: rand() < 0.15 ? 'D' : 'M',
          }),
        ),
    ).filter((c) => c.length > 0);

    roundTrip(commits);
  });
});

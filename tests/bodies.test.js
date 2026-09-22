import { describe, expect, it } from 'vitest';
import { bodyIndex, levelsFor, simulatedLevels } from '../src/engine/bodies.js';
import { MONTH } from '../src/engine/lodDecay.js';
import { buildRepoClock } from '../src/engine/repoClock.js';

/** A graph state holding just the fields the rollup reads. */
function stateOf(files) {
  const nodes = new Map();
  for (const [path, extra] of Object.entries(files)) {
    nodes.set(path, {
      path,
      dir: path.split('/')[0],
      size: 100,
      churn: 10,
      commits: 1,
      bornAt: 0,
      lastTouchedAt: 0,
      deleted: false,
      ...extra,
    });
  }
  return { nodes };
}

const tree = stateOf({
  'battery/src/cell.c': {},
  'battery/src/pack.c': {},
  'battery/doc/notes.md': {},
  'battery/README.md': {},
  'core/main.c': {},
});

describe('bodyIndex', () => {
  it('draws one bubble a repo at level one', () => {
    const { bodies } = bodyIndex(tree, 9, { levels: { battery: 1, core: 1 } });

    expect(bodies.map((b) => b.id).sort()).toEqual(['battery', 'core']);
  });

  it('rolls the files up into that bubble', () => {
    const { bodies } = bodyIndex(tree, 9, { levels: { battery: 1 } });
    const battery = bodies.find((b) => b.id === 'battery');

    expect([battery.files, battery.churn, battery.size]).toEqual([4, 40, 400]);
  });

  it('splits a repo into folders at level two', () => {
    const { bodies } = bodyIndex(tree, 9, { levels: { battery: 2, core: 0 } });

    expect(bodies.map((b) => b.id).sort()).toEqual(['battery', 'battery/doc', 'battery/src']);
  });

  it('keeps a root file in the repo bubble beside its folders', () => {
    const { bodies } = bodyIndex(tree, 9, { levels: { battery: 2 } });

    expect(bodies.find((b) => b.id === 'battery').files).toBe(1);
  });

  it('draws the files themselves at level three', () => {
    const { bodies } = bodyIndex(tree, 9, { levels: { battery: 3, core: 0 } });

    expect(bodies).toHaveLength(4);
    expect(bodies.every((b) => b.kind === 'file')).toBe(true);
  });

  it('leaves out a repo at level zero', () => {
    const { bodies } = bodyIndex(tree, 9, { levels: { battery: 0, core: 1 } });

    expect(bodies.map((b) => b.id)).toEqual(['core']);
  });

  it('defaults a repo the levels do not mention to one bubble', () => {
    const { bodies } = bodyIndex(tree, 9, { levels: {} });

    expect(bodies.map((b) => b.id).sort()).toEqual(['battery', 'core']);
  });

  it('leaves out a file the timeline has not reached', () => {
    const later = stateOf({ 'core/main.c': { bornAt: 4 } });

    expect(bodyIndex(later, 3, { levels: {} }).bodies).toEqual([]);
  });

  it('leaves out a deleted file, and the bubble it emptied', () => {
    const gone = stateOf({ 'core/main.c': { deleted: true } });

    expect(bodyIndex(gone, 9, { levels: {} }).bodies).toEqual([]);
  });

  it('names the repo each body belongs to', () => {
    const { bodies } = bodyIndex(tree, 9, { levels: { battery: 2 } });

    expect(bodies.every((b) => b.repo === 'battery' || b.repo === 'core')).toBe(true);
  });

  it('points every body at the repo it falls into', () => {
    const { bodies } = bodyIndex(tree, 9, { levels: { battery: 3, core: 0 } });

    expect(new Set(bodies.map((b) => b.parent))).toEqual(new Set(['battery']));
  });

  it('puts a repo under its project when it has one', () => {
    const { bodies } = bodyIndex(tree, 9, {
      levels: { battery: 1 },
      projects: { battery: 'power' },
    });

    expect(bodies.find((b) => b.repo === 'battery').id).toBe('~power/battery');
  });

  it('takes the earliest birth and the latest touch of what it holds', () => {
    const spread = stateOf({
      'core/a.c': { bornAt: 2, lastTouchedAt: 3 },
      'core/b.c': { bornAt: 5, lastTouchedAt: 9 },
    });
    const core = bodyIndex(spread, 9, { levels: {} }).bodies[0];

    expect([core.bornAt, core.lastTouchedAt]).toEqual([2, 9]);
  });

  it('tells a caller which body stands in for a file', () => {
    const { idFor } = bodyIndex(tree, 9, { levels: { battery: 2, core: 1 } });

    expect([idFor('battery/src/cell.c'), idFor('core/main.c')]).toEqual(['battery/src', 'core']);
  });

  it('stands in for nothing when the repo is hidden', () => {
    expect(bodyIndex(tree, 9, { levels: { core: 0 } }).idFor('core/main.c')).toBeNull();
  });

  it('honours the folder depth', () => {
    const deep = stateOf({ 'core/a/b/c/main.c': {} });
    const { bodies } = bodyIndex(deep, 9, { levels: { core: 2 }, folderDepth: 3 });

    expect(bodies[0].id).toBe('core/a/b/c');
  });
});

describe('levelsFor', () => {
  const clock = buildRepoClock([
    { repo: 'battery', date: '2021-01-01T00:00:00Z' },
    { repo: 'core', date: '2021-01-01T00:00:00Z' },
  ]);
  const start = new Date('2021-01-01T00:00:00Z').getTime();

  it('gives each repo the level the config asks for', () => {
    const levels = levelsFor([{ name: 'battery', lod: 3 }], { clock, commitIndex: 0, now: start });

    expect(levels).toEqual({ battery: 3 });
  });

  it('drops the level of a repo that has gone quiet', () => {
    const levels = levelsFor([{ name: 'battery', lod: 3 }], {
      clock,
      commitIndex: 0,
      now: start + 4 * MONTH,
    });

    expect(levels).toEqual({ battery: 2 });
  });

  it('keeps a hidden repo hidden', () => {
    const levels = levelsFor([{ name: 'battery', lod: 0 }], {
      clock,
      commitIndex: 0,
      now: start + 40 * MONTH,
    });

    expect(levels).toEqual({ battery: 0 });
  });

  it('takes a different quiet period', () => {
    const levels = levelsFor([{ name: 'battery', lod: 3 }], {
      clock,
      commitIndex: 0,
      now: start + 2 * MONTH,
      quietPeriod: MONTH,
    });

    expect(levels).toEqual({ battery: 1 });
  });
});

describe('simulatedLevels', () => {
  it('leaves a settled repo at its level', () => {
    const transitions = { stateFor: () => ({ phase: 'steady', level: 3 }) };

    expect(simulatedLevels({ battery: 3 }, transitions)).toEqual({ battery: 3 });
  });

  it('keeps simulating the old level while the repo collapses', () => {
    const transitions = { stateFor: () => ({ phase: 'collapsing', level: 3, to: 2 }) };

    expect(simulatedLevels({ battery: 2 }, transitions)).toEqual({ battery: 3 });
  });

  it('takes the level the config asks for when nothing is tracked yet', () => {
    expect(simulatedLevels({ battery: 2 }, { stateFor: () => null })).toEqual({ battery: 2 });
  });
});

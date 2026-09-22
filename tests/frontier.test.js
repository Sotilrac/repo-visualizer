import { describe, expect, it } from 'vitest';
import { createEntityTree } from '../src/engine/entities.js';
import { frontierOf } from '../src/engine/frontier.js';

const change = (path, added = 10) => ({ path, added, removed: 0, status: 'M' });

const treeWith = (...paths) => {
  const tree = createEntityTree({ folderDepth: 2 });
  tree.apply(
    paths.map((p) => change(p)),
    0,
  );
  return tree;
};

const ids = (bodies) => bodies.map((b) => b.id).sort();

describe('which bodies are drawn', () => {
  const tree = treeWith('battery/src/a.js', 'battery/src/b.js', 'battery/lib/c.js', 'core/d.js');

  it('draws one bubble per repo at level 1', () => {
    expect(ids(frontierOf(tree, { levels: { battery: 1, core: 1 } }))).toEqual(['battery', 'core']);
  });

  it('draws the folders at level 2', () => {
    const bodies = frontierOf(tree, { levels: { battery: 2, core: 2 } });

    expect(ids(bodies)).toEqual(['battery/lib', 'battery/src', 'core']);
  });

  it('draws the files at level 3', () => {
    const bodies = frontierOf(tree, { levels: { battery: 3, core: 3 } });

    expect(ids(bodies)).toEqual([
      'battery/lib/c.js',
      'battery/src/a.js',
      'battery/src/b.js',
      'core/d.js',
    ]);
  });

  it('leaves out a repo at level 0', () => {
    expect(ids(frontierOf(tree, { levels: { battery: 0, core: 1 } }))).toEqual(['core']);
  });

  it('mixes levels, which is the usual case', () => {
    const bodies = frontierOf(tree, { levels: { battery: 3, core: 1 } });

    expect(ids(bodies)).toEqual([
      'battery/lib/c.js',
      'battery/src/a.js',
      'battery/src/b.js',
      'core',
    ]);
  });

  it('defaults a repo the levels do not mention to one bubble', () => {
    expect(ids(frontierOf(tree, { levels: {} }))).toEqual(['battery', 'core']);
  });
});

describe('what a body carries', () => {
  const tree = treeWith('battery/src/a.js', 'battery/src/b.js');
  const [body] = frontierOf(tree, { levels: { battery: 2 } });

  it('names the repo it belongs to, which is its cluster', () => {
    expect(body.repo).toBe('battery');
  });

  it('says what kind of thing it is, so it can be drawn as one', () => {
    expect(body.kind).toBe('folder');
  });

  it('names the container it should be pulled towards', () => {
    expect(body.parent).toBe('battery');
  });

  it('carries the rolled-up churn, for sizing', () => {
    expect(body.churn).toBe(20);
  });

  it('carries how many live files are inside it', () => {
    expect(body.files).toBe(2);
  });

  it('is fully present when nothing is animating', () => {
    expect(body.alpha).toBe(1);
  });
});

describe('a repo that is collapsing', () => {
  const tree = treeWith('battery/src/a.js', 'battery/src/b.js');
  const collapsing = (progress) =>
    frontierOf(tree, {
      levels: { battery: 3 },
      transitions: { battery: { phase: 'collapsing', progress } },
    });

  it('still draws its children while they fall inward', () => {
    expect(ids(collapsing(0.5))).toEqual(['battery/src/a.js', 'battery/src/b.js']);
  });

  it('fades them as they go', () => {
    expect(collapsing(0.5)[0].alpha).toBeCloseTo(0.5, 2);
    expect(collapsing(0.9)[0].alpha).toBeCloseTo(0.1, 2);
  });

  it('pulls them towards the body they are falling into', () => {
    expect(collapsing(0.5)[0].pullTo).toBe('battery');
  });

  it('reports how far in they are, so the layout can move them', () => {
    expect(collapsing(0.75)[0].pull).toBeCloseTo(0.75, 2);
  });
});

describe('a repo that is expanding', () => {
  const tree = treeWith('battery/src/a.js');
  const expanding = (progress) =>
    frontierOf(tree, {
      levels: { battery: 3 },
      transitions: { battery: { phase: 'expanding', progress } },
    });

  it('fades its children in as they fly out', () => {
    expect(expanding(0.25)[0].alpha).toBeCloseTo(0.25, 2);
    expect(expanding(1)[0].alpha).toBe(1);
  });

  it('starts them at the parent and lets them out', () => {
    expect(expanding(0.25)[0]).toMatchObject({ pullTo: 'battery', pull: 0.75 });
  });
});

describe('deleted files', () => {
  it('are left out at level 3', () => {
    const tree = createEntityTree({ folderDepth: 2 });
    tree.apply([change('battery/a.js'), change('battery/b.js')], 0);
    tree.apply([{ path: 'battery/a.js', added: 0, removed: 3, status: 'D' }], 1);

    expect(ids(frontierOf(tree, { levels: { battery: 3 } }))).toEqual(['battery/b.js']);
  });

  it('do not keep an empty folder on screen', () => {
    const tree = createEntityTree({ folderDepth: 2 });
    tree.apply([change('battery/gone/a.js'), change('battery/live/b.js')], 0);
    tree.apply([{ path: 'battery/gone/a.js', added: 0, removed: 3, status: 'D' }], 1);

    expect(ids(frontierOf(tree, { levels: { battery: 2 } }))).toEqual(['battery/live']);
  });
});

import { describe, expect, it } from 'vitest';
import { createLayout } from '../src/engine/layout.js';

const body = (id, repo) => ({
  id,
  kind: 'folder',
  repo,
  parent: repo,
  files: 4,
  size: 400,
  churn: 10,
  commits: 2,
  bornAt: 0,
  lastTouchedAt: 0,
});

/** A layout holding one repo with two folders in it. */
function layoutWithBodies() {
  const layout = createLayout({ width: 1000, height: 800 });
  layout.sync([body('a/one', 'a'), body('a/two', 'a'), body('b/one', 'b')], []);
  return layout;
}

const at = (layout, path) => layout.getNode(path);

describe('a body mid-transition', () => {
  it('is drawn part of the way towards what it is falling into', () => {
    const layout = layoutWithBodies();
    layout.setMotion(() => ({ phase: 'collapsing', progress: 0.5 }));
    layout.tick();
    const node = at(layout, 'a/one');
    const home = layout.getClusterCenters().get('a');

    expect(Math.hypot(node.x - home.x, node.y - home.y)).toBeLessThan(
      Math.hypot(node._sx - home.x, node._sy - home.y),
    );
  });

  it('goes back to moving with the simulation once it is over', () => {
    const layout = layoutWithBodies();
    layout.setMotion(() => ({ phase: 'collapsing', progress: 0.9 }));
    for (let i = 0; i < 5; i++) layout.tick();

    layout.setMotion(() => ({ phase: 'steady', progress: 1 }));
    layout.tick();
    const settled = { x: at(layout, 'a/one').x, y: at(layout, 'a/one').y };
    for (let i = 0; i < 40; i++) layout.tick();

    const node = at(layout, 'a/one');
    expect(Math.hypot(node.x - settled.x, node.y - settled.y)).toBeGreaterThan(0.5);
  });

  it('keeps nothing from the transition once it is over', () => {
    const layout = layoutWithBodies();
    layout.setMotion(() => ({ phase: 'expanding', progress: 0.4 }));
    layout.tick();
    layout.setMotion(() => ({ phase: 'steady', progress: 1 }));
    layout.tick();

    expect(at(layout, 'a/one')._sx).toBeUndefined();
  });
});

describe('a body that leaves and comes back', () => {
  it('comes back where it was, not in a fresh spot', () => {
    const layout = createLayout({ width: 1000, height: 800 });
    const all = [body('a/one', 'a'), body('a/two', 'a'), body('b/one', 'b')];
    layout.sync(all, []);
    for (let i = 0; i < 60; i++) layout.tick();
    const before = { ...at(layout, 'a/two') };

    // The repo goes quiet and drops a level, so its folders leave.
    layout.sync([body('a', 'a'), body('b/one', 'b')], []);
    layout.tick();
    // Then it is touched again and they are back.
    layout.sync(all, []);

    const node = at(layout, 'a/two');
    expect(Math.hypot(node.x - before.x, node.y - before.y)).toBeLessThan(1);
  });

  it('puts a body it has never seen inside the repo it belongs to', () => {
    const layout = createLayout({ width: 1000, height: 800 });
    layout.sync([body('a/one', 'a'), body('b/one', 'b')], []);
    const home = layout.getClusterCenters().get('a');
    const node = at(layout, 'a/one');

    expect(Math.hypot(node.x - home.x, node.y - home.y)).toBeLessThan(home.radius + 50);
  });
});

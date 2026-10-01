import { describe, expect, it } from 'vitest';
import { createActors } from '../src/engine/actors.js';
import { createLayout } from '../src/engine/layout.js';

const file = (id, repo) => ({
  id,
  repo,
  kind: 'file',
  size: 400,
  files: 1,
  commits: 1,
  bornAt: 0,
  lastTouchedAt: 0,
});

const centroid = (nodes) => ({
  x: nodes.reduce((sum, n) => sum + n.x, 0) / nodes.length,
  y: nodes.reduce((sum, n) => sum + n.y, 0) / nodes.length,
});

/** A settled graph, with the people wired to it the way the frame loop does. */
function graph() {
  const layout = createLayout({ width: 1600, height: 900 });
  const bodies = [];
  for (let r = 0; r < 3; r++) {
    for (let i = 0; i < 6; i++) bodies.push(file(`r${r}/f${i}.js`, `repo${r}`));
  }
  layout.sync(bodies, []);
  for (const [i, n] of layout.getNodes().entries()) {
    n.x = 700 + (i % 6) * 40;
    n.y = 400 + Math.floor(i / 6) * 40;
    n.vx = 0;
    n.vy = 0;
  }
  for (let i = 0; i < 1600; i++) layout.tick();

  const actors = createActors({ idleMs: 600000, wake: () => layout.wake() });
  return { layout, actors };
}

/** One frame of the loop: step the graph, then the people. */
function frame(layout, actors) {
  layout.tick();
  actors.setBodies(layout.getNodes());
  actors.tick(1000 / 60, 1);
}

describe('someone leaning on the graph', () => {
  it('shifts the bubble they are leaning on', () => {
    const { layout, actors } = graph();
    const target = layout.getNodes()[0];
    const was = { x: target.x, y: target.y };

    actors.onCommit(
      { author: 'Ada', authorEmail: 'ada@acme.com', changes: [{ path: target.path }] },
      { [target.path]: target },
      0,
    );
    const [ada] = actors.list();
    ada.x = target.x + 3;
    ada.y = target.y;
    for (let i = 0; i < 240; i++) frame(layout, actors);

    expect(Math.hypot(target.x - was.x, target.y - was.y)).toBeGreaterThan(2);
  });

  // Against the same graph left alone, rather than against where it
  // started: the bubbles go on settling whether anyone leans on them or
  // not, and that drift is the layout's, not the contact's.
  //
  // What is bounded here is translation. The neighbours do move, by tens of
  // pixels, because that is what being pushed means; what must not happen
  // is the whole cluster sliding off after the person who touched it.
  it('does not drag the rest of the scene along', () => {
    const quiet = graph();
    for (let i = 0; i < 240; i++) frame(quiet.layout, quiet.actors);
    const alone = centroid(quiet.layout.getNodes());

    const { layout, actors } = graph();
    const target = layout.getNodes()[0];
    actors.onCommit(
      { author: 'Ada', authorEmail: 'ada@acme.com', changes: [{ path: target.path }] },
      { [target.path]: target },
      0,
    );
    const [ada] = actors.list();
    ada.x = target.x + 3;
    ada.y = target.y;
    for (let i = 0; i < 240; i++) frame(layout, actors);

    const leaned = centroid(layout.getNodes());
    expect(Math.hypot(leaned.x - alone.x, leaned.y - alone.y)).toBeLessThan(10);
  });

  it('lets the graph settle again once they have gone', () => {
    const { layout, actors } = graph();
    const target = layout.getNodes()[0];
    actors.onCommit(
      { author: 'Ada', authorEmail: 'ada@acme.com', changes: [{ path: target.path }] },
      { [target.path]: target },
      0,
    );
    const [ada] = actors.list();
    ada.x = target.x + 3;
    ada.y = target.y;
    for (let i = 0; i < 120; i++) frame(layout, actors);

    actors.clear();
    for (let i = 0; i < 600; i++) frame(layout, actors);
    const resting = layout.getNodes().map((n) => ({ x: n.x, y: n.y }));
    for (let i = 0; i < 120; i++) frame(layout, actors);

    const moved = layout
      .getNodes()
      .map((n, i) => Math.hypot(n.x - resting[i].x, n.y - resting[i].y));
    expect(Math.max(...moved)).toBeLessThan(0.5);
  });
});

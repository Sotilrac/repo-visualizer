import { describe, expect, it } from 'vitest';
import { createLayout } from '../src/engine/layout.js';

const file = (id, repo, size = 400) => ({
  id,
  repo,
  kind: 'file',
  size,
  files: 1,
  commits: 1,
  bornAt: 0,
  lastTouchedAt: 0,
});

/** A layout holding `per` files in each of `repos` repos, settled. */
function settled(repos, per, steps = 900) {
  const layout = createLayout({ width: 1600, height: 900 });
  const bodies = [];
  for (let r = 0; r < repos; r++) {
    for (let i = 0; i < per; i++) bodies.push(file(`r${r}/f${i}.js`, `repo${r}`));
  }
  layout.sync(bodies, []);
  pin(layout);
  for (let i = 0; i < steps; i++) layout.tick();
  return layout;
}

/**
 * Start every bubble in a ring around its repo.
 *
 * A new bubble is dropped at a random spot inside its blob, which makes
 * where the layout ends up a shade different every run and these bounds
 * flaky. What is under test is where the forces take them, not where they
 * were dropped.
 */
function pin(layout) {
  const blobs = layout.getClusterCenters();
  const seen = new Map();
  for (const node of layout.getNodes()) {
    const home = blobs.get(node.dir) ?? { x: 800, y: 450, radius: 100 };
    const i = seen.get(node.dir) ?? 0;
    seen.set(node.dir, i + 1);
    const angle = i * 2.399;
    node.x = home.x + Math.cos(angle) * home.radius * 0.6;
    node.y = home.y + Math.sin(angle) * home.radius * 0.6;
    node.vx = 0;
    node.vy = 0;
  }
}

const centroid = (nodes) => ({
  x: nodes.reduce((sum, n) => sum + n.x, 0) / nodes.length,
  y: nodes.reduce((sum, n) => sum + n.y, 0) / nodes.length,
});

describe('how the bubbles sit', () => {
  it('leaves them touching at worst, not stacked', () => {
    const nodes = settled(3, 8).getNodes();

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const apart = Math.hypot(a.x - b.x, a.y - b.y);
        const touching = a.r + b.r;
        // The collision force is a soft constraint, so a little overlap is
        // allowed; a bubble swallowing another is not.
        expect(apart, `${a.path} and ${b.path} are on top of each other`).toBeGreaterThan(
          touching * 0.6,
        );
      }
    }
  });

  it('keeps each one inside the repo it belongs to', () => {
    const layout = settled(4, 6);
    const blobs = layout.getClusterCenters();

    for (const node of layout.getNodes()) {
      const home = blobs.get(node.dir);
      const out = Math.hypot(node.x - home.x, node.y - home.y) - home.radius;
      expect(out, `${node.path} is ${out.toFixed(0)} outside ${node.dir}`).toBeLessThan(
        node.r + 24,
      );
    }
  });

  it('holds two repos apart rather than mixing them', () => {
    const layout = settled(2, 10);
    const middles = new Map();
    for (const node of layout.getNodes()) {
      const seen = middles.get(node.dir) ?? [];
      seen.push(node);
      middles.set(node.dir, seen);
    }

    const [a, b] = [...middles.values()].map(centroid);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(100);
  });
});

describe('coming to rest', () => {
  it('stops moving once it has settled', () => {
    const layout = settled(3, 8, 1400);
    const before = layout.getNodes().map((n) => ({ x: n.x, y: n.y }));
    for (let i = 0; i < 120; i++) layout.tick();

    const moved = layout.getNodes().map((n, i) => Math.hypot(n.x - before[i].x, n.y - before[i].y));
    expect(Math.max(...moved)).toBeLessThan(0.5);
  });
});

describe('the scene does not lurch', () => {
  it('stays put when one more bubble turns up', () => {
    const layout = createLayout({ width: 1600, height: 900 });
    const bodies = [];
    for (let r = 0; r < 3; r++) {
      for (let i = 0; i < 8; i++) bodies.push(file(`r${r}/f${i}.js`, `repo${r}`));
    }
    layout.sync(bodies, []);
    pin(layout);
    for (let i = 0; i < 1200; i++) layout.tick();
    const before = centroid(layout.getNodes());

    // One new file in one repo, which is what a commit looks like. A
    // centring force would shift every other bubble to make room for it.
    layout.sync([...bodies, file('r0/new.js', 'repo0')], []);
    for (let i = 0; i < 60; i++) layout.tick();
    const after = centroid(layout.getNodes());

    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeLessThan(12);
  });
});

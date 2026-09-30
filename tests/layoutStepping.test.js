import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLayout } from '../src/engine/layout.js';

const body = (id, repo = 'app') => ({
  id,
  repo,
  kind: 'file',
  size: 120,
  files: 1,
  commits: 1,
  bornAt: 0,
  lastTouchedAt: 0,
});

function started() {
  const layout = createLayout({ width: 900, height: 600 });
  layout.sync([body('a.js'), body('b.js'), body('c.js')], []);
  return layout;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('who steps the simulation', () => {
  it('does not advance on its own', async () => {
    vi.useFakeTimers();
    const layout = started();
    const [node] = layout.getNodes();
    const was = { x: node.x, y: node.y };

    // d3-force runs its own animation frame timer unless it is stopped, and
    // the frame loop steps this one at a fixed rate. Both would step it.
    await vi.advanceTimersByTimeAsync(500);

    expect(node.x).toBe(was.x);
    expect(node.y).toBe(was.y);
  });

  it('advances when it is stepped', () => {
    const layout = started();
    const [node] = layout.getNodes();
    const was = { x: node.x, y: node.y };

    for (let i = 0; i < 10; i++) layout.tick();

    expect(Math.hypot(node.x - was.x, node.y - was.y)).toBeGreaterThan(0);
  });

  it('covers the same ground in the same number of steps', () => {
    const run = (steps) => {
      const layout = createLayout({ width: 900, height: 600 });
      layout.sync([body('a.js'), body('b.js'), body('c.js')], []);
      // Pin the start, so the only difference is how often it was stepped.
      for (const [i, n] of layout.getNodes().entries()) {
        n.x = 400 + i * 30;
        n.y = 300;
        n.vx = 0;
        n.vy = 0;
      }
      for (let i = 0; i < steps; i++) layout.tick();
      return layout.getNodes().map((n) => ({ x: n.x, y: n.y }));
    };

    const once = run(40);
    const twice = run(40);
    for (const [i, p] of once.entries()) {
      expect(Math.hypot(p.x - twice[i].x, p.y - twice[i].y)).toBeLessThan(1e-9);
    }
  });
});

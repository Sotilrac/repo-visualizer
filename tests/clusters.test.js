import { describe, expect, it } from 'vitest';
import { clusterRadii, forceContain, placeClusters } from '../src/engine/clusters.js';

const node = (dir, r) => ({ dir, r, x: 0, y: 0, vx: 0, vy: 0 });
const viewport = { width: 1600, height: 900 };

describe('clusterRadii', () => {
  it('gives a repo room for what it holds', () => {
    const radii = clusterRadii([node('a', 10), node('a', 10), node('a', 10)]);

    expect(radii.get('a')).toBeGreaterThan(18 * 1.5);
  });

  it('grows with the number of bubbles', () => {
    const few = clusterRadii([node('a', 10)]).get('a');
    const many = clusterRadii(Array.from({ length: 20 }, () => node('a', 10))).get('a');

    expect(many).toBeGreaterThan(few * 3);
  });

  it('grows with their size', () => {
    const small = clusterRadii([node('a', 6), node('a', 6)]).get('a');
    const large = clusterRadii([node('a', 40), node('a', 40)]).get('a');

    expect(large).toBeGreaterThan(small * 2);
  });

  it('always leaves room for the biggest bubble in it', () => {
    expect(clusterRadii([node('a', 60)]).get('a')).toBeGreaterThanOrEqual(60);
  });

  it('keeps repos separate', () => {
    expect([...clusterRadii([node('a', 10), node('b', 10)]).keys()].sort()).toEqual(['a', 'b']);
  });
});

describe('placeClusters', () => {
  it('puts a lone repo in the middle of the viewport', () => {
    const centers = placeClusters(new Map([['a', 40]]), viewport);

    expect([centers.get('a').x, centers.get('a').y]).toEqual([800, 450]);
  });

  it('keeps blobs of the same size clear of each other', () => {
    const radii = new Map(Array.from({ length: 12 }, (_, i) => [`r${i}`, 60]));
    const centers = [...placeClusters(radii, viewport).values()];

    let worst = Infinity;
    for (let i = 0; i < centers.length; i++) {
      for (let j = i + 1; j < centers.length; j++) {
        const gap =
          Math.hypot(centers[i].x - centers[j].x, centers[i].y - centers[j].y) -
          (centers[i].radius + centers[j].radius);
        worst = Math.min(worst, gap);
      }
    }

    expect(worst).toBeGreaterThan(0);
  });

  it('lays the repos out in the order it is given', () => {
    const radii = new Map([
      ['late', 40],
      ['early', 40],
    ]);
    const centers = placeClusters(radii, { ...viewport, order: ['early', 'late'] });

    expect(centers.get('early').ring).toBeLessThan(centers.get('late').ring);
  });

  it('leaves a repo where it was when another one appears', () => {
    const order = ['a', 'b'];
    const before = placeClusters(
      new Map([
        ['a', 60],
        ['b', 60],
      ]),
      { ...viewport, order },
    );
    const after = placeClusters(
      new Map([
        ['a', 60],
        ['b', 60],
        ['c', 60],
      ]),
      { ...viewport, order: [...order, 'c'] },
    );

    expect([after.get('a').x, after.get('a').y]).toEqual([before.get('a').x, before.get('a').y]);
  });

  it('fills a disc instead of a ring, so the middle is not empty', () => {
    const radii = new Map(Array.from({ length: 40 }, (_, i) => [`r${i}`, 50]));
    const centers = [...placeClusters(radii, viewport).values()];
    const rings = centers.map((c) => c.ring).sort((a, b) => a - b);

    // The innermost blob sits near the middle and the outermost bounds the
    // disc: a ring would put them all at one radius.
    expect(rings[0]).toBeLessThan(rings.at(-1) / 3);
  });

  it('carries the blob radius through for the containment force', () => {
    expect(placeClusters(new Map([['a', 77]]), viewport).get('a').radius).toBe(77);
  });

  it('has nothing to place when there are no repos', () => {
    expect(placeClusters(new Map(), viewport).size).toBe(0);
  });
});

describe('forceContain', () => {
  const centers = () => new Map([['a', { x: 0, y: 0, radius: 100 }]]);

  function applied(target) {
    const force = forceContain({ centers, strength: 1 });
    force.initialize([target]);
    force(1);
    return target;
  }

  it('leaves a bubble inside the blob alone', () => {
    const inside = applied({ dir: 'a', r: 10, x: 50, y: 0, vx: 0, vy: 0 });

    expect(inside.vx).toBe(0);
  });

  it('pulls a bubble that has drifted out back towards the middle', () => {
    const outside = applied({ dir: 'a', r: 10, x: 300, y: 0, vx: 0, vy: 0 });

    expect(outside.vx).toBeLessThan(0);
  });

  it('pulls harder the further out it is', () => {
    const near = applied({ dir: 'a', r: 10, x: 150, y: 0, vx: 0, vy: 0 });
    const far = applied({ dir: 'a', r: 10, x: 400, y: 0, vx: 0, vy: 0 });

    expect(Math.abs(far.vx)).toBeGreaterThan(Math.abs(near.vx));
  });

  it('holds a big bubble further in, so it does not hang over the edge', () => {
    const big = applied({ dir: 'a', r: 60, x: 60, y: 0, vx: 0, vy: 0 });

    expect(big.vx).toBeLessThan(0);
  });

  it('ignores a bubble whose repo is not placed', () => {
    const orphan = applied({ dir: 'z', r: 10, x: 900, y: 0, vx: 0, vy: 0 });

    expect(orphan.vx).toBe(0);
  });
});

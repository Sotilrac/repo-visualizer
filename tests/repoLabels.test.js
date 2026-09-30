import { describe, expect, it } from 'vitest';
import { REPO_LABEL_GAP, repoLabelSpot } from '../src/visualizers/pixi/labels.js';

const at = (x, y, r) => ({ x, y, r });

describe('a repo drawn as one bubble', () => {
  it('puts the name outside the ring, not on it', () => {
    // Facing right, so the name goes to the right of the bubble.
    const spot = repoLabelSpot([at(100, 100, 20)], 0);

    expect(spot.x).toBe(100 + 20 + REPO_LABEL_GAP);
    expect(spot.y).toBeCloseTo(100, 6);
  });

  it('leaves the same gap however big the bubble is', () => {
    const small = repoLabelSpot([at(0, 0, 6)], 0);
    const large = repoLabelSpot([at(0, 0, 60)], 0);

    expect(small.x - 6).toBe(large.x - 60);
  });

  it('goes the way the repo faces', () => {
    const up = repoLabelSpot([at(0, 0, 10)], -Math.PI / 2);

    expect(up.y).toBe(-(10 + REPO_LABEL_GAP));
    expect(up.x).toBeCloseTo(0, 6);
  });
});

describe('a repo that has burst into folders', () => {
  it('puts the name in the middle of them', () => {
    const spot = repoLabelSpot([at(0, 0, 10), at(100, 0, 10), at(50, 80, 10)], 0);

    expect(spot.x).toBe(50);
    expect(spot.y).toBe(40);
  });

  it('counts the edges, not just the centres', () => {
    // One wide bubble on the left, one small on the right.
    const spot = repoLabelSpot([at(0, 0, 40), at(100, 0, 10)], 0);

    // Centres average to 50; the bubbles span -40 to 110, so the middle is 35.
    expect(spot.x).toBe(35);
  });

  it('ignores which way the repo faces', () => {
    const members = [at(0, 0, 10), at(100, 0, 10)];

    expect(repoLabelSpot(members, 0)).toEqual(repoLabelSpot(members, Math.PI));
  });
});

describe('a repo with nothing on screen', () => {
  it('has nowhere to put a name', () => {
    expect(repoLabelSpot([], 0)).toBeNull();
  });
});

describe('clearing the ring, not just its centre', () => {
  const name = { width: 80, height: 14 };

  it('pushes a wide name out by half of itself', () => {
    const bare = repoLabelSpot([at(0, 0, 20)], 0);
    const wide = repoLabelSpot([at(0, 0, 20)], 0, name);

    expect(wide.x - bare.x).toBe(name.width / 2);
  });

  it('leaves the gap between the ring and the near edge of the word', () => {
    const spot = repoLabelSpot([at(0, 0, 20)], 0, name);
    const nearEdge = spot.x - name.width / 2;

    expect(nearEdge).toBe(20 + REPO_LABEL_GAP);
  });

  it('measures the height when the name goes above the bubble', () => {
    const spot = repoLabelSpot([at(0, 0, 20)], -Math.PI / 2, name);

    // Straight up, so it is the line height that has to clear the ring.
    expect(-spot.y - name.height / 2).toBeCloseTo(20 + REPO_LABEL_GAP, 6);
  });

  it('measures both when the name goes off at an angle', () => {
    const spot = repoLabelSpot([at(0, 0, 20)], Math.PI / 4, name);
    const out = Math.hypot(spot.x, spot.y);

    expect(out).toBeGreaterThan(20 + REPO_LABEL_GAP + name.height / 2);
    expect(out).toBeLessThan(20 + REPO_LABEL_GAP + name.width / 2);
  });

  it('is unchanged for a cluster, which sits in the middle regardless', () => {
    const members = [at(0, 0, 10), at(100, 0, 10)];

    expect(repoLabelSpot(members, 0, name)).toEqual(repoLabelSpot(members, 0));
  });
});

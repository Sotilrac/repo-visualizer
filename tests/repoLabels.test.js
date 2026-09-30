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

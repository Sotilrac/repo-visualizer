import { describe, expect, it } from 'vitest';
import { AVATAR_RADIUS } from '../src/engine/actors.js';
import { activePoints } from '../src/engine/followAction.js';

const body = (path, x, y) => ({ path, x, y, r: 8 });

const actor = (x, y, aims = []) => ({
  x,
  y,
  aims: new Map(aims.map((node) => [node.path, { node }])),
});

describe('what the camera follows', () => {
  it('frames where a commit just landed', () => {
    const touched = body('a.js', 100, 50);
    const points = activePoints({
      ripples: [{ path: 'a.js' }],
      nodeByPath: new Map([['a.js', touched]]),
    });

    expect(points).toContain(touched);
  });

  it('frames the people, so a beam and both its ends stay in shot', () => {
    const points = activePoints({ actors: [actor(300, 200)] });

    expect(points).toEqual([{ x: 300, y: 200, r: AVATAR_RADIUS }]);
  });

  it('draws the people where they are drawn, not where the forces put them', () => {
    const [point] = activePoints({ actors: [{ x: 0, y: 0, sx: 40, sy: 60 }] });

    expect(point).toMatchObject({ x: 40, y: 60 });
  });

  it('keeps what someone is still working on after the ripple has gone', () => {
    const work = body('a.js', 10, 10);
    const points = activePoints({ ripples: [], actors: [actor(0, 0, [work])] });

    expect(points).toContain(work);
  });

  it('names a body once however many people are on it', () => {
    const work = body('a.js', 10, 10);
    const points = activePoints({
      ripples: [{ path: 'a.js' }],
      actors: [actor(0, 0, [work]), actor(50, 0, [work])],
      nodeByPath: new Map([['a.js', work]]),
    });

    expect(points.filter((p) => p === work)).toHaveLength(1);
  });

  it('ignores a ripple whose body has gone off screen', () => {
    const points = activePoints({ ripples: [{ path: 'gone.js' }], nodeByPath: new Map() });

    expect(points).toEqual([]);
  });

  it('has nothing to frame when nothing is happening', () => {
    expect(activePoints({})).toEqual([]);
  });
});

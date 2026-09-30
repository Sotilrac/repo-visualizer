import { describe, expect, it } from 'vitest';
import { lightAt, restOf, settled } from '../src/engine/restfulness.js';

const channels = (colour) => [(colour >> 16) & 0xff, (colour >> 8) & 0xff, colour & 0xff];

describe('how settled a bubble is', () => {
  it('is nothing for one touched by the commit showing now', () => {
    expect(restOf(100, 100)).toBe(0);
  });

  it('grows with the quiet behind it', () => {
    expect(restOf(100, 400)).toBeGreaterThan(restOf(100, 200));
  });

  it('stops once it is as settled as it gets', () => {
    expect(restOf(0, 5000)).toBe(1);
    expect(restOf(0, 50000)).toBe(1);
  });

  it('is nothing for a bubble the timeline has not reached', () => {
    expect(restOf(400, 100)).toBe(0);
  });

  it('copes with a body that has never been touched', () => {
    expect(restOf(undefined, 100)).toBe(0);
  });
});

describe('what settling leaves', () => {
  it('leaves a busy bubble alone', () => {
    expect(lightAt(0)).toBe(1);
    expect(settled(0x3388ff, 0)).toBe(0x3388ff);
  });

  it('dims a settled one without putting it out', () => {
    expect(lightAt(1)).toBeLessThan(1);
    expect(lightAt(1)).toBeGreaterThan(0.2);
  });

  it('takes the colour out without taking it all out', () => {
    const [r, g, b] = channels(settled(0x3388ff, 1));
    const spread = Math.max(r, g, b) - Math.min(r, g, b);

    // Still blue, just less of it.
    expect(b).toBeGreaterThan(r);
    expect(spread).toBeGreaterThan(20);
    expect(spread).toBeLessThan(0xff - 0x33);
  });

  it('keeps the weight of the colour, so it greys rather than darkens', () => {
    const before = channels(0x3388ff);
    const after = channels(settled(0x3388ff, 1));
    const luma = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];

    expect(luma(after)).toBeCloseTo(luma(before), 0);
  });

  it('leaves a grey alone, since there is nothing to take out', () => {
    expect(settled(0x808080, 1)).toBe(0x808080);
  });
});

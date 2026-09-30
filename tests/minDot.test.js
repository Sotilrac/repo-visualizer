import { describe, expect, it } from 'vitest';
import { fadedBelow, MIN_DOT } from '../src/visualizers/pixi/stage.js';

describe('discs smaller than a pixel', () => {
  it('leaves anything big enough alone', () => {
    expect(fadedBelow(4, 0.8)).toBe(0.8);
    expect(fadedBelow(MIN_DOT, 0.8)).toBe(0.8);
  });

  it('dims what has to be held at the floor', () => {
    expect(fadedBelow(MIN_DOT / 2, 1)).toBeLessThan(1);
  });

  it('takes the brightness down by the area, so the light is the same', () => {
    // Held at twice the size it asked for, hence a quarter as bright.
    expect(fadedBelow(MIN_DOT / 2, 1)).toBeCloseTo(0.25, 6);
    expect(fadedBelow(MIN_DOT / 4, 1)).toBeCloseTo(0.0625, 6);
  });

  it('fades to nothing rather than to a pinprick', () => {
    expect(fadedBelow(0.01, 1)).toBeLessThan(0.001);
    expect(fadedBelow(0, 1)).toBe(0);
  });
});

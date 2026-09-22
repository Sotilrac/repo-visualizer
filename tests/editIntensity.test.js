import { describe, expect, it } from 'vitest';
import { editIntensity, FLOOR } from '../src/engine/editIntensity.js';

describe('editIntensity', () => {
  it('is the share of the lines a change touched', () => {
    expect(editIntensity({ added: 50, removed: 0 }, { lines: 100 })).toBeCloseTo(0.5, 5);
  });

  it('counts removals as well as additions', () => {
    expect(editIntensity({ added: 30, removed: 20 }, { lines: 100 })).toBeCloseTo(0.5, 5);
  });

  it('reads a small edit as the floor, since smaller looks the same', () => {
    expect(editIntensity({ added: 1, removed: 0 }, { lines: 10000 })).toBe(FLOOR);
  });

  it('has a floor of a tenth', () => {
    expect(FLOOR).toBe(0.1);
  });

  it('never exceeds a whole', () => {
    expect(editIntensity({ added: 500, removed: 500 }, { lines: 100 })).toBe(1);
  });

  it('reads a rewrite as a whole', () => {
    expect(editIntensity({ added: 100, removed: 100 }, { lines: 100 })).toBe(1);
  });

  it('reads a new file as a whole, having no size to compare against', () => {
    expect(editIntensity({ added: 40, removed: 0 }, { lines: 0 })).toBe(1);
  });

  it('reads a deletion as a whole', () => {
    expect(editIntensity({ added: 0, removed: 12, status: 'D' }, { lines: 200 })).toBe(1);
  });

  it('is the floor for a change that touched no lines', () => {
    expect(editIntensity({ added: 0, removed: 0 }, { lines: 100 })).toBe(FLOOR);
  });

  it('falls back to the floor when the size is unknown', () => {
    expect(editIntensity({ added: 5, removed: 0 }, {})).toBe(1);
  });
});

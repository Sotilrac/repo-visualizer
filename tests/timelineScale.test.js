import { describe, expect, it } from 'vitest';
import { createTimeScale } from '../src/engine/timelineScale.js';

/** A year of silence with one commit in it, then a fortnight of work. */
const lopsided = [
  { date: '2021-01-01T00:00:00Z' },
  ...Array.from({ length: 14 }, (_, i) => ({
    date: new Date(Date.parse('2021-12-18T00:00:00Z') + i * 86400000).toISOString(),
  })),
];

describe('createTimeScale', () => {
  const scale = createTimeScale(lopsided);

  it('puts the first commit at the start and the last at the end', () => {
    expect([scale.pctOf(0), scale.pctOf(lopsided.length - 1)]).toEqual([0, 100]);
  });

  it('gives the quiet year most of the track, since that is how long it was', () => {
    expect(scale.pctOf(1)).toBeGreaterThan(90);
  });

  it('reads a point on the track back as the commit standing there', () => {
    expect(scale.indexAt(scale.pctOf(7))).toBe(7);
  });

  it('holds the last commit before a gap while the gap is crossed', () => {
    expect(scale.indexAt(50)).toBe(0);
  });

  it('clamps a point off either end', () => {
    expect([scale.indexAt(-20), scale.indexAt(400)]).toEqual([0, lopsided.length - 1]);
  });

  it('places a moment as well as a commit', () => {
    expect(scale.pctAt(Date.parse('2021-07-02T12:00:00Z'))).toBeCloseTo(50, 0);
  });

  it('has somewhere to put things when every commit lands together', () => {
    const same = createTimeScale([
      { date: '2021-01-01T00:00:00Z' },
      { date: '2021-01-01T00:00:00Z' },
    ]);

    expect([same.pctOf(0), same.pctOf(1)]).toEqual([0, 0]);
  });

  it('survives an empty history', () => {
    const none = createTimeScale([]);

    expect([none.pctOf(0), none.indexAt(50)]).toEqual([0, 0]);
  });
});

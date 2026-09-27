import { describe, expect, it } from 'vitest';
import { timelineTicks } from '../src/engine/timelineTicks.js';

/** One commit a day from `from`, for `days`. */
function daily(from, days) {
  const start = new Date(from).getTime();
  return Array.from({ length: days }, (_, i) => ({
    date: new Date(start + i * 86400000).toISOString(),
  }));
}

describe('timelineTicks', () => {
  const twoYears = timelineTicks(daily('2020-11-15T00:00:00Z', 730));

  it('marks every month', () => {
    expect(twoYears.filter((t) => t.kind === 'month')).toHaveLength(20);
  });

  it('marks the half years', () => {
    expect(twoYears.filter((t) => t.kind === 'half').map((t) => t.pct.toFixed(0))).toEqual([
      '31',
      '81',
    ]);
  });

  it('marks and names each new year', () => {
    expect(twoYears.filter((t) => t.kind === 'year').map((t) => t.label)).toEqual(['2021', '2022']);
  });

  it('puts a year where its first commit falls on the track', () => {
    const year = twoYears.find((t) => t.label === '2021');

    // 47 days into a 730-day history.
    expect(year.pct).toBeCloseTo((47 / 729) * 100, 0);
  });

  it('bunches the marks up where the commits are', () => {
    // A year of nothing, then a fortnight of work.
    const quiet = [{ date: '2021-01-01T00:00:00Z' }, ...daily('2021-12-20T00:00:00Z', 14)];
    const ticks = timelineTicks(quiet);
    const january = ticks.find((t) => t.label === '2022');

    expect(january.pct).toBeGreaterThan(70);
  });

  it('drops the marks that would land on top of each other', () => {
    // A year of nothing but a single commit, then a burst: every month of
    // that year falls on the same pixel.
    const lopsided = [{ date: '2021-01-01T00:00:00Z' }, ...daily('2021-12-20T00:00:00Z', 40)];
    const ticks = timelineTicks(lopsided);
    const gaps = ticks.slice(1).map((tick, i) => tick.pct - ticks[i].pct);

    expect(Math.min(...gaps)).toBeGreaterThan(0.24);
  });

  it('names the last of a run of years that fall together', () => {
    // Four years of one commit each, then real work.
    const sparse = [
      { date: '2016-06-01T00:00:00Z' },
      { date: '2017-06-01T00:00:00Z' },
      { date: '2018-06-01T00:00:00Z' },
      { date: '2019-06-01T00:00:00Z' },
      ...daily('2020-01-01T00:00:00Z', 500),
    ];
    const labels = timelineTicks(sparse)
      .filter((t) => t.label)
      .map((t) => t.label);

    expect(labels).toEqual(['2020', '2021']);
  });

  it('has nothing to mark on an empty or single-commit history', () => {
    expect(timelineTicks([])).toEqual([]);
    expect(timelineTicks([{ date: '2021-01-01T00:00:00Z' }])).toEqual([]);
  });

  it('has nothing to mark when every commit lands at the same moment', () => {
    const same = Array.from({ length: 5 }, () => ({ date: '2021-01-01T00:00:00Z' }));

    expect(timelineTicks(same)).toEqual([]);
  });

  it('never runs off either end of the track', () => {
    for (const tick of twoYears) {
      expect(tick.pct).toBeGreaterThanOrEqual(0);
      expect(tick.pct).toBeLessThanOrEqual(100);
    }
  });
});

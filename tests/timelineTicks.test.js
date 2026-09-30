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

  it('puts a year where it falls on the calendar', () => {
    const year = twoYears.find((t) => t.label === '2021');

    // 47 days into a 730-day history.
    expect(year.pct).toBeCloseTo((47 / 729) * 100, 0);
  });

  it('spaces the years evenly', () => {
    const years = twoYears.filter((t) => t.kind === 'year');

    expect(years[1].pct - years[0].pct).toBeCloseTo(50, 0);
  });

  it('bunches the marks up where the commits are', () => {
    // A year of nothing, then a fortnight of work.
    const quiet = [{ date: '2021-01-01T00:00:00Z' }, ...daily('2021-12-20T00:00:00Z', 14)];
    const ticks = timelineTicks(quiet);
    const january = ticks.find((t) => t.label === '2022');

    expect(january.pct).toBeGreaterThan(70);
  });

  it('drops the marks that would land on top of each other', () => {
    // Forty years: the months are a fifth of a percent apart.
    const ticks = timelineTicks(daily('1990-01-01T00:00:00Z', 365 * 40));
    const gaps = ticks.slice(1).map((tick, i) => tick.pct - ticks[i].pct);

    expect(Math.min(...gaps)).toBeGreaterThan(0.24);
  });

  it('names every year there is room for, and no more', () => {
    const labels = timelineTicks(daily('1990-01-01T00:00:00Z', 365 * 40)).filter((t) => t.label);

    expect(labels.length).toBeGreaterThan(10);
    expect(labels.length).toBeLessThan(40);
  });

  it('names each year of a history short enough to show them all', () => {
    const labels = timelineTicks(daily('2020-01-01T00:00:00Z', 365 * 4))
      .filter((t) => t.label)
      .map((t) => t.label);

    expect(labels).toEqual(['2021', '2022', '2023']);
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

describe('the year that lands on top of the start date', () => {
  /** Ten years opening in December, so January lands in the first 1%. */
  const commits = [];
  for (let i = 0; i < 400; i++) {
    commits.push({ date: new Date(Date.UTC(2020, 11, 1 + i * 9)).toISOString() });
  }

  it('drops its label, since the start date is already written there', () => {
    const ticks = timelineTicks(commits);
    const crowded = ticks.filter((t) => t.label && t.pct < 3);

    expect(crowded).toEqual([]);
  });

  it('keeps the mark itself', () => {
    const ticks = timelineTicks(commits);

    expect(ticks.some((t) => t.kind === 'year' && t.pct < 3)).toBe(true);
  });

  it('still labels the years that have room', () => {
    expect(timelineTicks(commits).filter((t) => t.label).length).toBeGreaterThan(0);
  });
});

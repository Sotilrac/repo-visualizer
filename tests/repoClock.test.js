import { describe, expect, it } from 'vitest';
import { buildRepoClock, touchedAt } from '../src/engine/repoClock.js';

const at = (iso) => new Date(iso).getTime();

const commits = [
  { repo: 'battery', date: '2021-01-01T00:00:00Z' },
  { repo: 'core', date: '2021-02-01T00:00:00Z' },
  { repo: 'battery', date: '2021-06-01T00:00:00Z' },
  { repo: 'core', date: '2022-01-01T00:00:00Z' },
];

describe('repoClock', () => {
  const clock = buildRepoClock(commits);

  it('has nothing before the timeline starts', () => {
    expect(touchedAt(clock, 'battery', -1)).toBeNull();
  });

  it('reports the commit at the playhead', () => {
    expect(touchedAt(clock, 'battery', 0)).toBe(at('2021-01-01T00:00:00Z'));
  });

  it('holds the last commit while another repo moves', () => {
    expect(touchedAt(clock, 'battery', 1)).toBe(at('2021-01-01T00:00:00Z'));
  });

  it('moves on when the repo is touched again', () => {
    expect(touchedAt(clock, 'battery', 2)).toBe(at('2021-06-01T00:00:00Z'));
  });

  it('has nothing for a repo the playhead has not reached', () => {
    expect(touchedAt(clock, 'core', 0)).toBeNull();
  });

  it('has nothing for a repo with no commits at all', () => {
    expect(touchedAt(clock, 'ghost', 3)).toBeNull();
  });

  it('answers past the end with the last commit', () => {
    expect(touchedAt(clock, 'core', 99)).toBe(at('2022-01-01T00:00:00Z'));
  });

  it('finds the right commit in a long run', () => {
    const many = Array.from({ length: 500 }, (_, i) => ({
      repo: 'battery',
      date: new Date(at('2021-01-01T00:00:00Z') + i * 86400000).toISOString(),
    }));
    const long = buildRepoClock(many);

    expect(touchedAt(long, 'battery', 321)).toBe(at('2021-01-01T00:00:00Z') + 321 * 86400000);
  });

  it('skips a commit with no repo on it', () => {
    expect(buildRepoClock([{ date: '2021-01-01T00:00:00Z' }]).size).toBe(0);
  });
});

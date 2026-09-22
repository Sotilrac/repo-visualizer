import { describe, expect, it } from 'vitest';
import { effectiveLod, MONTH } from '../src/engine/lodDecay.js';

/** The state `months` after the repo last saw a commit. */
const quietFor = (months) => ({ now: months * MONTH, lastTouchedAt: 0 });

describe('effectiveLod', () => {
  it('leaves a repo at its level while it is being worked on', () => {
    expect(effectiveLod(3, quietFor(0))).toBe(3);
  });

  it('holds the level through the quiet period', () => {
    expect(effectiveLod(3, quietFor(2.9))).toBe(3);
  });

  it('drops a level once the quiet period passes', () => {
    expect(effectiveLod(3, quietFor(3.1))).toBe(2);
  });

  it('drops again after another quiet period', () => {
    expect(effectiveLod(3, quietFor(6.1))).toBe(1);
  });

  it('stops at one bubble however long the silence', () => {
    expect(effectiveLod(3, quietFor(120))).toBe(1);
  });

  it('leaves a repo already at one bubble alone', () => {
    expect(effectiveLod(1, quietFor(120))).toBe(1);
  });

  it('never revives a repo the config hides', () => {
    expect(effectiveLod(0, quietFor(0))).toBe(0);
    expect(effectiveLod(0, quietFor(120))).toBe(0);
  });

  it('comes back to its full level when the repo is edited again', () => {
    const quiet = effectiveLod(3, { now: 10 * MONTH, lastTouchedAt: 0 });
    const active = effectiveLod(3, { now: 10 * MONTH, lastTouchedAt: 10 * MONTH });

    expect([quiet, active]).toEqual([1, 3]);
  });

  it('takes a different quiet period', () => {
    expect(effectiveLod(3, { ...quietFor(2), quietPeriod: MONTH })).toBe(1);
  });

  it('treats a repo with no last edit as quiet', () => {
    expect(effectiveLod(3, { now: 5 * MONTH, lastTouchedAt: null })).toBe(1);
  });

  it('does not decay before the timeline reaches the repo', () => {
    expect(effectiveLod(3, { now: 0, lastTouchedAt: 5 * MONTH })).toBe(3);
  });
});

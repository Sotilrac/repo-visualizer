import { describe, expect, it } from 'vitest';
import { asClock, playbackTime } from '../src/engine/playbackClock.js';

describe('the playback clock', () => {
  it('counts minutes and seconds', () => {
    expect(asClock(0)).toBe('0:00');
    expect(asClock(9_000)).toBe('0:09');
    expect(asClock(61_000)).toBe('1:01');
    expect(asClock(3_600_000)).toBe('60:00');
  });

  it('starts at nothing before the first commit', () => {
    expect(playbackTime(-1, 100, 1200).at).toBe('0:00');
  });

  it('counts the commits already played', () => {
    // Five of them at 1.2 seconds each.
    expect(playbackTime(4, 100, 1200).at).toBe('0:06');
  });

  it('gives the whole run as the total', () => {
    expect(playbackTime(0, 100, 1200).of).toBe('2:00');
  });

  it('shortens as the speed goes up', () => {
    expect(playbackTime(0, 100, 320).of).toBe('0:32');
  });

  it('does not run past the end', () => {
    const { at, of } = playbackTime(500, 100, 1200);

    expect(at).toBe(of);
  });

  it('survives a speed that has not been worked out yet', () => {
    expect(playbackTime(10, 100, 0)).toEqual({ at: '0:00', of: '0:00' });
  });
});

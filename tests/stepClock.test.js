import { describe, expect, it } from 'vitest';
import { createStepClock } from '../src/engine/stepClock.js';

/** Run `frames` frames of `dt` ms and total the steps handed out. */
function run(clock, dt, frames) {
  let steps = 0;
  for (let i = 0; i < frames; i++) steps += clock.advance(dt);
  return steps;
}

describe('createStepClock', () => {
  it('runs the simulation at its own rate, not the display rate', () => {
    const at60 = run(createStepClock(), 1000 / 60, 60);
    const at144 = run(createStepClock(), 1000 / 144, 144);
    const at30 = run(createStepClock(), 1000 / 30, 30);

    // One second of wall clock is sixty steps however often it was sampled.
    expect(at60).toBe(60);
    expect(at144).toBeGreaterThanOrEqual(59);
    expect(at144).toBeLessThanOrEqual(61);
    expect(at30).toBe(60);
  });

  it('hands out whole steps only, and banks the remainder', () => {
    const clock = createStepClock();
    expect(clock.advance(8)).toBe(0);
    expect(clock.advance(8)).toBe(0);
    expect(clock.advance(8)).toBe(1);
  });

  it('does not replay a stall as a burst of steps', () => {
    const clock = createStepClock({ maxSteps: 3 });
    expect(clock.advance(2000)).toBe(3);
    // And the 2 seconds it could not run are dropped rather than owed.
    expect(clock.advance(1000 / 60)).toBe(1);
  });

  it('reports how far into the next step it is, for interpolation', () => {
    const clock = createStepClock();
    expect(clock.alpha()).toBe(0);
    expect(clock.advance(1000 / 120)).toBe(0);
    expect(clock.alpha()).toBeCloseTo(0.5, 2);
    expect(clock.advance(1000 / 60)).toBe(1);
    expect(clock.alpha()).toBeCloseTo(0.5, 2);
  });

  it('ignores a frame time that is not a positive number', () => {
    const clock = createStepClock();
    expect(clock.advance(-16)).toBe(0);
    expect(clock.advance(Number.NaN)).toBe(0);
    expect(clock.advance(undefined)).toBe(0);
    expect(clock.alpha()).toBe(0);
  });
});

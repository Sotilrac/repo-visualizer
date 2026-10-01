import { describe, expect, it, vi } from 'vitest';
import { createRenderClock } from '../src/engine/renderClock.js';

const at = (ms) => {
  let wall = ms;
  return { wall: () => wall, pass: (by) => (wall += by) };
};

describe('the clock a frame reads', () => {
  it('is the wall clock while nothing is being exported', () => {
    const t = at(1000);
    const clock = createRenderClock(t.wall);

    expect(clock.now()).toBe(1000);
    t.pass(16);
    expect(clock.now()).toBe(1016);
    expect(clock.stepping()).toBe(false);
  });

  it('stops following the wall clock once stepping begins', () => {
    const t = at(1000);
    const clock = createRenderClock(t.wall);
    clock.begin();
    t.pass(5000);

    expect(clock.now()).toBe(1000);
    expect(clock.stepping()).toBe(true);
  });

  it('advances by exactly what it is asked for, however long the frame took', () => {
    const t = at(1000);
    const clock = createRenderClock(t.wall);
    clock.begin();

    clock.step(1000 / 30);
    t.pass(4000);
    clock.step(1000 / 30);

    expect(clock.now()).toBeCloseTo(1000 + 2000 / 30, 6);
  });

  it('draws one frame per step, with the step it took', () => {
    const drawn = [];
    const clock = createRenderClock(at(0).wall);
    clock.drawsWith((ms) => drawn.push(ms));
    clock.begin();

    clock.step(20);
    clock.step(20);

    expect(drawn).toEqual([20, 20]);
  });

  it('draws nothing once the exporter lets go', () => {
    const draw = vi.fn();
    const clock = createRenderClock(at(0).wall);
    const stop = clock.drawsWith(draw);
    stop();
    clock.begin();
    clock.step(20);

    expect(draw).not.toHaveBeenCalled();
  });

  it('goes back to the wall clock when the export ends', () => {
    const t = at(1000);
    const clock = createRenderClock(t.wall);
    clock.begin();
    clock.step(20);
    t.pass(9000);
    clock.end();

    expect(clock.now()).toBe(10000);
    expect(clock.stepping()).toBe(false);
  });
});

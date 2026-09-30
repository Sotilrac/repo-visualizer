import { describe, expect, it } from 'vitest';
import { createFrameRate } from '../src/engine/frameRate.js';

/** Feed it `count` frames `ms` apart, and collect what it reports. */
function run(meter, count, ms, from = 0) {
  const reported = [];
  let now = from;
  for (let i = 0; i < count; i++) {
    now += ms;
    const fps = meter.frame(now);
    if (fps !== null) reported.push(fps);
  }
  return { reported, now };
}

describe('createFrameRate', () => {
  it('says nothing about the first frame, having nothing to compare it to', () => {
    expect(createFrameRate().frame(0)).toBeNull();
  });

  it('settles on the rate the frames are arriving at', () => {
    const { reported } = run(createFrameRate(), 200, 1000 / 60);

    expect(reported.at(-1)).toBe(60);
  });

  it('reads a slower loop as slower', () => {
    const { reported } = run(createFrameRate(), 200, 1000 / 24);

    expect(reported.at(-1)).toBe(24);
  });

  it('reports a few times a second, not every frame', () => {
    const { reported } = run(createFrameRate(), 60, 1000 / 60);

    expect(reported.length).toBeLessThan(6);
  });

  it('averages, so one slow frame does not drop the figure to a third', () => {
    const meter = createFrameRate();
    const { now } = run(meter, 200, 1000 / 60);
    meter.frame(now + 50);
    const after = run(meter, 20, 1000 / 60, now + 50).reported.at(-1);

    expect(after).toBeGreaterThan(45);
  });

  it('ignores a gap where the page was not drawing at all', () => {
    const meter = createFrameRate();
    const { now } = run(meter, 200, 1000 / 60);

    expect(meter.frame(now + 5000)).toBeNull();
  });

  it('picks up again after that gap without a figure from before it', () => {
    const meter = createFrameRate();
    const { now } = run(meter, 200, 1000 / 60);
    meter.frame(now + 5000);
    const { reported } = run(meter, 100, 1000 / 30, now + 5000);

    expect(reported.at(-1)).toBeGreaterThan(28);
    expect(reported.at(-1)).toBeLessThan(33);
  });
});

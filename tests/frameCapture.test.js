import { describe, expect, it, vi } from 'vitest';
import { captureFrames, framePlan } from '../src/engine/frameCapture.js';

describe('how many frames a recording is', () => {
  it('holds every commit for the time the speed gives it', () => {
    const plan = framePlan({ commits: 3, msPerCommit: 1000, fps: 30, tailMs: 0 });

    expect(plan.frameMs).toBeCloseTo(1000 / 30, 6);
    expect(plan.frames).toBe(90);
  });

  it('runs on past the last commit, so the end is not a cut', () => {
    const plan = framePlan({ commits: 3, msPerCommit: 1000, fps: 30, tailMs: 1000 });

    expect(plan.frames).toBe(120);
  });

  it('shows the commits in order, one per slot', () => {
    const plan = framePlan({ commits: 4, msPerCommit: 100, fps: 10, tailMs: 0 });

    expect([0, 1, 2, 3].map((f) => plan.commitAt(f))).toEqual([0, 1, 2, 3]);
  });

  it('holds the last commit through the tail rather than running off the end', () => {
    const plan = framePlan({ commits: 2, msPerCommit: 100, fps: 10, tailMs: 500 });

    expect(plan.commitAt(plan.frames - 1)).toBe(1);
  });

  it('is a single frame for a dataset with nothing in it', () => {
    expect(framePlan({ commits: 0, msPerCommit: 1000, fps: 30, tailMs: 0 }).frames).toBe(1);
  });
});

describe('capturing those frames', () => {
  const sink = () => {
    const added = [];
    return {
      added,
      add(t, d) {
        added.push([t, d]);
        return Promise.resolve();
      },
    };
  };

  it('keeps every frame the plan asks for', async () => {
    const out = sink();
    const plan = framePlan({ commits: 2, msPerCommit: 100, fps: 10, tailMs: 0 });

    const kept = await captureFrames({ plan, sink: out, advanceTo: () => {}, drawFrame: () => {} });

    expect(kept).toBe(plan.frames);
    expect(out.added).toHaveLength(plan.frames);
  });

  it('times them by the plan, not by how long the drawing took', async () => {
    const out = sink();
    const plan = framePlan({ commits: 1, msPerCommit: 100, fps: 4, tailMs: 750 });

    await captureFrames({
      plan,
      sink: out,
      advanceTo: () => {},
      // A frame that takes a quarter of a second to draw.
      drawFrame: () => new Promise((r) => setTimeout(r, 1)),
    });

    expect(out.added.map(([t]) => t)).toEqual([0, 0.25, 0.5]);
  });

  it('draws one frame per frame, with the step the plan sets', async () => {
    const drawn = [];
    const plan = framePlan({ commits: 1, msPerCommit: 100, fps: 10, tailMs: 100 });

    await captureFrames({
      plan,
      sink: sink(),
      advanceTo: () => {},
      drawFrame: (ms) => drawn.push(ms),
    });

    expect(drawn).toEqual(Array(plan.frames).fill(plan.frameMs));
  });

  it('walks the timeline to the commit each frame belongs to', async () => {
    const seen = [];
    const plan = framePlan({ commits: 3, msPerCommit: 100, fps: 10, tailMs: 0 });

    await captureFrames({
      plan,
      sink: sink(),
      advanceTo: (i) => seen.push(i),
      drawFrame: () => {},
    });

    expect(seen).toEqual([0, 1, 2]);
  });

  it('stops where it is asked to, mid-recording', async () => {
    const out = sink();
    const plan = framePlan({ commits: 10, msPerCommit: 100, fps: 10, tailMs: 0 });
    let frames = 0;

    const kept = await captureFrames({
      plan,
      sink: out,
      advanceTo: () => {},
      drawFrame: () => frames++,
      shouldStop: () => frames >= 3,
    });

    expect(kept).toBe(3);
  });

  it('reports how far along it is', async () => {
    const onProgress = vi.fn();
    const plan = framePlan({ commits: 1, msPerCommit: 100, fps: 10, tailMs: 100 });

    await captureFrames({
      plan,
      sink: sink(),
      advanceTo: () => {},
      drawFrame: () => {},
      onProgress,
    });

    expect(onProgress).toHaveBeenLastCalledWith(1);
  });
});

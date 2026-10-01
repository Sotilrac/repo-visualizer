/**
 * A recording computed frame by frame.
 *
 * The screen's own loop draws whatever it can in the time it has, which is
 * the right trade for watching and the wrong one for keeping: a capture of
 * it is as choppy as the machine was busy. Here the frames are the unit.
 * Each one is placed on the timeline, drawn, and encoded before the next is
 * started, so the video is the same whether a frame took 4ms or 400.
 */

/**
 * Where each frame of a recording sits in the history.
 *
 * @param {object} params
 * @param {number} params.commits    how many there are to play
 * @param {number} params.msPerCommit the playback speed
 * @param {number} params.fps
 * @param {number} [params.tailMs]   time to hold on the end
 */
export function framePlan({ commits, msPerCommit, fps, tailMs = 1200 }) {
  const frameMs = 1000 / fps;
  const playMs = Math.max(0, commits) * msPerCommit + (commits > 0 ? tailMs : 0);
  const frames = Math.max(1, Math.round(playMs / frameMs));
  const last = Math.max(0, commits - 1);

  return {
    frameMs,
    frames,
    /** @param {number} frame */
    commitAt: (frame) => Math.min(last, Math.floor((frame * frameMs) / msPerCommit)),
  };
}

/**
 * Draw and keep every frame the plan asks for.
 *
 * @param {object} params
 * @param {ReturnType<typeof framePlan>} params.plan
 * @param {{ add: (timestamp: number, duration: number) => Promise<void> | void }} params.sink
 * @param {(commit: number) => unknown} params.advanceTo  put the
 *   timeline on this commit, and let the page catch up with it
 * @param {(ms: number) => unknown} params.drawFrame  one frame,
 *   advancing the simulation by exactly `ms`
 * @param {(done: number) => void} [params.onProgress]
 * @param {() => boolean} [params.shouldStop]
 * @returns {Promise<number>} frames kept
 */
export async function captureFrames({
  plan,
  sink,
  advanceTo,
  drawFrame,
  onProgress,
  shouldStop = () => false,
}) {
  const seconds = plan.frameMs / 1000;
  let kept = 0;

  for (let frame = 0; frame < plan.frames; frame++) {
    if (shouldStop()) break;
    await advanceTo(plan.commitAt(frame));
    await drawFrame(plan.frameMs);
    await sink.add(kept * seconds, seconds);
    kept += 1;
    onProgress?.(kept / plan.frames);
  }

  return kept;
}

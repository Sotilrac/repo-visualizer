/**
 * A fixed rate for the simulation, driven by a frame rate that varies.
 *
 * d3-force advances by one step per call and assumes that step is always
 * the same length, so calling it once per rendered frame means the graph
 * moves further per second on a fast monitor than on a slow one, cools at a
 * different rate, and settles somewhere else. Every value tuned against one
 * frame rate is wrong at another.
 *
 * So real time goes in and whole simulation steps come out, and whatever is
 * left over is held for the next frame.
 */

/**
 * @param {{ hz?: number, maxSteps?: number }} [options] `maxSteps` is how
 *   many steps one frame may run: a frame that took a second is a tab
 *   coming back, not a second of simulation owed.
 */
export function createStepClock({ hz = 60, maxSteps = 3 } = {}) {
  const stepMs = 1000 / hz;
  let carry = 0;

  return {
    stepMs,

    /**
     * @param {number} dt milliseconds since the last frame
     * @returns {number} steps to run now
     */
    advance(dt) {
      const elapsed = Number(dt);
      if (Number.isFinite(elapsed) && elapsed > 0) carry += elapsed;

      const steps = Math.min(maxSteps, Math.floor(carry / stepMs));
      carry -= steps * stepMs;
      // Past the cap the backlog is dropped rather than paid back, which is
      // what keeps a stall from replaying as a lurch.
      if (carry > stepMs) carry %= stepMs;
      return steps;
    },

    /** How far into the next step we are, for interpolating what is drawn. */
    alpha() {
      return Math.min(1, carry / stepMs);
    },
  };
}

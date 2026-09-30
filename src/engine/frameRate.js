/**
 * How fast the page is actually drawing.
 *
 * Every frame is timed and fed through a running average, because the raw
 * figure swings between 40 and 90 from one frame to the next and a number
 * that flickers is unreadable. It is reported a few times a second, which
 * is often enough to see a stall and rare enough not to re-render the page
 * on every frame.
 */

const DEFAULTS = {
  /** How much of the average one frame is worth. */
  weight: 0.12,
  /** How often the figure is handed out, in milliseconds. */
  reportMs: 250,
  /** Longer than this and the page was not drawing at all: a tab in the
   * background, or a seek that blocked the thread. It is not a frame rate. */
  stallMs: 1000,
};

/** @param {Partial<typeof DEFAULTS>} [options] */
export function createFrameRate(options = {}) {
  const config = { ...DEFAULTS, ...options };
  /** @type {number | null} */
  let last = null;
  let average = 0;
  let reportedAt = 0;

  return {
    /**
     * @param {number} now a monotonic timestamp, as requestAnimationFrame gives
     * @returns {number | null} the rate to show, when it is time to show one
     */
    frame(now) {
      const previous = last;
      last = now;
      if (previous === null) {
        reportedAt = now;
        return null;
      }

      const elapsed = now - previous;
      if (elapsed <= 0 || elapsed > config.stallMs) return null;

      const fps = 1000 / elapsed;
      average = average === 0 ? fps : average + (fps - average) * config.weight;

      if (now - reportedAt < config.reportMs) return null;
      reportedAt = now;
      return Math.round(average);
    },
  };
}

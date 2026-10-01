/**
 * The clock a frame is drawn against.
 *
 * Normally the wall clock, so the graph moves at the speed a person set.
 * During a frame-by-frame export it is a counter the exporter advances by
 * exactly one frame at a time: every frame is computed and kept however
 * long the machine takes over it, and a slow render makes a longer export
 * rather than a choppier video.
 *
 * @param {() => number} [wall]
 */
export function createRenderClock(wall = () => performance.now()) {
  /** @type {number | null} */
  let virtual = null;
  /** @type {((ms: number) => void) | null} */
  let draw = null;

  return {
    now: () => virtual ?? wall(),
    stepping: () => virtual !== null,

    /**
     * Register the one function that draws a frame. The frame loop owns it;
     * the exporter calls it through `step`.
     *
     * @param {(ms: number) => void} fn
     * @returns {() => void} to let go again
     */
    drawsWith(fn) {
      draw = fn;
      return () => {
        if (draw === fn) draw = null;
      };
    },

    /** Take over from the wall clock, carrying on from where it is. */
    begin() {
      virtual = wall();
    },

    /**
     * Move on by exactly `ms` and draw that one frame.
     *
     * @param {number} ms
     */
    step(ms) {
      virtual = (virtual ?? wall()) + ms;
      draw?.(ms);
      return virtual;
    },

    /** Hand the frames back to the wall clock. */
    end() {
      virtual = null;
    },
  };
}

/** The one every part of a frame reads. */
export const renderClock = createRenderClock();

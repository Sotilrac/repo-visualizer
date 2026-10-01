/**
 * Keep the screen awake while something is playing.
 *
 * A recording of the history can run for half an hour with nobody touching
 * the keyboard, which is exactly what a screensaver waits for, and a screen
 * that blanks mid-capture takes the canvas with it.
 *
 * The browser gives the lock back whenever the tab goes to the background
 * and never returns it by itself, so it has to be asked for again.
 */

/** @param {any} [nav] */
export function createWakeLock(nav = globalThis.navigator) {
  /** @type {any} */
  let sentinel = null;
  let wanted = false;

  async function hold() {
    wanted = true;
    if (sentinel || typeof nav?.wakeLock?.request !== 'function') return false;
    try {
      const got = await nav.wakeLock.request('screen');
      sentinel = got;
      got.addEventListener?.('release', () => {
        if (sentinel === got) sentinel = null;
      });
      return true;
    } catch {
      // Refused, which a background tab is. Nothing else to do about it.
      sentinel = null;
      return false;
    }
  }

  return {
    held: () => sentinel !== null,
    hold,

    async release() {
      wanted = false;
      const held = sentinel;
      sentinel = null;
      await held?.release?.();
    },

    /** Take it back, if it is still wanted. */
    async regain() {
      if (wanted && !sentinel) await hold();
    },
  };
}

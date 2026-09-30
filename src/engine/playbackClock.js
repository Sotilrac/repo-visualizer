/**
 * How long the timeline takes to play, at the speed it is set to.
 *
 * The scrubber is marked out in dates, which says where in the history you
 * are but nothing about how long you are going to be watching. This is the
 * other reading: minutes and seconds of playback, and how many there are in
 * total, both of which change when the speed does.
 */

/** @param {number} ms */
export function asClock(ms) {
  const whole = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(whole / 60);
  const seconds = whole % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/**
 * @param {number} index the commit showing now, or -1 before the first
 * @param {number} total how many there are
 * @param {number} msPerCommit at the current speed
 */
export function playbackTime(index, total, msPerCommit) {
  const each = Math.max(0, msPerCommit || 0);
  const done = Math.min(Math.max(0, index + 1), total);
  return { at: asClock(done * each), of: asClock(total * each) };
}

/**
 * How much of a name there is room to read.
 *
 * Zoomed out, a repo's title is as wide as the cluster it names and a
 * folder's file count is a number nobody can resolve. Both are worth
 * dropping rather than drawing: the point of a label at that size is to say
 * which thing this is, and a long one covers the neighbours it is meant to
 * be distinguished from.
 */

/** The zoom range the character budget tracks; outside it, it holds. */
const FLOOR = 0.35;
const CEILING = 1.4;

/** Never cut a name down to nothing. */
const SHORTEST = 6;

/**
 * Characters to allow at this zoom.
 *
 * @param {number} max how many at a zoom of one
 * @param {number} scale the camera's zoom
 */
export function budgetFor(max, scale) {
  const tracked = Math.min(CEILING, Math.max(FLOOR, scale || 1));
  return Math.max(SHORTEST, Math.round(max * tracked));
}

/**
 * `text`, cut to `max` characters with an ellipsis if it had to be.
 *
 * @param {string} text
 * @param {number} max
 */
export function shortened(text, max) {
  const name = String(text ?? '');
  if (max <= 0 || name.length <= max) return name;
  return `${name.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

/**
 * Whether a bubble is drawn big enough to hang a count off.
 *
 * @param {number} radiusPx on screen
 * @param {number} from the radius at which counts start showing
 */
export function showsCount(radiusPx, from) {
  return radiusPx >= from;
}

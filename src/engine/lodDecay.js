/**
 * A repo's level of detail falls as it goes quiet.
 *
 * Six years of history has long stretches where a repo sees no commits, and
 * holding every one of them open at full detail fills the graph with
 * structure no one is working on. After a quiet period a repo drops a level,
 * and keeps dropping until it is a single bubble. A commit brings it
 * straight back to the level the config asked for.
 *
 * Time here runs along the timeline: quiet means quiet at the point
 * the playhead has reached.
 */

/** Close enough to a month for a decay rule, and exact across a year. */
export const MONTH = 30 * 24 * 60 * 60 * 1000;

const FLOOR = 1;

/**
 * @param {number} configured the level the config sets for this repo
 * @param {{
 *   now: number,
 *   lastTouchedAt: number | null,
 *   quietPeriod?: number,
 * }} at
 * @returns {number}
 */
export function effectiveLod(configured, { now, lastTouchedAt, quietPeriod = 3 * MONTH }) {
  // A hidden repo stays hidden, and a repo already at one bubble has no
  // detail left to lose. Decay only reduces.
  if (configured <= FLOOR) return configured;

  // Never touched at this point in the timeline: as quiet as it gets.
  if (lastTouchedAt === null || lastTouchedAt === undefined) return FLOOR;

  const quietFor = now - lastTouchedAt;
  if (quietFor <= 0) return configured;

  const steps = Math.floor(quietFor / quietPeriod);
  return Math.max(FLOOR, configured - steps);
}

/**
 * How big an edit was, as a share of what it edited.
 *
 * The burst a file makes when it is touched is scaled by this, so a one-line
 * fix and a rewrite do not look the same. Below a tenth every edit reads
 * identically at this size on screen, so that is the floor: smaller changes
 * still register, they just stop shrinking.
 */

export const FLOOR = 0.1;

/**
 * @param {{ added?: number, removed?: number, status?: string }} change
 * @param {{ lines?: number }} target the size of the thing being edited,
 *   before the change
 * @returns {number} between the floor and 1
 */
export function editIntensity(change, { lines } = {}) {
  // A file being created or deleted is a whole-file event whatever the count.
  if (change.status === 'D') return 1;
  if (lines === undefined || lines <= 0) return 1;

  const touched = (change.added ?? 0) + (change.removed ?? 0);
  if (touched <= 0) return FLOOR;

  return Math.min(1, Math.max(FLOOR, touched / lines));
}

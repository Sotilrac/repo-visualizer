/**
 * Where a repo's name goes.
 *
 * A repo drawn as one bubble has nothing to sit in the middle of, so its
 * name goes outside, a fixed distance clear of the ring: measured from the
 * bubble rather than from the blob it notionally occupies, so the gap looks
 * the same on every repo at every zoom.
 *
 * A repo that has burst into folders and files is a cluster, and the name
 * belongs in the middle of it, where it reads as a title over the thing it
 * names instead of floating off one side.
 */

/** Clear space between a lone bubble's ring and its name, in screen pixels. */
export const REPO_LABEL_GAP = 16;

/**
 * @param {Array<{ x: number, y: number, r: number }>} members the repo's
 *   bodies, in screen space, with screen radii
 * @param {number} angle the way the repo faces, for the lone-bubble case
 * @returns {{ x: number, y: number } | null}
 */
export function repoLabelSpot(members, angle) {
  if (!members.length) return null;

  if (members.length === 1) {
    const only = members[0];
    const out = only.r + REPO_LABEL_GAP;
    return { x: only.x + Math.cos(angle) * out, y: only.y + Math.sin(angle) * out };
  }

  // The middle of what it holds, edges included: a cluster with one big
  // bubble on one side is not centred on the average of the centres.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const member of members) {
    minX = Math.min(minX, member.x - member.r);
    maxX = Math.max(maxX, member.x + member.r);
    minY = Math.min(minY, member.y - member.r);
    maxY = Math.max(maxY, member.y + member.r);
  }
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}

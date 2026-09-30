/**
 * Where a repo's name goes.
 *
 * A repo drawn as one bubble has nothing to sit in the middle of, so its
 * name goes outside, a fixed distance clear of the ring: measured from the
 * bubble rather than from the blob it notionally occupies, so the gap looks
 * the same on every repo at every zoom.
 *
 * What the gap is measured to is the near edge of the word, not its middle.
 * A name is centred on the point it is given, so half of a long one reaches
 * back the way it came: `unit_tests` placed sixteen pixels out along its own
 * axis puts its first four characters inside the ring.
 *
 * A repo that has burst into folders and files is a cluster, and the name
 * belongs in the middle of it, where it reads as a title over the thing it
 * names instead of floating off one side.
 */

/** Clear space between a lone bubble's ring and its name, in screen pixels. */
export const REPO_LABEL_GAP = 16;

/**
 * How far the middle of a box is from its own edge, along a direction.
 *
 * Exact for a box that is not rotated, which a line of text is not.
 *
 * @param {{ width: number, height: number }} size
 * @param {number} angle
 */
function reachOf(size, angle) {
  return (
    (Math.abs(Math.cos(angle)) * size.width) / 2 + (Math.abs(Math.sin(angle)) * size.height) / 2
  );
}

/**
 * @param {Array<{ x: number, y: number, r: number }>} members the repo's
 *   bodies, in screen space, with screen radii
 * @param {number} angle the way the repo faces, for the lone-bubble case
 * @param {{ width: number, height: number }} [size] how big the name is
 * @returns {{ x: number, y: number } | null}
 */
export function repoLabelSpot(members, angle, size = { width: 0, height: 0 }) {
  if (!members.length) return null;

  if (members.length === 1) {
    const only = members[0];
    const out = only.r + REPO_LABEL_GAP + reachOf(size, angle);
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

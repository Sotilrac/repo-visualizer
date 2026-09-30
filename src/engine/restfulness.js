/**
 * How long a bubble has been left alone, and what that does to its colour.
 *
 * A repo that has not been touched for two years is still on the graph and
 * still worth telling apart from its neighbours, but it is not what anyone
 * is looking at. So it settles: dimmer and less saturated, down to a floor
 * where the colour still reads and says which repo it is.
 */

/** Commits of quiet before a bubble is as settled as it gets. */
const SPAN = 900;

/** How much of its brightness and its colour a settled bubble keeps. */
const KEEPS_LIGHT = 0.42;
const KEEPS_COLOUR = 0.45;

/**
 * Nought for something touched just now, one for something long settled.
 *
 * @param {number | undefined} lastTouchedAt the commit that last touched it
 * @param {number} commitIndex the commit showing now
 * @param {number} [span] commits of quiet to settle over
 */
export function restOf(lastTouchedAt, commitIndex, span = SPAN) {
  if (!Number.isFinite(lastTouchedAt) || !Number.isFinite(commitIndex)) return 0;
  const quiet = commitIndex - Number(lastTouchedAt);
  if (quiet <= 0) return 0;
  return Math.min(1, quiet / Math.max(1, span));
}

/**
 * What is left of a bubble's brightness once it has settled this far.
 *
 * @param {number} rest
 */
export function lightAt(rest) {
  return 1 - (1 - KEEPS_LIGHT) * Math.min(1, Math.max(0, rest));
}

/**
 * The same colour with the life taken out of it, toward a grey of its own
 * weight rather than toward black, so the hue is still there to read.
 *
 * @param {number} colour 0xRRGGBB
 * @param {number} rest
 */
export function settled(colour, rest) {
  const keep = 1 - (1 - KEEPS_COLOUR) * Math.min(1, Math.max(0, rest));
  if (keep >= 1) return colour;

  const r = (colour >> 16) & 0xff;
  const g = (colour >> 8) & 0xff;
  const b = colour & 0xff;
  // Rec. 601 luma, which is what "the same weight of grey" means.
  const grey = 0.299 * r + 0.587 * g + 0.114 * b;
  const mix = (channel) => Math.round(grey + (channel - grey) * keep);
  return (mix(r) << 16) | (mix(g) << 8) | mix(b);
}

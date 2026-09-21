/**
 * The two font stacks, in one place.
 *
 * Canvas takes a CSS font shorthand string, so the stylesheet and the drawing
 * code each had their own copy of the stack, and the copies drifted: the overlay
 * asked for a family the page never loaded, so every export was drawn in the
 * system sans. These constants are the values of `--font-sans` and
 * `--font-mono` in styles.css.
 */

export const FONT_SANS = '"Inter", system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
export const FONT_MONO = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

/**
 * @param {number} weight
 * @param {number} sizePx
 */
export function sansFont(weight, sizePx) {
  return `${weight} ${sizePx}px ${FONT_SANS}`;
}

/**
 * @param {number} weight
 * @param {number} sizePx
 */
export function monoFont(weight, sizePx) {
  return `${weight} ${sizePx}px ${FONT_MONO}`;
}

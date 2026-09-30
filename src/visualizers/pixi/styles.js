/**
 * What each look is, as numbers.
 *
 * The four visualizers used to be four files that each drew the same graph
 * in their own way, which meant four copies of every fix. The drawing is
 * one renderer now, and a style is the handful of values it differs by.
 *
 * The glow is the thing to understand here. It used to be drawn per bubble,
 * as a wide translucent sprite behind each one, which costs a screenful of
 * blended pixels several times over on a busy frame. It is a post-process
 * now: the bright things are drawn crisp, and one bloom pass over the whole
 * layer makes them glow. The cost no longer depends on how many there are.
 */

/**
 * @typedef {{
 *   background: string,
 *   sky: 'stars' | 'grid' | 'none',
 *   bloom: {
 *     threshold: number,
 *     scale: number,
 *     blur: number,
 *     quality: number,
 *     downscale: number,
 *   } | null,
 *   body: { fill: number, ring: number, ringWidth: number, core: number },
 *   link: {
 *     width: number,
 *     alpha: number,
 *     curve: number,
 *     glow: number,
 *     glowWidth: number,
 *     crossFade: number,
 *   },
 *   ripple: { rings: number, width: number, reach: number },
 *   label: { color: number, size: number, alpha: number, plate: number },
 *   beams: boolean,
 * }} Style
 */

/** @type {Record<string, Style>} */
export const STYLES = {
  galaxy: {
    background: '#03040a',
    sky: 'stars',
    bloom: { threshold: 0.22, scale: 2.1, blur: 14, quality: 5, downscale: 0.5 },
    body: { fill: 0.9, ring: 0.65, ringWidth: 2.4, core: 0.34 },
    link: { width: 2.4, alpha: 0.5, curve: 0.08, glow: 0.45, glowWidth: 0.4, crossFade: 0.4 },
    ripple: { rings: 2, width: 2.2, reach: 1 },
    label: { color: 0xdfe6ff, size: 11, alpha: 0.9, plate: 0.8 },
    beams: true,
  },
  paper: {
    background: '#f7f5f0',
    sky: 'grid',
    bloom: null,
    body: { fill: 0.92, ring: 0.5, ringWidth: 1.5, core: 0.55 },
    link: { width: 1.6, alpha: 0.2, curve: 0, glow: 0, glowWidth: 0, crossFade: 0.45 },
    ripple: { rings: 3, width: 1.2, reach: 1.1 },
    label: { color: 0x2a2f38, size: 10, alpha: 0.95, plate: 0.88 },
    beams: true,
  },
};

/** @param {string} name */
export function styleFor(name) {
  return STYLES[name] ?? STYLES.galaxy;
}

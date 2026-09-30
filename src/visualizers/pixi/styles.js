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
 *   bloom: { threshold: number, scale: number, blur: number, quality: number } | null,
 *   body: { fill: number, ring: number, ringWidth: number, core: number },
 *   link: { width: number, alpha: number, curve: number },
 *   ripple: { rings: number, width: number, reach: number },
 *   label: { color: number, size: number, alpha: number },
 *   beams: boolean,
 * }} Style
 */

/** @type {Record<string, Style>} */
export const STYLES = {
  galaxy: {
    background: '#03040a',
    sky: 'stars',
    bloom: { threshold: 0.3, scale: 1.4, blur: 9, quality: 5 },
    body: { fill: 0.9, ring: 0.65, ringWidth: 1.6, core: 0.34 },
    link: { width: 1, alpha: 0.5, curve: 0.08 },
    ripple: { rings: 2, width: 1.6, reach: 1 },
    label: { color: 0xdfe6ff, size: 11, alpha: 0.9 },
    beams: true,
  },
  neural: {
    background: '#05060d',
    sky: 'none',
    bloom: { threshold: 0.35, scale: 1.6, blur: 11, quality: 5 },
    body: { fill: 0.95, ring: 0.7, ringWidth: 1.4, core: 0.3 },
    link: { width: 1.2, alpha: 0.7, curve: 0 },
    ripple: { rings: 1, width: 1.4, reach: 1.1 },
    label: { color: 0xd8f0ff, size: 11, alpha: 0.9 },
    beams: true,
  },
  organic: {
    background: '#0a0d0b',
    sky: 'none',
    bloom: { threshold: 0.45, scale: 0.9, blur: 7, quality: 4 },
    body: { fill: 0.85, ring: 0.55, ringWidth: 1.2, core: 0.4 },
    link: { width: 1.4, alpha: 0.4, curve: 0.16 },
    ripple: { rings: 3, width: 1.2, reach: 1.2 },
    label: { color: 0xd6e8d8, size: 11, alpha: 0.85 },
    beams: true,
  },
  minimal: {
    background: '#f7f5f0',
    sky: 'grid',
    bloom: null,
    body: { fill: 0.92, ring: 0.5, ringWidth: 1, core: 0.55 },
    link: { width: 0.8, alpha: 0.28, curve: 0 },
    ripple: { rings: 3, width: 0.8, reach: 1.1 },
    label: { color: 0x2a2f38, size: 10, alpha: 0.95 },
    beams: true,
  },
};

/** @param {string} name */
export function styleFor(name) {
  return STYLES[name] ?? STYLES.galaxy;
}

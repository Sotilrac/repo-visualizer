/**
 * Colours as the GPU wants them.
 *
 * The palette is defined once in `engine/colors.js` as CSS, because that is
 * what the config editor and the legend show. Pixi will parse a CSS colour
 * but it is the same handful of strings on every bubble on every frame, so
 * each one is parsed once and remembered.
 */

import { Color } from 'pixi.js';
import { clusterColorFor } from '../../engine/colors.js';

/** @type {Map<string, { value: number, alpha: number }>} */
const parsed = new Map();

/**
 * @param {string} css any colour `engine/colors.js` produces
 * @returns {{ value: number, alpha: number }}
 */
export function rgb(css) {
  const hit = parsed.get(css);
  if (hit) return hit;
  const color = new Color(css);
  const made = { value: color.toNumber(), alpha: color.alpha };
  parsed.set(css, made);
  return made;
}

/** @type {Map<string, any>} */
const roles = new Map();

/**
 * Every colour a cluster is drawn in, as numbers.
 *
 * @param {Map<string, any>} palette
 * @param {string} cluster
 * @param {string} style
 */
export function clusterRgb(palette, cluster, style) {
  const key = `${style}\u0000${cluster}`;
  const hit = roles.get(key);
  if (hit) return hit;

  const css = clusterColorFor(palette, cluster, style);
  /** @type {Record<string, { value: number, alpha: number }>} */
  const made = {};
  for (const [role, value] of Object.entries(css)) made[role] = rgb(value);
  roles.set(key, made);
  return made;
}

/** The palette changes when the config does, and these are keyed by name. */
export function forgetColors() {
  roles.clear();
}

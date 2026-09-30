/**
 * What is actually in the frame.
 *
 * Six years of one organisation is a couple of thousand bubbles, and at any
 * zoom worth reading most of them are off screen. Everything drawn costs
 * geometry to build and upload whether or not it lands in the viewport, so
 * the cheapest thing to draw is the thing left out.
 */

/** Room past the edge, so nothing pops into view as the camera moves. */
const MARGIN = 64;

/**
 * @param {{ scale: number, tx: number, ty: number }} cam
 * @param {number} w viewport width in CSS pixels
 * @param {number} h
 * @param {number} x world position
 * @param {number} y
 * @param {number} r world radius
 */
export function onScreen(cam, w, h, x, y, r) {
  const reach = r * cam.scale + MARGIN;
  const sx = x * cam.scale + cam.tx;
  if (sx < -reach || sx > w + reach) return false;
  const sy = y * cam.scale + cam.ty;
  return sy >= -reach && sy <= h + reach;
}

/**
 * @param {Array<{ x: number, y: number, r?: number } & Record<string, any>>} items
 * @param {{ scale: number, tx: number, ty: number }} cam
 * @param {number} w
 * @param {number} h
 */
export function visible(items, cam, w, h) {
  const kept = [];
  for (const item of items) {
    if (onScreen(cam, w, h, item.x, item.y, item.r ?? 6)) kept.push(item);
  }
  return kept;
}

/**
 * A uniform grid over things with a position and a radius.
 *
 * The people have to be kept off every bubble on screen, and at file level
 * there are a couple of thousand of them. Checking each person against each
 * bubble several times a step is most of a million distance tests a second
 * for a question that is almost always "nothing is near you".
 *
 * Rebuilt every frame, since everything in it is moving.
 */

/** Past this many cells wide an item is held aside and always offered. */
const SPREAD = 4;

/** @param {number} [cell] the width of one cell, in world units */
export function createGrid(cell = 128) {
  /** @type {Map<number, any[]>} */
  const cells = new Map();
  /** Items too wide to bucket without filling the grid with copies. */
  let large = [];
  const seen = new Set();

  // One number per cell, so the map is keyed without building strings.
  const keyOf = (cx, cy) => cx * 0x10000 + cy;

  return {
    /** @param {Iterable<{ x: number, y: number, r?: number }>} items */
    build(items) {
      cells.clear();
      large = [];
      for (const item of items) {
        const r = item.r ?? 0;
        if (r > cell * SPREAD) {
          large.push(item);
          continue;
        }
        const x0 = Math.floor((item.x - r) / cell);
        const x1 = Math.floor((item.x + r) / cell);
        const y0 = Math.floor((item.y - r) / cell);
        const y1 = Math.floor((item.y + r) / cell);
        for (let cx = x0; cx <= x1; cx++) {
          for (let cy = y0; cy <= y1; cy++) {
            const key = keyOf(cx, cy);
            const bucket = cells.get(key);
            if (bucket) bucket.push(item);
            else cells.set(key, [item]);
          }
        }
      }
    },

    /**
     * Visit everything whose disc comes within `radius` of the point.
     *
     * @param {number} x
     * @param {number} y
     * @param {number} radius
     * @param {(item: any) => void} visit
     */
    near(x, y, radius, visit) {
      seen.clear();
      for (const item of large) {
        if (Math.hypot(item.x - x, item.y - y) <= (item.r ?? 0) + radius) visit(item);
      }

      const x0 = Math.floor((x - radius) / cell);
      const x1 = Math.floor((x + radius) / cell);
      const y0 = Math.floor((y - radius) / cell);
      const y1 = Math.floor((y + radius) / cell);
      for (let cx = x0; cx <= x1; cx++) {
        for (let cy = y0; cy <= y1; cy++) {
          const bucket = cells.get(keyOf(cx, cy));
          if (!bucket) continue;
          for (const item of bucket) {
            if (seen.has(item)) continue;
            seen.add(item);
            if (Math.hypot(item.x - x, item.y - y) <= (item.r ?? 0) + radius) visit(item);
          }
        }
      }
    },
  };
}

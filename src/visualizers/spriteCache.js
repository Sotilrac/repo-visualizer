/**
 * Draw once, blit many.
 *
 * A gradient is built from scratch every time it is asked for, and the
 * graph asks for hundreds a frame: a corona and a core for every bubble, a
 * fade along every beam. Laid-out text is the same story. Painting each
 * distinct thing once into its own small canvas and copying that costs a
 * blit per use instead, which is what the graphics card is for.
 */

/** Beyond this the cache is holding sprites nothing is drawing any more. */
const MAX_SPRITES = 240;

/**
 * @param {{ create?: (w: number, h: number) => any }} [options] `create` is
 *   the seam for the tests, which have no DOM to make a canvas in.
 */
export function createSpriteCache({ create } = {}) {
  const make =
    create ??
    ((w, h) => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.ceil(w));
      canvas.height = Math.max(1, Math.ceil(h));
      return canvas;
    });

  /** @type {Map<string, any>} */
  const sprites = new Map();

  return {
    get size() {
      return sprites.size;
    },

    /**
     * The sprite for `key`, painted by `paint` the first time it is asked
     * for.
     *
     * @param {string} key everything the painting depends on
     * @param {number} width
     * @param {number} height
     * @param {(ctx: any, size: { width: number, height: number }) => void} paint
     */
    get(key, width, height, paint) {
      const hit = sprites.get(key);
      if (hit) {
        // Held in use order, so what falls off the end is what nothing has
        // asked for in a while.
        sprites.delete(key);
        sprites.set(key, hit);
        return hit;
      }

      const canvas = make(width, height);
      const ctx = canvas.getContext('2d');
      if (ctx) paint(ctx, { width: canvas.width, height: canvas.height });
      sprites.set(key, canvas);

      while (sprites.size > MAX_SPRITES) {
        sprites.delete(sprites.keys().next().value);
      }

      return canvas;
    },

    clear() {
      sprites.clear();
    },
  };
}

/**
 * Sizes a sprite is kept at, so a bubble that grows by a pixel reuses the
 * one already drawn instead of adding another.
 *
 * @param {number} radius
 */
export function spriteStep(radius) {
  if (radius <= 8) return Math.max(2, Math.round(radius));
  if (radius <= 32) return Math.round(radius / 2) * 2;
  return Math.round(radius / 4) * 4;
}

/**
 * One full-screen layer, repainted only when it changes.
 *
 * A window-sized canvas is megabytes, so these do not belong in the cache
 * above: a new one every time the picture drifts would hold a hundred of
 * them. There is one buffer, and it is painted over in place.
 *
 * @param {{ create?: (w: number, h: number) => any }} [options]
 */
export function createLayerBuffer({ create } = {}) {
  const make =
    create ??
    ((w, h) => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.ceil(w));
      canvas.height = Math.max(1, Math.ceil(h));
      return canvas;
    });

  let canvas = null;
  let painted = null;

  return {
    /**
     * @param {string} key everything the painting depends on
     * @param {number} width
     * @param {number} height
     * @param {(ctx: any, size: { width: number, height: number }) => void} paint
     */
    get(key, width, height, paint) {
      const w = Math.max(1, Math.ceil(width));
      const h = Math.max(1, Math.ceil(height));
      if (!canvas || canvas.width !== w || canvas.height !== h) {
        canvas = make(w, h);
        painted = null;
      }
      if (painted === key) return canvas;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, w, h);
        paint(ctx, { width: w, height: h });
      }
      painted = key;
      return canvas;
    },
  };
}

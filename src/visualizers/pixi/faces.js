/**
 * Avatars, cropped to a circle once.
 *
 * The loader hands over a square image, and a square is not a face: the old
 * renderer clipped to a circle on every draw. Clipping per sprite per frame
 * costs a pass each in a GPU renderer, so the crop is baked into a texture
 * the first time an image is seen and the sprite is an ordinary sprite
 * after that.
 */

import { Texture } from 'pixi.js';

/** Drawn big enough that zooming in does not show the crop. */
const SIZE = 128;

export function createFaces() {
  /** @type {Map<any, any>} */
  const textures = new Map();

  return {
    /**
     * @param {HTMLImageElement} image
     * @returns {any}
     */
    textureFor(image) {
      const hit = textures.get(image);
      if (hit) return hit;

      const canvas = document.createElement('canvas');
      canvas.width = SIZE;
      canvas.height = SIZE;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.beginPath();
        ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(image, 0, 0, SIZE, SIZE);
      }
      const made = Texture.from(canvas);
      textures.set(image, made);
      return made;
    },
  };
}

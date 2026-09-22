/**
 * Avatar images for the actors on the graph.
 *
 * Every image is same-origin: either a file the scan wrote next to the
 * config, or a generated tile turned into a blob URL here. A cross-origin
 * image drawn into the canvas taints it, and a tainted canvas makes toBlob
 * and captureStream throw, which would break both the in-page export and the
 * offline render.
 *
 * Loading is asynchronous and drawing is not, so a caller gets whatever is
 * ready and the actor appears as a plain disc until its image arrives.
 */

import { initialsSvg } from '../shared/avatarTile.js';

export function createAvatarImages() {
  /** @type {Map<string, HTMLImageElement>} */
  const ready = new Map();
  /** @type {Set<string>} */
  const pending = new Set();

  const load = (key, src) => {
    pending.add(key);
    const image = new Image();
    image.onload = () => {
      ready.set(key, image);
      pending.delete(key);
    };
    image.onerror = () => {
      // A missing file falls back to the generated tile on the next ask.
      pending.delete(key);
      URL.revokeObjectURL(src);
    };
    image.src = src;
  };

  return {
    /**
     * The image for an actor, or null while it loads.
     *
     * @param {{ key: string, name: string, avatar?: string }} actor
     */
    get(actor) {
      const image = ready.get(actor.key);
      if (image) return image;
      if (pending.has(actor.key)) return null;

      if (actor.avatar) {
        load(actor.key, actor.avatar);
        return null;
      }

      const svg = initialsSvg(actor.name, actor.key, { size: 128 });
      load(actor.key, URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })));
      return null;
    },
  };
}

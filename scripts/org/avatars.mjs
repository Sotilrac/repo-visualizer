/**
 * Avatars for the people in a config.
 *
 * Fetched once, here, and written to disk. The app and the renderer only read
 * files, which is what makes a run reproducible, and it keeps the canvas
 * untainted: a cross-origin image drawn into it makes toBlob and captureStream
 * throw, which would break both the in-page export and the offline render.
 */

import { createHash } from 'node:crypto';

export { initialsFor, initialsSvg, tileHue } from '../../src/shared/avatarTile.js';

const GRAVATAR = 'https://www.gravatar.com/avatar';

/** @param {string} email */
export function gravatarHash(email) {
  return createHash('md5').update(email.trim().toLowerCase()).digest('hex');
}

/**
 * @param {string} email
 * @param {{ size?: number, fallback?: string }} [options] fallback `404` makes
 *   a miss detectable. Gravatar's own default serves a generated tile that
 *   would pass for a real avatar.
 */
export function gravatarUrl(email, { size = 256, fallback = '404' } = {}) {
  return `${GRAVATAR}/${gravatarHash(email)}?s=${size}&d=${fallback}`;
}

/**
 * Fetch a gravatar, or null when there is none for that address.
 *
 * @param {string} email
 * `fetchImpl` is the seam the tests use; it takes a URL and answers with
 * enough of a Response to read an image out of.
 *
 * @param {{
 *   size?: number,
 *   fallback?: string,
 *   fetchImpl?: (url: string) => Promise<{
 *     ok: boolean,
 *     headers: { get: (name: string) => string | null },
 *     arrayBuffer?: () => Promise<ArrayBuffer>,
 *   }>,
 * }} [options]
 * @returns {Promise<{ body: Buffer, contentType: string } | null>}
 */
export async function fetchGravatar(
  email,
  { size = 256, fallback = '404', fetchImpl = fetch } = {},
) {
  const response = await fetchImpl(gravatarUrl(email, { size, fallback }));
  if (!response.ok || !response.arrayBuffer) return null;
  return {
    body: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get('content-type') ?? 'image/png',
  };
}

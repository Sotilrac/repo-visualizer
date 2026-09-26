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

/** `12345+login@users.noreply.github.com`, and the older form without the id. */
const NOREPLY =
  /^(?:(\d+)\+)?([A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38})@users\.noreply\.github\.com$/i;

/** What GitHub allows as a login: alphanumerics and single inner hyphens. */
const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;

/**
 * The GitHub account behind a person, where their commits say so.
 *
 * A commit made through GitHub carries a noreply address that holds the
 * account id, which is an avatar with nothing to guess at. Failing that, a
 * spelling of their name that is a valid login is worth trying: people who
 * commit from the web and from a laptop appear under both.
 *
 * @param {{ emails?: string[], names?: string[], name?: string }} person
 * @returns {{ id?: string, login: string, certain: boolean } | null}
 */
export function githubIdentity(person) {
  for (const email of person.emails ?? []) {
    const match = NOREPLY.exec(String(email).trim());
    if (match) {
      return { ...(match[1] ? { id: match[1] } : {}), login: match[2], certain: true };
    }
  }

  // A handle is a guess: two people can hold a login that looks like a name.
  for (const name of [...(person.names ?? []), person.name]) {
    const handle = String(name ?? '').trim();
    if (handle && !handle.includes('@') && LOGIN.test(handle)) {
      return { login: handle, certain: false };
    }
  }

  return null;
}

/**
 * @param {{ id?: string, login: string }} identity
 * @param {{ size?: number }} [options]
 */
export function githubAvatarUrl({ id, login }, { size = 256 } = {}) {
  // By id where there is one: a login can be changed or taken over, an
  // account id cannot.
  if (id) return `https://avatars.githubusercontent.com/u/${id}?v=4&s=${size}`;
  return `https://github.com/${login}.png?size=${size}`;
}

/**
 * Fetch a person's GitHub avatar, or null when their commits do not name an
 * account, or the account has gone.
 *
 * @param {{ emails?: string[], names?: string[], name?: string }} person
 * @param {{
 *   size?: number,
 *   handles?: boolean,
 *   fetchImpl?: (url: string) => Promise<any>,
 * }} [options] `handles` allows the guess from a name; off by default, since
 *   a wrong face is worse than no face.
 * @returns {Promise<{ body: Buffer, contentType: string, login: string } | null>}
 */
export async function fetchGithubAvatar(
  person,
  { size = 256, handles = false, fetchImpl = fetch } = {},
) {
  const identity = githubIdentity(person);
  if (!identity || (!identity.certain && !handles)) return null;

  const response = await fetchImpl(githubAvatarUrl(identity, { size }));
  if (!response?.ok || !response.arrayBuffer) return null;

  return {
    body: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers?.get?.('content-type') ?? 'image/png',
    login: identity.login,
  };
}

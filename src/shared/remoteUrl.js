/**
 * Turn a git remote into a URL a browser can open.
 *
 * Shared, because the analyzer records it into the dataset and the app renders
 * it as a link. A remote that is not on a host, such as a local path or a
 * mirror on disk, has no URL to offer and returns null.
 */

const SCP_LIKE = /^(?:[^@/]+@)?(?<host>[^:/]+):(?<path>.+)$/;
const URL_LIKE = /^[a-z][a-z0-9+.-]*:\/\/(?:[^@/]+@)?(?<host>[^/:]+)(?::\d+)?\/(?<path>.+)$/i;

/**
 * @param {string | null | undefined} remote
 * @returns {string | null} an https URL, or null when the remote is not on a host
 */
export function toBrowseUrl(remote) {
  const raw = (remote ?? '').trim();
  if (!raw || raw.startsWith('.') || raw.startsWith('/') || raw.startsWith('file://')) return null;

  const match = URL_LIKE.exec(raw) ?? SCP_LIKE.exec(raw);
  if (!match?.groups) return null;

  const host = match.groups.host.toLowerCase();
  const path = match.groups.path
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .replace(/\.git$/, '');
  if (!host || !path.includes('/')) return null;

  return `https://${host}/${path}`;
}

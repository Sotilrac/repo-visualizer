/**
 * What this thing is called.
 *
 * The config may rename it; the tagline is not the config's business and
 * belongs in the browser tab rather than on the page, where the graph is
 * already saying what it is.
 */

export const DEFAULT_TITLE = 'Repo Visualizer';

const TAGLINE = 'A cinematic journey through the codebase';

/** @param {string | null | undefined} configured */
export function pageName(configured) {
  return configured?.trim() || DEFAULT_TITLE;
}

/** @param {string | null | undefined} configured */
export function tabTitle(configured) {
  return `${pageName(configured)} — ${TAGLINE}`;
}

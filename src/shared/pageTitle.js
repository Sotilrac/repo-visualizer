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

/**
 * What a burned-in title calls this recording.
 *
 * The config's name for the page, where it has one. A dataset of many repos
 * otherwise announces itself as a count, which is nothing to read over a
 * minute of video, and a dataset of one is better off named after the repo
 * than after this tool.
 *
 * @param {string | null | undefined} configured
 * @param {string | null | undefined} dataset what the dataset calls itself
 */
export function recordingName(configured, dataset) {
  return configured?.trim() || dataset?.trim() || '';
}

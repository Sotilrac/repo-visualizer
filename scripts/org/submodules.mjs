/**
 * Which repos a repo carries as submodules.
 *
 * A stack of firmware repos is not a flat list: one of them pulls the
 * others in, and drawing them side by side says so. The relation is in
 * `.gitmodules`, read off the default branch rather than the checkout, for
 * the same reason the history is.
 */

import { execFileSync } from 'node:child_process';

/**
 * @param {string} text the contents of a .gitmodules file
 * @returns {Array<{ name: string, path: string, url: string }>}
 */
export function parseGitmodules(text) {
  const entries = [];
  let current = null;

  for (const line of String(text ?? '').split('\n')) {
    const trimmed = line.trim();
    const header = /^\[submodule\s+"(.+)"\]$/.exec(trimmed);
    if (header) {
      current = { name: header[1], path: '', url: '' };
      entries.push(current);
      continue;
    }
    if (!current) continue;

    const field = /^(path|url)\s*=\s*(.+)$/.exec(trimmed);
    if (field) current[field[1]] = field[2].trim();
  }

  return entries.filter((entry) => entry.url);
}

/**
 * The repo name a submodule URL points at.
 *
 * Submodule URLs are often relative to the parent's own remote, so the
 * shape of the URL says nothing; the last segment is the repo either way.
 *
 * @param {string} url
 */
export function repoNameFromUrl(url) {
  const withoutQuery = String(url).split(/[?#]/)[0].replace(/\/+$/, '');
  const last = withoutQuery.split('/').pop() ?? '';
  return last.replace(/\.git$/i, '');
}

/**
 * @param {string} text
 * @param {{ known?: Set<string> }} [options] `known` keeps the list to repos
 *   that are actually being drawn; a submodule nobody cloned is not a body
 *   on the graph.
 */
export function submodulesIn(text, { known } = {}) {
  const names = parseGitmodules(text).map((entry) => repoNameFromUrl(entry.url));
  const unique = [...new Set(names.filter(Boolean))];
  return known ? unique.filter((name) => known.has(name)) : unique;
}

/**
 * @param {string} repoPath
 * @param {{ branch?: string, run?: Function }} [options]
 * @returns {string} the .gitmodules of the default branch, or ''
 */
export function readGitmodules(repoPath, { branch = 'HEAD', run = execFileSync } = {}) {
  try {
    return String(
      run('git', ['-C', repoPath, 'show', `${branch}:.gitmodules`], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }),
    );
  } catch {
    // No .gitmodules on that branch, which is the common case.
    return '';
  }
}

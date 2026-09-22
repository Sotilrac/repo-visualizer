/**
 * Find the git repositories under a root and reduce them to one entry per
 * remote.
 *
 * A clone tree double-counts: a repo vendored as a submodule of six
 * superprojects appears six times on disk while being one repository. Keying
 * on the origin URL is what collapses those six back into one.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { toBrowseUrl } from '../../src/shared/remoteUrl.js';

/** Directories that never hold a repo we manage, but often hold a vendored one. */
const SKIP_DIRS = new Set([
  'node_modules',
  'venvs',
  '.venv',
  'venv',
  'toolchains',
  '__pycache__',
  '.cache',
  '.tox',
  'target',
  'vendor',
]);

const SCP_LIKE = /^(?:[^@/]+@)?(?<host>[^:/]+):(?<path>.+)$/;
const URL_LIKE = /^[a-z][a-z0-9+.-]*:\/\/(?:[^@/]+@)?(?<host>[^/:]+)(?::\d+)?\/(?<path>.+)$/i;

/**
 * @typedef {object} DiscoveredRepo
 * @property {string} path      the shallowest checkout of this remote
 * @property {string} name      repo name, from the remote where there is one
 * @property {string | null} owner
 * @property {string | null} host
 * @property {string | null} remote  a browsable https URL
 * @property {string[]} paths   every checkout found, shallowest first
 */

/** @param {string} root */
export function findRepoPaths(root) {
  /** @type {string[]} */
  const found = [];
  walk(path.resolve(root), found);
  return found.sort();
}

/** Shallowest first, so the checkout a dedup keeps is the least buried one. */
function byDepthThenPath(a, b) {
  const depth = a.split(path.sep).length - b.split(path.sep).length;
  return depth !== 0 ? depth : a.localeCompare(b);
}

/**
 * @param {string} dir
 * @param {string[]} found
 */
function walk(dir, found) {
  /** @type {import('node:fs').Dirent[]} */
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory() || entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
    const child = path.join(dir, entry.name);
    if (existsSync(path.join(child, '.git'))) found.push(child);
    else walk(child, found);
  }
}

/** @param {string} repoPath */
function readOrigin(repoPath) {
  try {
    return execFileSync('git', ['-C', repoPath, 'remote', 'get-url', 'origin'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

/** Split a remote into host, owner and name, or nulls when it is not on a host. */
function identify(remote) {
  const match = URL_LIKE.exec(remote) ?? SCP_LIKE.exec(remote);
  if (!match?.groups) return { host: null, owner: null, name: null };

  const trimmed = match.groups.path
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .replace(/\.git$/, '');
  const slash = trimmed.lastIndexOf('/');
  if (slash < 1) return { host: null, owner: null, name: null };

  return {
    host: match.groups.host.toLowerCase(),
    owner: trimmed.slice(0, slash),
    name: trimmed.slice(slash + 1),
  };
}

/**
 * @param {string} root
 * @param {{ owners?: string[] }} [options] restrict to these owners, case-insensitively
 * @returns {DiscoveredRepo[]}
 */
export function discoverRepos(root, { owners = [] } = {}) {
  const wanted = new Set(owners.map((o) => o.toLowerCase()));
  /** @type {Map<string, DiscoveredRepo>} */
  const byRemote = new Map();

  for (const repoPath of findRepoPaths(root).sort(byDepthThenPath)) {
    const origin = readOrigin(repoPath);
    const { host, owner, name } = identify(origin);

    if (wanted.size && !(owner && wanted.has(owner.toLowerCase()))) continue;

    const key = owner ? `${host}/${owner}/${name}`.toLowerCase() : `path:${repoPath}`;
    const seen = byRemote.get(key);
    if (seen) {
      seen.paths.push(repoPath);
      continue;
    }

    byRemote.set(key, {
      path: repoPath,
      name: name ?? path.basename(repoPath),
      owner,
      host,
      remote: toBrowseUrl(origin),
      paths: [repoPath],
    });
  }

  return [...byRemote.values()].sort((a, b) => a.name.localeCompare(b.name));
}

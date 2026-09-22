/**
 * Summarise one repository's history: how much happened, when, and who did it.
 *
 * Cheap on purpose. The scan runs this over a hundred repos to fill in the
 * numbers you read while setting a level of detail, so it reads the log once
 * and never walks a tree or parses a file.
 */

import { execFileSync } from 'node:child_process';
import { shouldIncludeFile } from '../includeFile.mjs';

const RECORD = '\u001e';
const FIELD = '\u001f';

/**
 * @typedef {object} RepoStats
 * @property {number} commits
 * @property {number} files    distinct paths touched, after the analyzer's excludes
 * @property {string | null} first  author date of the oldest commit, as YYYY-MM-DD
 * @property {string | null} last
 * @property {Array<{ name: string, email: string, commits: number }>} identities
 */

/**
 * @param {string} repoPath
 * @param {{ since?: string | null, until?: string | null }} [window]
 * @returns {RepoStats}
 */
export function readRepoStats(repoPath, { since = null, until = null } = {}) {
  const args = [
    '-C',
    repoPath,
    'log',
    '--all',
    '--no-renames',
    '--name-only',
    `--format=${RECORD}%H${FIELD}%aI${FIELD}%aN${FIELD}%aE`,
  ];
  if (since) args.push(`--since=${since}`);
  if (until) args.push(`--until=${until}`);

  let raw = '';
  try {
    raw = execFileSync('git', args, {
      encoding: 'utf8',
      maxBuffer: 512 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    // An empty repository, or one git cannot read. Report zeroes either way.
  }

  /** @type {Map<string, { name: string, email: string, commits: number }>} */
  const identities = new Map();
  const files = new Set();
  let commits = 0;
  let first = null;
  let last = null;

  for (const record of raw.split(RECORD)) {
    if (!record.trim()) continue;
    const [header, ...pathLines] = record.split('\n');
    const [, date, name, email] = header.split(FIELD);
    if (!date) continue;

    commits += 1;
    const day = date.slice(0, 10);
    if (!first || day < first) first = day;
    if (!last || day > last) last = day;

    const key = `${name}\u0000${email}`;
    const seen = identities.get(key);
    if (seen) seen.commits += 1;
    else identities.set(key, { name, email, commits: 1 });

    for (const line of pathLines) {
      const file = line.trim();
      if (file && shouldIncludeFile(file)) files.add(file);
    }
  }

  return {
    commits,
    files: files.size,
    first,
    last,
    identities: [...identities.values()].sort((a, b) => b.commits - a.commits),
  };
}

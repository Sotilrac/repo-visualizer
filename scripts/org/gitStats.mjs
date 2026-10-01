/**
 * Summarise one repository's history: how much happened, when, and who did it.
 *
 * Cheap on purpose. The scan runs this over a hundred repos to fill in the
 * numbers you read while setting a level of detail, so it reads the log once
 * and never walks a tree or parses a file.
 */

import { execFileSync } from 'node:child_process';
import { shouldIncludeFile } from '../includeFile.mjs';
import { personFrom } from './coAuthors.mjs';
import { defaultBranchOf } from './defaultBranch.mjs';

const RECORD = '\u001e';
const FIELD = '\u001f';

/**
 * @typedef {object} RepoStats
 * @property {number} commits
 * @property {number} files    distinct paths touched, after the analyzer's excludes
 * @property {number} folders  distinct folders those files sit in, to the
 *   configured depth; what a level-2 repo would draw
 * @property {string | null} first  author date of the oldest commit, as YYYY-MM-DD
 * @property {string | null} last
 * @property {Array<{ name: string, email: string, commits: number }>} identities
 */

/**
 * @param {string} repoPath
 * @param {{
 *   since?: string | null,
 *   until?: string | null,
 *   folderDepth?: number,
 *   branch?: string,
 * }} [window]
 * @returns {RepoStats}
 */
export function readRepoStats(
  repoPath,
  { since = null, until = null, folderDepth = 2, branch = '' } = {},
) {
  const args = [
    '-C',
    repoPath,
    'log',
    // The branch the dataset will walk, so the counts you read while setting
    // a level of detail describe what will be drawn.
    defaultBranchOf(repoPath, branch),
    '--no-renames',
    '--name-only',
    // The co-authors go on the header line, separated the same way, so the
    // lines after it are still nothing but file paths.
    `--format=${RECORD}%H${FIELD}%aI${FIELD}%aN${FIELD}%aE${FIELD}%(trailers:key=Co-authored-by,valueonly,separator=${FIELD})`,
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
  const folders = new Set();
  let commits = 0;
  let first = null;
  let last = null;

  for (const record of raw.split(RECORD)) {
    if (!record.trim()) continue;
    const [header, ...pathLines] = record.split('\n');
    const [, date, name, email, ...trailers] = header.split(FIELD);
    if (!date) continue;

    commits += 1;
    const day = date.slice(0, 10);
    if (!first || day < first) first = day;
    if (!last || day > last) last = day;

    // The author, and everyone the message names beside them: a squashed
    // pull request is one commit and two people's work.
    const people = [{ name, email }];
    for (const trailer of trailers) {
      const person = personFrom(trailer);
      if (person && person.email !== email.toLowerCase()) people.push(person);
    }

    for (const person of people) {
      const key = `${person.name}\u0000${person.email}`;
      const seen = identities.get(key);
      if (seen) seen.commits += 1;
      else identities.set(key, { ...person, commits: 1 });
    }

    for (const line of pathLines) {
      const file = line.trim();
      if (!file || !shouldIncludeFile(file)) continue;
      files.add(file);
      // The folders a level-2 view would draw: every prefix down to the
      // configured depth, so the editor can show a real count instead of a
      // guess from the file total.
      const parts = file.split('/').slice(0, -1).slice(0, folderDepth);
      for (let i = 1; i <= parts.length; i++) folders.add(parts.slice(0, i).join('/'));
    }
  }

  return {
    commits,
    files: files.size,
    folders: folders.size,
    first,
    last,
    identities: [...identities.values()].sort((a, b) => b.commits - a.commits),
  };
}

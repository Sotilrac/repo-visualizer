/**
 * Walk one repository's history into commits the dataset builder can take.
 *
 * Extracted from the single-repo analyzer so the org analyzer can call it
 * once per repo. Reading git is all it does: it writes no files, loads no
 * config, and prints only through the progress callback, which is what makes
 * it safe to run a hundred of these at once.
 */

import path from 'node:path';
import { simpleGit } from 'simple-git';
import { toBrowseUrl } from '../../src/shared/remoteUrl.js';
import { PARSERS } from '../importParsers.mjs';
import { createImportResolver, loadJsAliases, resolveChangeImports } from '../importResolve.mjs';
import { shouldIncludeFile } from '../includeFile.mjs';
import { coAuthorsIn } from './coAuthors.mjs';
import { defaultBranchOf } from './defaultBranch.mjs';

const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

/** The origin URL, or an empty string when the repo has no origin. */
async function readOrigin(git) {
  try {
    return (await git.raw(['remote', 'get-url', 'origin'])).trim();
  } catch {
    return '';
  }
}

async function getNameStatusMap(git, hash, parentHash) {
  const map = {};
  try {
    const raw = await git.raw(['diff', '--name-status', '--no-renames', parentHash, hash]);
    for (const line of raw.split('\n')) {
      const parts = line.trim().split('\t');
      if (parts.length < 2 || !parts[0]) continue;
      if (parts[1]) map[parts[1]] = parts[0][0]; // D, A, M, T, U
    }
  } catch {
    // Silently fall back; every file is then treated as status 'M'.
  }
  return map;
}

/**
 * @param {string} repoPath
 * @param {{
 *   maxCommits?: number,
 *   since?: string | null,
 *   until?: string | null,
 *   branch?: string,
 *   onProgress?: (done: number, total: number) => void,
 * }} [options]
 * @returns {Promise<{ name: string, remote: string | null, commits: any[], files?: number }>}
 */
export async function walkRepo(
  repoPath,
  { maxCommits = 0, since = null, until = null, branch: wanted = '', onProgress } = {},
) {
  const git = simpleGit(repoPath);
  const branch = defaultBranchOf(repoPath, wanted);

  const logOpts = { '--reverse': null, [branch]: null };
  if (maxCommits) logOpts.maxCount = maxCommits;
  if (since) logOpts['--since'] = since;
  if (until) logOpts['--until'] = until;

  let log;
  try {
    log = await git.log(logOpts);
  } catch {
    // An empty repository, or one git cannot read.
    return { name: path.basename(repoPath), remote: null, commits: [] };
  }
  let commits = log.all;

  if (commits.length > 1) {
    const first = new Date(commits[0].date).getTime();
    const last = new Date(commits[commits.length - 1].date).getTime();
    if (first > last) commits = [...commits].reverse();
  }

  const parentMap = new Map();
  {
    const rawParents = await git.raw([
      'log',
      branch,
      '--format=%H %P',
      ...(maxCommits ? ['-n', String(maxCommits)] : []),
      ...(since ? [`--since=${since}`] : []),
      ...(until ? [`--until=${until}`] : []),
    ]);
    for (const line of rawParents.split('\n')) {
      const parts = line.trim().split(' ');
      if (parts.length < 1 || !parts[0]) continue;
      parentMap.set(parts[0], parts[1] || EMPTY_TREE);
    }
  }

  const allPaths = new Set();
  const out = [];
  let processed = 0;

  for (const commit of commits) {
    processed++;
    onProgress?.(processed, commits.length);

    let diffSummary;
    let nameStatusMap;
    const parent = parentMap.get(commit.hash) ?? EMPTY_TREE;
    try {
      [diffSummary, nameStatusMap] = await Promise.all([
        // --no-renames so a rename is a plain delete and a plain add, and the
        // explicit PARENT CHILD form because HASH^! on a root commit diffs
        // against the working tree on Windows.
        git.diffSummary([parent, commit.hash, '--no-renames']),
        getNameStatusMap(git, commit.hash, parent),
      ]);
    } catch {
      continue;
    }

    const changes = [];
    for (const f of diffSummary.files) {
      const p = f.file;
      if (!shouldIncludeFile(p)) continue;
      allPaths.add(p);
      const parser = PARSERS[path.extname(p).toLowerCase()];
      const isDeleted = nameStatusMap[p] === 'D';

      const change = {
        path: p,
        added: f.insertions ?? 0,
        removed: f.deletions ?? 0,
        binary: !!f.binary,
        status: isDeleted ? 'D' : 'M',
      };

      if (parser && !f.binary && !isDeleted) {
        try {
          change.imports = parser(await git.show([`${commit.hash}:${p}`]));
        } catch {
          // git.show failed although name-status did not flag a deletion,
          // which happens for a submodule or a partial clone.
          change.status = 'D';
        }
      }
      changes.push(change);
    }

    // Anything name-status saw that diffSummary did not: zero-byte files,
    // binary renames on some git versions.
    const processedPaths = new Set(changes.map((c) => c.path));
    for (const [p, st] of Object.entries(nameStatusMap)) {
      if (processedPaths.has(p) || !shouldIncludeFile(p)) continue;
      if (st === 'D') {
        changes.push({ path: p, added: 0, removed: 0, binary: false, status: 'D' });
      } else if (st === 'A') {
        allPaths.add(p);
        const parser = PARSERS[path.extname(p).toLowerCase()];
        const change = { path: p, added: 0, removed: 0, binary: false, status: 'M' };
        if (parser) {
          try {
            change.imports = parser(await git.show([`${commit.hash}:${p}`]));
          } catch {
            change.status = 'D';
          }
        }
        changes.push(change);
      }
    }

    out.push({
      sha: commit.hash,
      shortSha: commit.hash.slice(0, 7),
      date: commit.date,
      author: commit.author_name,
      authorEmail: commit.author_email,
      message: commit.message.split('\n')[0].slice(0, 200),
      // From the trailers in the body: a squashed pull request has one git
      // author and names the rest here.
      coAuthors: coAuthorsIn(`${commit.message}\n${commit.body ?? ''}`),
      stats: {
        filesChanged: changes.length,
        insertions: changes.reduce((a, c) => a + c.added, 0),
        deletions: changes.reduce((a, c) => a + c.removed, 0),
      },
      changes,
    });
  }

  const resolver = createImportResolver(allPaths, { jsAliases: await loadJsAliases(repoPath) });
  for (const commit of out) resolveChangeImports(commit.changes, resolver);

  return {
    name: path.basename(repoPath),
    remote: toBrowseUrl(await readOrigin(git)),
    commits: out,
    files: allPaths.size,
  };
}

/**
 * The branch a repository's history should be read from.
 *
 * Not the checked-out one: in a clone tree each repo is on whatever branch
 * someone last worked on, and one of ours is on a feature branch with 13 of
 * its 701 commits on it. Not every branch either, since that counts
 * abandoned work and rebased duplicates. The default branch is the history
 * the project actually kept.
 */

import { execFileSync } from 'node:child_process';

const CANDIDATES = ['origin/main', 'origin/master', 'main', 'master'];

/** @param {string} repoPath */
function git(repoPath, args) {
  try {
    return execFileSync('git', ['-C', repoPath, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

/**
 * @param {string} repoPath
 * @returns {string} a revision to pass to `git log`
 */
export function defaultBranchOf(repoPath) {
  const declared = git(repoPath, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']);
  if (declared) return declared;

  for (const candidate of CANDIDATES) {
    if (git(repoPath, ['rev-parse', '--verify', '--quiet', candidate])) return candidate;
  }
  return 'HEAD';
}

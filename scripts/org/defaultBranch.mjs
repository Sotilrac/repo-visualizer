/**
 * The branch a repository's history should be read from.
 *
 * Not the checked-out one: in a clone tree each repo is on whatever branch
 * someone last worked on, and one of ours is on a feature branch with 13 of
 * its 701 commits on it. Not every branch either, since that counts
 * abandoned work and rebased duplicates. The default branch is the history
 * the project actually kept.
 *
 * Except where it is not. A project that develops on `develop` and merges
 * to `main` at release has most of its history off the default branch:
 * bendy has 343 commits on develop and 162 on main. So the config may name
 * a branch per repo, and that wins where it exists.
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
 * Whether a repo has this revision, so a config naming a branch that has
 * gone is reported rather than taking the whole repo down.
 *
 * @param {string} repoPath
 * @param {string} rev
 */
export function hasRevision(repoPath, rev) {
  return Boolean(rev) && Boolean(git(repoPath, ['rev-parse', '--verify', '--quiet', rev]));
}

/**
 * @param {string} repoPath
 * @param {string} [wanted] a branch the config asked for
 * @returns {string} a revision to pass to `git log`
 */
export function defaultBranchOf(repoPath, wanted = '') {
  if (wanted) {
    for (const rev of [wanted, `origin/${wanted}`]) {
      if (hasRevision(repoPath, rev)) return rev;
    }
  }

  const declared = git(repoPath, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']);
  if (declared) return declared;

  for (const candidate of CANDIDATES) {
    if (git(repoPath, ['rev-parse', '--verify', '--quiet', candidate])) return candidate;
  }
  return 'HEAD';
}

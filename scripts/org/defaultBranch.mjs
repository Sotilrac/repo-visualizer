/**
 * The branch a repository's history is read from.
 *
 * The config names it per repo, and the scan seeds that from the branch each
 * clone has checked out. Neither of the automatic answers is right on its
 * own: a project that develops on `develop` and merges to `main` at release
 * keeps most of its history off the default branch (bendy has 343 commits on
 * develop and 162 on main), while a clone left on a personal branch reports
 * that branch instead of the project. Only a person knows which is which, so
 * the file records one branch per repo and this resolves it.
 *
 * Whole branches are the unit either way. Reading every branch would count
 * abandoned work and rebased duplicates twice over.
 *
 * What comes out is a full refname. `git log main` is an error in a repo
 * that also has a `main` directory, and one of ours does.
 */

import { execFileSync } from 'node:child_process';

const CANDIDATES = [
  'refs/remotes/origin/main',
  'refs/remotes/origin/master',
  'refs/heads/main',
  'refs/heads/master',
];

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
 * The branch this working copy is on, or '' when the head is detached, which
 * a submodule checkout normally is.
 *
 * @param {string} repoPath
 */
export function checkedOutBranchOf(repoPath) {
  return git(repoPath, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
}

/** Whether `rev` is in the ancestry of `of`. */
function isAncestorOf(repoPath, rev, of) {
  try {
    execFileSync('git', ['-C', repoPath, 'merge-base', '--is-ancestor', rev, of], {
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Local `develop` or `origin/develop`, for a config that named `develop`.
 *
 * They are usually the same commit. Where they are not, the one holding the
 * other is the fuller history: a branch nobody pulled is behind its remote,
 * and one with unpushed work is ahead of it. Diverged, the published side
 * wins, and a config can still name `origin/develop`, a tag or a sha
 * outright, which is what the last line resolves.
 *
 * @param {string} repoPath
 * @param {string} branch
 */
function fullerCopy(repoPath, branch) {
  const of = (ref) => (hasRevision(repoPath, ref) ? ref : '');
  const local = of(`refs/heads/${branch}`);
  const remote = of(`refs/remotes/origin/${branch}`);
  if (local && remote) return isAncestorOf(repoPath, remote, local) ? local : remote;
  return (
    local || remote || git(repoPath, ['rev-parse', '--symbolic-full-name', branch]) || of(branch)
  );
}

/**
 * @param {string} repoPath
 * @param {string} [wanted] a branch the config asked for
 * @returns {string} a revision to pass to `git log`
 */
export function defaultBranchOf(repoPath, wanted = '') {
  if (wanted) {
    const found = fullerCopy(repoPath, wanted);
    if (found) return found;
  }

  const declared = git(repoPath, ['symbolic-ref', 'refs/remotes/origin/HEAD']);
  if (declared) return declared;

  for (const candidate of CANDIDATES) {
    if (hasRevision(repoPath, candidate)) return candidate;
  }
  return 'HEAD';
}

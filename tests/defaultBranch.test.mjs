import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkedOutBranchOf, defaultBranchOf } from '../scripts/org/defaultBranch.mjs';

let dir;
const git = (...args) => execFileSync('git', ['-C', dir, ...args], { stdio: 'pipe' });

function commit(message) {
  writeFileSync(path.join(dir, 'a.js'), `${message}\n`);
  git('add', '-A');
  git('commit', '-qm', message);
}

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'rv-branch-'));
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 't@example.com');
  git('config', 'user.name', 'T');
  commit('first');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('defaultBranchOf', () => {
  it('follows origin/HEAD when the remote declares one', () => {
    git('update-ref', 'refs/remotes/origin/trunk', 'HEAD');
    git('symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/trunk');

    expect(defaultBranchOf(dir)).toBe('refs/remotes/origin/trunk');
  });

  it('falls back to origin/main', () => {
    git('update-ref', 'refs/remotes/origin/main', 'HEAD');

    expect(defaultBranchOf(dir)).toBe('refs/remotes/origin/main');
  });

  it('falls back to origin/master when there is no main', () => {
    git('update-ref', 'refs/remotes/origin/master', 'HEAD');

    expect(defaultBranchOf(dir)).toBe('refs/remotes/origin/master');
  });

  it('prefers main over master when a repo has both', () => {
    git('update-ref', 'refs/remotes/origin/master', 'HEAD');
    git('update-ref', 'refs/remotes/origin/main', 'HEAD');

    expect(defaultBranchOf(dir)).toBe('refs/remotes/origin/main');
  });

  it('uses the local main when there is no remote at all', () => {
    expect(defaultBranchOf(dir)).toBe('refs/heads/main');
  });

  it('ignores the branch that happens to be checked out', () => {
    git('update-ref', 'refs/remotes/origin/main', 'HEAD');
    git('checkout', '-q', '-b', 'a-feature-branch');
    commit('work in progress');

    expect(defaultBranchOf(dir)).toBe('refs/remotes/origin/main');
  });

  it('falls back to HEAD for a repo with no recognisable default', () => {
    git('branch', '-m', 'main', 'something-else');

    expect(defaultBranchOf(dir)).toBe('HEAD');
  });
});

describe('a branch the config asks for', () => {
  it('is used when the repo has it', () => {
    git('branch', 'develop');

    expect(defaultBranchOf(dir, 'develop')).toBe('refs/heads/develop');
  });

  it('is found on the remote when only the remote has it', () => {
    git('update-ref', 'refs/remotes/origin/develop', 'HEAD');

    expect(defaultBranchOf(dir, 'develop')).toBe('refs/remotes/origin/develop');
  });

  it('falls back to the default when the repo has no such branch', () => {
    git('update-ref', 'refs/remotes/origin/main', 'HEAD');

    expect(defaultBranchOf(dir, 'nonexistent')).toBe('refs/remotes/origin/main');
  });

  it('is ignored when the config names none', () => {
    git('branch', 'develop');
    git('update-ref', 'refs/remotes/origin/main', 'HEAD');

    expect(defaultBranchOf(dir, '')).toBe('refs/remotes/origin/main');
  });
});

describe('a branch that exists both locally and on the remote', () => {
  const both = () => {
    git('checkout', '-q', '-b', 'develop');
    commit('shared');
    git('update-ref', 'refs/remotes/origin/develop', 'HEAD');
  };

  it('reads the remote copy when the local one has not been pulled', () => {
    both();
    commit('pushed by someone else');
    git('update-ref', 'refs/remotes/origin/develop', 'HEAD');
    git('reset', '-q', '--hard', 'HEAD~1');

    expect(defaultBranchOf(dir, 'develop')).toBe('refs/remotes/origin/develop');
  });

  it('reads the local copy when it holds work not pushed yet', () => {
    both();
    commit('still local');

    expect(defaultBranchOf(dir, 'develop')).toBe('refs/heads/develop');
  });

  it('prefers the published side when the two have diverged', () => {
    both();
    const base = git('rev-parse', 'HEAD').toString().trim();
    commit('local only');
    git('update-ref', 'refs/remotes/origin/develop', base);
    git('checkout', '-q', '--detach', base);
    commit('remote only');
    git('update-ref', 'refs/remotes/origin/develop', 'HEAD');
    git('checkout', '-q', 'develop');

    expect(defaultBranchOf(dir, 'develop')).toBe('refs/remotes/origin/develop');
  });
});

describe('checkedOutBranchOf', () => {
  it('names the branch the working copy is on', () => {
    git('checkout', '-q', '-b', 'feature/receive');

    expect(checkedOutBranchOf(dir)).toBe('feature/receive');
  });

  it('is empty on a detached head, which a submodule checkout usually is', () => {
    git('checkout', '-q', '--detach', 'HEAD');

    expect(checkedOutBranchOf(dir)).toBe('');
  });
});

describe('a branch whose name is also a path in the working copy', () => {
  // mock-batt has a `main` directory beside its `main` branch, and `git log
  // main` refuses to guess which was meant. The full refname is never
  // ambiguous, which is why that is what this returns.
  it('resolves to something git will read a log from', () => {
    writeFileSync(path.join(dir, 'develop'), 'a directory here in the real case\n');
    git('checkout', '-q', '-b', 'develop');
    commit('on develop, beside the path that collides with it');

    const rev = defaultBranchOf(dir, 'develop');

    expect(rev).toBe('refs/heads/develop');
    expect(git('rev-list', '--count', rev).toString().trim()).toBe('2');
  });
});

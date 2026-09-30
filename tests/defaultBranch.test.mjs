import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defaultBranchOf } from '../scripts/org/defaultBranch.mjs';

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

    expect(defaultBranchOf(dir)).toBe('origin/trunk');
  });

  it('falls back to origin/main', () => {
    git('update-ref', 'refs/remotes/origin/main', 'HEAD');

    expect(defaultBranchOf(dir)).toBe('origin/main');
  });

  it('falls back to origin/master when there is no main', () => {
    git('update-ref', 'refs/remotes/origin/master', 'HEAD');

    expect(defaultBranchOf(dir)).toBe('origin/master');
  });

  it('prefers main over master when a repo has both', () => {
    git('update-ref', 'refs/remotes/origin/master', 'HEAD');
    git('update-ref', 'refs/remotes/origin/main', 'HEAD');

    expect(defaultBranchOf(dir)).toBe('origin/main');
  });

  it('uses the local main when there is no remote at all', () => {
    expect(defaultBranchOf(dir)).toBe('main');
  });

  it('ignores the branch that happens to be checked out', () => {
    git('update-ref', 'refs/remotes/origin/main', 'HEAD');
    git('checkout', '-q', '-b', 'a-feature-branch');
    commit('work in progress');

    expect(defaultBranchOf(dir)).toBe('origin/main');
  });

  it('falls back to HEAD for a repo with no recognisable default', () => {
    git('branch', '-m', 'main', 'something-else');

    expect(defaultBranchOf(dir)).toBe('HEAD');
  });
});

describe('a branch the config asks for', () => {
  it('is used when the repo has it', () => {
    git('branch', 'develop');

    expect(defaultBranchOf(dir, 'develop')).toBe('develop');
  });

  it('is found on the remote when only the remote has it', () => {
    git('update-ref', 'refs/remotes/origin/develop', 'HEAD');

    expect(defaultBranchOf(dir, 'develop')).toBe('origin/develop');
  });

  it('falls back to the default when the repo has no such branch', () => {
    git('update-ref', 'refs/remotes/origin/main', 'HEAD');

    expect(defaultBranchOf(dir, 'nonexistent')).toBe('origin/main');
  });

  it('is ignored when the config names none', () => {
    git('branch', 'develop');
    git('update-ref', 'refs/remotes/origin/main', 'HEAD');

    expect(defaultBranchOf(dir, '')).toBe('origin/main');
  });
});

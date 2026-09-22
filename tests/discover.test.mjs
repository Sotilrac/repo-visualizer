import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { discoverRepos, findRepoPaths } from '../scripts/org/discover.mjs';

let root;

function repo(rel, origin) {
  const dir = path.join(root, rel);
  mkdirSync(dir, { recursive: true });
  const git = (...args) => execFileSync('git', ['-C', dir, ...args], { stdio: 'pipe' });
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 't@example.com');
  git('config', 'user.name', 'T');
  writeFileSync(path.join(dir, 'a.txt'), 'a\n');
  git('add', '-A');
  git('commit', '-qm', 'init');
  if (origin) git('remote', 'add', 'origin', origin);
  return dir;
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'rv-root-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('findRepoPaths', () => {
  it('finds repos nested under plain directories', () => {
    repo('battery', 'git@github.com:Acme/battery.git');
    repo('joe/bendy', 'git@github.com:Acme/bendy.git');

    expect(findRepoPaths(root)).toEqual([path.join(root, 'battery'), path.join(root, 'joe/bendy')]);
  });

  it('stops at the first repo, leaving submodules to git', () => {
    repo('openocd', 'https://example.com/a/openocd');
    repo('openocd/jimtcl', 'https://example.com/b/jimtcl');

    expect(findRepoPaths(root)).toEqual([path.join(root, 'openocd')]);
  });

  it('skips vendor directories', () => {
    repo('node_modules/left-pad', 'https://example.com/a/left-pad');
    repo('app', 'https://example.com/a/app');

    expect(findRepoPaths(root)).toEqual([path.join(root, 'app')]);
  });
});

describe('discoverRepos', () => {
  it('reads the owner and name off the origin remote', () => {
    repo('battery', 'git@github.com:Acme/battery.git');

    expect(discoverRepos(root)).toEqual([
      expect.objectContaining({ host: 'github.com', owner: 'Acme', name: 'battery' }),
    ]);
  });

  it('keeps one entry per remote, preferring the shallowest path', () => {
    repo('shared-lib', 'git@github.com:Acme/shared-lib.git');
    repo('deep/nest/shared-lib', 'git@github.com:Acme/shared-lib.git');

    const found = discoverRepos(root);

    expect(found).toHaveLength(1);
    expect(found[0].path).toBe(path.join(root, 'shared-lib'));
  });

  it('treats the same name under different owners as different repos', () => {
    repo('ours', 'git@github.com:Acme/battery.git');
    repo('theirs', 'git@github.com:Other/battery.git');

    expect(
      discoverRepos(root)
        .map((r) => r.owner)
        .sort(),
    ).toEqual(['Acme', 'Other']);
  });

  it('matches an owner case-insensitively when filtering', () => {
    repo('a', 'git@github.com:Acme/a.git');
    repo('b', 'git@github.com:Other/b.git');

    expect(discoverRepos(root, { owners: ['acme'] }).map((r) => r.name)).toEqual(['a']);
  });

  it('reports a repo with no origin so it is not silently dropped', () => {
    repo('local-only', null);

    expect(discoverRepos(root)).toEqual([
      expect.objectContaining({ name: 'local-only', owner: null, remote: null }),
    ]);
  });

  it('drops a repo with no origin when an owner filter is set', () => {
    repo('local-only', null);
    repo('a', 'git@github.com:Acme/a.git');

    expect(discoverRepos(root, { owners: ['Acme'] }).map((r) => r.name)).toEqual(['a']);
  });

  it('records a browsable remote url', () => {
    repo('battery', 'git@github.com:Acme/battery.git');

    expect(discoverRepos(root)[0].remote).toBe('https://github.com/Acme/battery');
  });

  it('sorts by name so the generated config has a stable order', () => {
    repo('zebra', 'git@github.com:Acme/zebra.git');
    repo('alpha', 'git@github.com:Acme/alpha.git');

    expect(discoverRepos(root).map((r) => r.name)).toEqual(['alpha', 'zebra']);
  });
});

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { walkRepo } from '../scripts/org/walkRepo.mjs';

let dir;
const git = (...args) => execFileSync('git', ['-C', dir, ...args], { stdio: 'pipe' });

function write(rel, body) {
  const full = path.join(dir, rel);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, body);
}

/** @param {string} message @param {{ date?: string }} [options] */
function commit(message, { date } = {}) {
  git('add', '-A');
  const env = { ...process.env };
  if (date) {
    env.GIT_AUTHOR_DATE = date;
    env.GIT_COMMITTER_DATE = date;
  }
  execFileSync('git', ['-C', dir, 'commit', '-qm', message], { stdio: 'pipe', env });
}

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'rv-walk-'));
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'ada@acme.com');
  git('config', 'user.name', 'Ada');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('walkRepo', () => {
  it('returns the commits oldest first', async () => {
    write('src/a.js', 'export const a = 1;\n');
    commit('first');
    write('src/b.js', 'export const b = 2;\n');
    commit('second');

    const walked = await walkRepo(dir);

    expect(walked.commits.map((c) => c.message)).toEqual(['first', 'second']);
  });

  it('names the repo after its directory and reads its remote', async () => {
    write('src/a.js', 'x\n');
    commit('first');
    git('remote', 'add', 'origin', 'git@github.com:Acme/thing.git');

    const walked = await walkRepo(dir);

    expect(walked.name).toBe(path.basename(dir));
    expect(walked.remote).toBe('https://github.com/Acme/thing');
  });

  it('resolves an import between two files', async () => {
    write('src/a.js', "import { b } from './b.js';\n");
    write('src/b.js', 'export const b = 1;\n');
    commit('first');

    const change = (await walkRepo(dir)).commits[0].changes.find((c) => c.path === 'src/a.js');

    expect(change.resolvedImports).toEqual(['src/b.js']);
  });

  it('marks a deletion', async () => {
    write('src/a.js', 'x\n');
    commit('first');
    rmSync(path.join(dir, 'src/a.js'));
    commit('remove');

    const change = (await walkRepo(dir)).commits[1].changes.find((c) => c.path === 'src/a.js');

    expect(change.status).toBe('D');
  });

  it('honours a since cutoff', async () => {
    write('a.js', '1\n');
    commit('old', { date: '2019-01-01T10:00:00+00:00' });
    write('b.js', '2\n');
    commit('new', { date: '2023-01-01T10:00:00+00:00' });

    const walked = await walkRepo(dir, { since: '2020-01-01' });

    expect(walked.commits.map((c) => c.message)).toEqual(['new']);
  });

  it('honours an until cutoff', async () => {
    write('a.js', '1\n');
    commit('old', { date: '2019-01-01T10:00:00+00:00' });
    write('b.js', '2\n');
    commit('new', { date: '2023-01-01T10:00:00+00:00' });

    expect((await walkRepo(dir, { until: '2020-01-01' })).commits).toHaveLength(1);
  });

  it('counts the files it saw', async () => {
    write('src/a.js', '1\n');
    write('src/b.js', '2\n');
    commit('first');

    expect((await walkRepo(dir)).files).toBe(2);
  });

  it('excludes what the analyzer always excludes', async () => {
    write('src/a.js', '1\n');
    write('node_modules/dep/index.js', '1\n');
    commit('first');

    expect((await walkRepo(dir)).commits[0].changes.map((c) => c.path)).toEqual(['src/a.js']);
  });

  it('returns nothing for an empty repository rather than throwing', async () => {
    const walked = await walkRepo(dir);

    expect(walked.commits).toEqual([]);
  });

  it('reports progress, so a long walk can be watched', async () => {
    write('a.js', '1\n');
    commit('first');
    const seen = [];

    await walkRepo(dir, { onProgress: (done, total) => seen.push([done, total]) });

    expect(seen).toEqual([[1, 1]]);
  });
});

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readRepoStats } from '../scripts/org/gitStats.mjs';

let dir;
const git = (...args) => execFileSync('git', ['-C', dir, ...args], { stdio: 'pipe' });

/**
 * @param {string} message
 * @param {Record<string, string>} files
 * @param {{ author?: string, date?: string }} [options]
 */
function commit(message, files, { author, date } = {}) {
  for (const [name, body] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    writeFileSync(path.join(dir, name), body);
  }
  git('add', '-A');
  const env = { ...process.env };
  if (date) {
    env.GIT_AUTHOR_DATE = date;
    env.GIT_COMMITTER_DATE = date;
  }
  const args = ['commit', '-qm', message];
  if (author) args.push('--author', author);
  execFileSync('git', ['-C', dir, ...args], { stdio: 'pipe', env });
}

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'rv-stats-'));
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'default@example.com');
  git('config', 'user.name', 'Default');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('readRepoStats', () => {
  it('counts commits and the files they touched', () => {
    commit('one', { 'a.js': 'a\n' });
    commit('two', { 'b.js': 'b\n' });

    const stats = readRepoStats(dir);

    expect(stats.commits).toBe(2);
    expect(stats.files).toBe(2);
  });

  it('counts a file touched twice only once', () => {
    commit('one', { 'a.js': 'a\n' });
    commit('two', { 'a.js': 'aa\n' });

    expect(readRepoStats(dir).files).toBe(1);
  });

  it('reports the first and last author dates as plain dates', () => {
    commit('one', { 'a.txt': 'a\n' }, { date: '2021-03-04T10:00:00+00:00' });
    commit('two', { 'b.txt': 'b\n' }, { date: '2023-07-19T10:00:00+00:00' });

    const stats = readRepoStats(dir);

    expect(stats.first).toBe('2021-03-04');
    expect(stats.last).toBe('2023-07-19');
  });

  it('lists each author with their commit count', () => {
    commit('one', { 'a.txt': 'a\n' }, { author: 'Ada <ada@acme.com>' });
    commit('two', { 'b.txt': 'b\n' }, { author: 'Ada <ada@acme.com>' });
    commit('three', { 'c.txt': 'c\n' }, { author: 'Bo <bo@acme.com>' });

    const byEmail = Object.fromEntries(
      readRepoStats(dir).identities.map((i) => [i.email, i.commits]),
    );

    expect(byEmail).toEqual({ 'ada@acme.com': 2, 'bo@acme.com': 1 });
  });

  it('keeps two spellings of one address apart, for the bucketer to merge', () => {
    commit('one', { 'a.txt': 'a\n' }, { author: 'Ada Lovelace <ada@acme.com>' });
    commit('two', { 'b.txt': 'b\n' }, { author: 'ada <ada@acme.com>' });

    expect(readRepoStats(dir).identities).toHaveLength(2);
  });

  it('honours a since cutoff', () => {
    commit('old', { 'a.txt': 'a\n' }, { date: '2019-01-01T10:00:00+00:00' });
    commit('new', { 'b.txt': 'b\n' }, { date: '2023-01-01T10:00:00+00:00' });

    const stats = readRepoStats(dir, { since: '2020-01-01' });

    expect(stats.commits).toBe(1);
    expect(stats.first).toBe('2023-01-01');
  });

  it('honours an until cutoff', () => {
    commit('old', { 'a.txt': 'a\n' }, { date: '2019-01-01T10:00:00+00:00' });
    commit('new', { 'b.txt': 'b\n' }, { date: '2023-01-01T10:00:00+00:00' });

    expect(readRepoStats(dir, { until: '2020-01-01' }).commits).toBe(1);
  });

  it('ignores files the analyzer excludes', () => {
    commit('one', { 'src/a.js': 'a\n', 'node_modules/dep/index.js': 'x\n', 'README.md': '# hi\n' });

    expect(readRepoStats(dir).files).toBe(1);
  });

  it('reports an empty window without throwing', () => {
    commit('one', { 'a.txt': 'a\n' }, { date: '2019-01-01T10:00:00+00:00' });

    expect(readRepoStats(dir, { since: '2030-01-01' })).toMatchObject({
      commits: 0,
      files: 0,
      first: null,
      last: null,
      identities: [],
    });
  });

  it('reports an empty repository without throwing', () => {
    expect(readRepoStats(dir).commits).toBe(0);
  });
});

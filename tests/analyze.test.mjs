/**
 * End-to-end analyzer run against a throwaway repository built with real git.
 * No network, no credentials, nothing read from outside the temp directory.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const analyzer = path.resolve(fileURLToPath(new URL('../scripts/analyze.mjs', import.meta.url)));

let repo;
let out;

function git(...args) {
  execFileSync('git', ['-C', repo, ...args], { stdio: 'pipe' });
}

function write(rel, body) {
  const full = path.join(repo, rel);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, body);
}

function commit(message) {
  git('add', '-A');
  git('commit', '-q', '-m', message);
}

function analyze(...flags) {
  execFileSync('node', [analyzer, repo, `--out=${out}`, ...flags], { stdio: 'pipe' });
  return JSON.parse(readFileSync(out, 'utf8'));
}

beforeEach(() => {
  repo = mkdtempSync(path.join(tmpdir(), 'rv-repo-'));
  out = path.join(mkdtempSync(path.join(tmpdir(), 'rv-out-')), 'history.json');
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'Test Author');
  git('config', 'commit.gpgsign', 'false');
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
  // The analyzer copies a discovered config into the visualizer's own public/
  // directory as a side effect. Undo it so a test run leaves no trace here.
  rmSync(
    path.resolve(fileURLToPath(new URL('../public/repovisualizer.config.json', import.meta.url))),
    {
      force: true,
    },
  );
});

describe('analyzing a repository', () => {
  it('records one entry per commit, oldest first', () => {
    write('src/a.js', 'export const a = 1;\n');
    commit('first');
    write('src/b.js', 'export const b = 2;\n');
    commit('second');

    const data = analyze();

    expect(data.totalCommits).toBe(2);
    expect(data.commits.map((c) => c.message)).toEqual(['first', 'second']);
  });

  it('carries the author name and email through', () => {
    write('src/a.js', 'export const a = 1;\n');
    commit('first');

    const [first] = analyze().commits;

    expect(first.author).toBe('Test Author');
    expect(first.authorEmail).toBe('test@example.com');
  });

  it('attributes the root commit to its own files only', () => {
    write('src/a.js', 'export const a = 1;\n');
    commit('first');

    const [first] = analyze().commits;

    expect(first.changes.map((c) => c.path)).toEqual(['src/a.js']);
  });

  it('resolves a relative import into an edge between two files', () => {
    write('src/a.js', "import { b } from './b.js';\nexport const a = b;\n");
    write('src/b.js', 'export const b = 2;\n');
    commit('first');

    const change = analyze().commits[0].changes.find((c) => c.path === 'src/a.js');

    expect(change.resolvedImports).toEqual(['src/b.js']);
  });

  it('drops an import that points outside the repository', () => {
    write('src/a.js', "import React from 'react';\n");
    commit('first');

    const change = analyze().commits[0].changes.find((c) => c.path === 'src/a.js');

    expect(change.resolvedImports).toEqual([]);
  });

  it('marks a deleted file with status D', () => {
    write('src/a.js', 'export const a = 1;\n');
    commit('first');
    rmSync(path.join(repo, 'src/a.js'));
    commit('remove a');

    const change = analyze().commits[1].changes.find((c) => c.path === 'src/a.js');

    expect(change.status).toBe('D');
  });

  it('reports a rename as a deletion and an addition, never a combined path', () => {
    write('src/old.js', 'export const a = 1;\n');
    commit('first');
    git('mv', 'src/old.js', 'src/new.js');
    commit('rename');

    const paths = Object.fromEntries(analyze().commits[1].changes.map((c) => [c.path, c.status]));

    expect(paths).toEqual({ 'src/old.js': 'D', 'src/new.js': 'M' });
  });

  it('excludes the built-in ignored paths', () => {
    write('src/a.js', 'export const a = 1;\n');
    write('node_modules/dep/index.js', 'module.exports = 1;\n');
    write('README.md', '# hi\n');
    commit('first');

    expect(analyze().commits[0].changes.map((c) => c.path)).toEqual(['src/a.js']);
  });

  it('applies the exclude patterns from the analyzed repo config', () => {
    write('src/a.js', 'export const a = 1;\n');
    write('legacy/old.js', 'export const old = 1;\n');
    write('repovisualizer.config.json', JSON.stringify({ exclude: ['legacy/**'] }));
    commit('first');

    const data = analyze();
    const paths = data.commits[0].changes.map((c) => c.path);

    expect(paths).toContain('src/a.js');
    expect(paths).not.toContain('legacy/old.js');
    expect(data.exclude).toContain('legacy/**');
  });

  it('keeps only the most recent commits under --max', () => {
    for (const n of [1, 2, 3]) {
      write('src/a.js', `export const a = ${n};\n`);
      commit(`commit ${n}`);
    }

    const data = analyze('--max=2');

    expect(data.commits.map((c) => c.message)).toEqual(['commit 2', 'commit 3']);
  });

  it('counts insertions and deletions per commit', () => {
    write('src/a.js', 'one\ntwo\nthree\n');
    commit('first');
    write('src/a.js', 'one\n');
    commit('trim');

    expect(analyze().commits[1].stats).toMatchObject({ filesChanged: 1, deletions: 2 });
  });

  it('exits with an error when the path is not a repository', () => {
    const notARepo = mkdtempSync(path.join(tmpdir(), 'rv-plain-'));
    expect(() => execFileSync('node', [analyzer, notARepo], { stdio: 'pipe' })).toThrow();
    rmSync(notARepo, { recursive: true, force: true });
  });
});

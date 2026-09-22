import { describe, expect, it } from 'vitest';
import { expandDataset, shardsForWindow } from '../src/engine/expandDataset.js';

const manifest = {
  window: { since: '2020-10-22', until: null },
  repos: [
    { name: 'battery', remote: 'https://github.com/Acme/battery', commits: 2, files: 2 },
    { name: 'core', remote: null, commits: 1, files: 1 },
  ],
  authors: [
    { name: 'Ada', email: 'ada@acme.com' },
    { name: 'Bo', email: 'bo@acme.com' },
  ],
  paths: ['battery/src/a.js', 'battery/src/b.js', 'core/src/c.js'],
  shards: [
    { year: 2021, file: 'shards/2021.json', commits: 2 },
    { year: 2022, file: 'shards/2022.json', commits: 1 },
  ],
};

const shards = {
  2021: {
    commits: [
      { t: 1609502400, r: 0, a: 0, sha: 'aaa1111', m: 'first', c: [[0, 10, 2, 0, [1]]] },
      { t: 1609506000, r: 1, a: 1, sha: 'bbb2222', m: 'second', c: [[2, 1, 0, 1]] },
    ],
  },
  2022: {
    commits: [{ t: 1641038400, r: 0, a: 0, sha: 'ccc3333', m: 'third', c: [[1, 4, 4, 0]] }],
  },
};

describe('expandDataset', () => {
  const dataset = expandDataset(manifest, shards);

  it('lists every repo, so the header can name them', () => {
    expect(dataset.repos).toEqual([
      { name: 'battery', remote: 'https://github.com/Acme/battery' },
      { name: 'core', remote: null },
    ]);
  });

  it('puts every commit in one timeline, oldest first', () => {
    expect(dataset.commits.map((c) => c.message)).toEqual(['first', 'second', 'third']);
  });

  it('qualifies a path by its repo, so the repo becomes the cluster', () => {
    expect(dataset.commits[0].changes[0].path).toBe('battery/src/a.js');
  });

  it('restores the author name and address', () => {
    expect(dataset.commits[0]).toMatchObject({ author: 'Ada', authorEmail: 'ada@acme.com' });
  });

  it('restores the counts', () => {
    expect(dataset.commits[0].changes[0]).toMatchObject({ added: 10, removed: 2 });
  });

  it('restores a deletion', () => {
    expect(dataset.commits[1].changes[0].status).toBe('D');
  });

  it('leaves a modification as M', () => {
    expect(dataset.commits[0].changes[0].status).toBe('M');
  });

  it('restores an import as a qualified path', () => {
    expect(dataset.commits[0].changes[0].resolvedImports).toEqual(['battery/src/b.js']);
  });

  it('gives a change with no imports an empty list, which is what the graph reads', () => {
    expect(dataset.commits[2].changes[0].resolvedImports).toEqual([]);
  });

  it('turns the time back into a date the app can format', () => {
    expect(new Date(dataset.commits[0].date).getUTCFullYear()).toBe(2021);
  });

  it('carries a short sha for the commit card', () => {
    expect(dataset.commits[0].shortSha).toBe('aaa1111');
  });

  it('names itself after the config window rather than one repo', () => {
    expect(dataset.repo).toBe('2 repos');
  });

  it('names a single repo after itself', () => {
    const one = expandDataset(
      { ...manifest, repos: [manifest.repos[0]] },
      { 2021: { commits: [] } },
    );

    expect(one.repo).toBe('battery');
  });

  it('copes with a shard that failed to load', () => {
    const partial = expandDataset(manifest, { 2021: shards[2021] });

    expect(partial.commits).toHaveLength(2);
  });
});

describe('shardsForWindow', () => {
  it('takes every shard when the window is open', () => {
    expect(shardsForWindow(manifest.shards, {})).toEqual(['shards/2021.json', 'shards/2022.json']);
  });

  it('skips a year entirely before the window', () => {
    expect(shardsForWindow(manifest.shards, { since: '2022-01-01' })).toEqual(['shards/2022.json']);
  });

  it('skips a year entirely after it', () => {
    expect(shardsForWindow(manifest.shards, { until: '2021-12-31' })).toEqual(['shards/2021.json']);
  });

  it('keeps the year a boundary falls inside', () => {
    expect(shardsForWindow(manifest.shards, { since: '2021-06-01' })).toEqual([
      'shards/2021.json',
      'shards/2022.json',
    ]);
  });
});

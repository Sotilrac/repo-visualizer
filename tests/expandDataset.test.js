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
      { name: 'battery', remote: 'https://github.com/Acme/battery', lod: 1 },
      { name: 'core', remote: null, lod: 1 },
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

describe('the stats the commit card reads', () => {
  const dataset = expandDataset(manifest, shards);

  it('counts the files a commit changed', () => {
    expect(dataset.commits[0].stats.filesChanged).toBe(1);
  });

  it('adds up the insertions and deletions', () => {
    expect(dataset.commits[0].stats).toMatchObject({ insertions: 10, deletions: 2 });
  });

  it('is present on every commit, not only the ones with changes', () => {
    const empty = expandDataset(manifest, {
      2021: { commits: [{ t: 1609502400, r: 0, a: 0, sha: 'ddd4444', m: 'nothing', c: [] }] },
    });

    expect(empty.commits[0].stats).toEqual({ filesChanged: 0, insertions: 0, deletions: 0 });
  });
});

describe('the drawing settings', () => {
  const withLod = {
    ...manifest,
    folderDepth: 3,
    repos: [
      { name: 'battery', remote: null, lod: 3 },
      { name: 'core', remote: null, lod: 1, project: 'power' },
    ],
  };

  it('carries the level of detail per repo', () => {
    const dataset = expandDataset(withLod, shards);

    expect(dataset.repos.map((r) => r.lod)).toEqual([3, 1]);
  });

  it('carries the project a repo belongs to', () => {
    expect(expandDataset(withLod, shards).repos[1].project).toBe('power');
  });

  it('carries the folder depth', () => {
    expect(expandDataset(withLod, shards).folderDepth).toBe(3);
  });

  it('defaults both when an older dataset does not say', () => {
    const dataset = expandDataset(manifest, shards);

    expect(dataset.folderDepth).toBe(2);
    expect(dataset.repos[0].lod).toBe(1);
  });
});

describe('the people a commit names beside its author', () => {
  const manifest = {
    paths: ['battery/cell.c'],
    authors: [
      { name: 'Ada Lovelace', email: 'ada@acme.com' },
      { name: 'Grace Hopper', email: 'grace@acme.com' },
      { name: 'Alan Turing', email: 'alan@acme.com' },
    ],
    repos: [{ name: 'battery' }],
  };
  const shards = {
    2021: {
      commits: [
        { t: 1609459200, r: 0, a: 0, co: [1, 2], sha: 'aaa', m: 'paired', c: [[0, 3, 1, 0]] },
        { t: 1609545600, r: 0, a: 0, sha: 'bbb', m: 'alone', c: [[0, 1, 0, 0]] },
      ],
    },
  };

  const { commits } = expandDataset(manifest, shards);

  it('hands the app everyone the commit named', () => {
    expect(commits[0].coAuthors).toEqual([
      { name: 'Grace Hopper', email: 'grace@acme.com' },
      { name: 'Alan Turing', email: 'alan@acme.com' },
    ]);
  });

  it('leaves an ordinary commit with nobody beside its author', () => {
    expect(commits[1].coAuthors).toEqual([]);
  });

  it('still reports the git author as the author', () => {
    expect(commits[0].author).toBe('Ada Lovelace');
  });
});

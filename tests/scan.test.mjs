import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildScan, parseArgs } from '../scripts/scan.mjs';

const emptyStats = { commits: 0, files: 0, folders: 0, first: null, last: null, identities: [] };

describe('parseArgs', () => {
  it('takes the root from the first positional argument', () => {
    expect(parseArgs(['/tmp/tree']).root).toBe('/tmp/tree');
  });

  it('splits comma-separated owners', () => {
    expect(parseArgs(['.', '--owners=Acme, Globex']).owners).toEqual(['Acme', 'Globex']);
  });

  it('has no config until one is named, so none is ever written inside this repo', () => {
    expect(parseArgs(['.']).config).toBeNull();
  });

  it('resolves --config to an absolute path', () => {
    expect(parseArgs(['.', '--config=out/viz.yaml']).config).toBe(path.resolve('out/viz.yaml'));
  });

  it('reads the window cutoffs', () => {
    const args = parseArgs(['.', '--since=2020-10-22', '--until=2026-01-01']);

    expect([args.since, args.until]).toEqual(['2020-10-22', '2026-01-01']);
  });

  it('leaves the window open when no cutoff is given', () => {
    expect(parseArgs(['.']).since).toBeNull();
  });
});

describe('buildScan', () => {
  const discovered = [
    {
      path: '/t/battery',
      name: 'battery',
      owner: 'Acme',
      host: 'github.com',
      remote: 'https://github.com/Acme/battery',
      paths: [],
    },
    {
      path: '/t/pace',
      name: 'toolbox',
      owner: 'Acme',
      host: 'github.com',
      remote: 'https://github.com/Acme/pace',
      paths: [],
    },
  ];

  const stats = (repoPath) =>
    repoPath === '/t/battery'
      ? {
          commits: 3,
          files: 9,
          folders: 2,
          first: '2021-01-01',
          last: '2023-01-01',
          identities: [
            { name: 'Ada', email: 'ada@acme.com', commits: 2 },
            { name: 'Bo', email: 'bo@outside.com', commits: 1 },
          ],
        }
      : {
          commits: 1,
          files: 2,
          folders: 1,
          first: '2022-01-01',
          last: '2022-01-01',
          identities: [{ name: 'ada', email: 'ada@acme.com', commits: 1 }],
        };

  it('writes one repo row per discovered repo, with its counts', () => {
    expect(buildScan(discovered, stats).repos).toEqual([
      {
        name: 'battery',
        remote: 'https://github.com/Acme/battery',
        commits: 3,
        files: 9,
        folders: 2,
        first: '2021-01-01',
        last: '2023-01-01',
      },
      {
        name: 'toolbox',
        remote: 'https://github.com/Acme/pace',
        commits: 1,
        files: 2,
        folders: 1,
        first: '2022-01-01',
        last: '2022-01-01',
      },
    ]);
  });

  it('merges one person across repos and sums their commits', () => {
    const ada = buildScan(discovered, stats).people.find((p) => p.id === 'ada');

    expect(ada.commits).toBe(3);
  });

  const teams = [
    { id: 'acme', name: 'Acme', domains: ['acme.com'] },
    { id: 'external', name: 'External', domains: [] },
  ];

  it('proposes a team per person', () => {
    const people = buildScan(discovered, stats, { teams }).people;

    expect(Object.fromEntries(people.map((p) => [p.id, p.team]))).toEqual({
      ada: 'acme',
      bo: 'external',
    });
  });

  it('carries the window through to the config', () => {
    expect(buildScan(discovered, stats, { since: '2020-10-22' }).window).toEqual({
      since: '2020-10-22',
      until: null,
    });
  });

  it('keeps a repo with no history, so it can still be set to lod 0', () => {
    expect(buildScan([discovered[0]], () => emptyStats).repos[0].commits).toBe(0);
  });
});

import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseArgs, selectRepos, writeShards } from '../scripts/analyze-org.mjs';

const discovered = [
  { name: 'battery', path: '/t/battery', remote: 'https://github.com/Acme/battery' },
  { name: 'core', path: '/t/core', remote: null },
  { name: 'vendored', path: '/t/vendored', remote: null },
];

describe('selectRepos', () => {
  it('walks a repo the config has never seen', () => {
    expect(selectRepos(discovered, {}).map((r) => r.name)).toEqual(['battery', 'core', 'vendored']);
  });

  it('skips one set to level 0', () => {
    const config = { repos: [{ name: 'vendored', lod: 0 }] };

    expect(selectRepos(discovered, config).map((r) => r.name)).toEqual(['battery', 'core']);
  });

  it('keeps one set to any drawn level', () => {
    const config = {
      repos: [
        { name: 'battery', lod: 3 },
        { name: 'core', lod: 1 },
      ],
    };

    expect(selectRepos(discovered, config)).toHaveLength(3);
  });

  it('carries the project through, so the dataset can group by it', () => {
    const config = { repos: [{ name: 'battery', lod: 2, project: 'power' }] };

    expect(selectRepos(discovered, config)[0].project).toBe('power');
  });

  it('keeps the path to walk and the remote to link', () => {
    expect(selectRepos(discovered, {})[0]).toMatchObject({
      path: '/t/battery',
      remote: 'https://github.com/Acme/battery',
    });
  });
});

describe('parseArgs', () => {
  it('has no config until one is named', () => {
    const previous = process.env.REPO_VIZ_CONFIG;
    process.env.REPO_VIZ_CONFIG = '';
    expect(parseArgs([]).config).toBeNull();
    if (previous) process.env.REPO_VIZ_CONFIG = previous;
  });

  it('takes a root override', () => {
    expect(parseArgs(['--root=/srv/src']).root).toBe('/srv/src');
  });

  it('defaults the output beside the app', () => {
    expect(parseArgs([]).out.endsWith('public/data')).toBe(true);
  });

  it('caps the parallelism at something a laptop survives', () => {
    expect(parseArgs([]).jobs).toBeLessThanOrEqual(8);
  });

  it('takes a jobs override', () => {
    expect(parseArgs(['--jobs=2']).jobs).toBe(2);
  });
});

describe('writeShards', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'shards-'));

  it('writes a file per year', () => {
    writeShards(dir, { 2021: { commits: [] }, 2022: { commits: [] } });

    expect(readdirSync(dir).sort()).toEqual(['2021.json', '2022.json']);
  });

  it('takes away a year this run did not produce', () => {
    writeShards(dir, { 2021: { commits: [] }, 2022: { commits: [] } });
    writeShards(dir, { 2022: { commits: [] } });

    expect(readdirSync(dir)).toEqual(['2022.json']);
  });

  it('leaves the directory empty when there is nothing to write', () => {
    writeShards(dir, { 2022: { commits: [] } });
    writeShards(dir, {});

    expect(readdirSync(dir)).toEqual([]);
  });

  it('makes the directory when it is not there yet', () => {
    const fresh = path.join(dir, 'nested', 'shards');
    writeShards(fresh, { 2020: { commits: [] } });

    expect(readdirSync(fresh)).toEqual(['2020.json']);
  });
});

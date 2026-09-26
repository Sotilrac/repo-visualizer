#!/usr/bin/env node
/**
 * Analyze every repo a config names, into one dataset.
 *
 * Usage:
 *   node scripts/analyze-org.mjs --config=<path> [--out=public/data] [--jobs=N]
 *
 * Repos set to `lod: 0` are skipped, which is what that setting is for: the
 * cheapest way to leave a vendored fork out is not to walk it. The window
 * comes from the config, so the same cutoffs drive the scan and the dataset.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { setCustomExcludes } from './includeFile.mjs';
import { buildDataset } from './org/dataset.mjs';
import { discoverRepos } from './org/discover.mjs';
import { walkRepo } from './org/walkRepo.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** @param {string[]} argv */
export function parseArgs(argv) {
  const flags = Object.fromEntries(
    argv
      .filter((a) => a.startsWith('--'))
      .map((a) => {
        const [key, ...rest] = a.replace(/^--/, '').split('=');
        return [key, rest.length ? rest.join('=') : true];
      }),
  );
  const str = (value) => (typeof value === 'string' ? value : undefined);
  const config = str(flags.config) ?? process.env.REPO_VIZ_CONFIG;

  return {
    config: config ? path.resolve(config) : null,
    root: str(flags.root) ?? process.env.ROOT ?? null,
    out: path.resolve(str(flags.out) ?? path.join(repoRoot, 'public', 'data')),
    jobs: Number(str(flags.jobs) ?? Math.min(8, os.availableParallelism?.() ?? 4)),
  };
}

/**
 * The repos to walk: discovered on disk, minus the ones the config hides.
 *
 * @param {Array<{ name: string }>} discovered
 * @param {{
 *   repos?: Array<{ name: string, lod?: number, project?: string, submodules?: string[] }>,
 * }} config
 */
export function selectRepos(discovered, config) {
  const settings = new Map((config.repos ?? []).map((repo) => [repo.name, repo]));
  return discovered
    .filter((repo) => (settings.get(repo.name)?.lod ?? 1) > 0)
    .map((repo) => ({
      ...repo,
      lod: settings.get(repo.name)?.lod ?? 1,
      project: settings.get(repo.name)?.project,
      submodules: settings.get(repo.name)?.submodules,
    }));
}

/** Run `work` over `items`, `limit` at a time. */
async function inParallel(items, limit, work) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await work(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.config) {
    console.error('No config path. Pass --config=<path> or set REPO_VIZ_CONFIG.');
    process.exit(1);
  }

  const config = parse(readFileSync(args.config, 'utf8')) ?? {};
  const root = args.root ?? config.root;
  if (!root) {
    console.error('No clone tree. Pass --root=<path>, or set ROOT.');
    process.exit(1);
  }

  const window = config.window ?? { since: null, until: null };
  setCustomExcludes(config.exclude ?? []);

  const discovered = discoverRepos(path.resolve(root), { owners: config.owners ?? [] });
  const selected = selectRepos(discovered, config);
  console.log(`${selected.length} repos to walk, of ${discovered.length} found`);

  let done = 0;
  const histories = await inParallel(selected, args.jobs, async (repo) => {
    const result = await walkRepo(repo.path, { since: window.since, until: window.until });
    done += 1;
    process.stdout.write(`\r  ${done}/${selected.length} repos`);
    return {
      ...result,
      name: repo.name,
      remote: repo.remote,
      lod: repo.lod,
      project: repo.project,
      submodules: repo.submodules,
    };
  });
  process.stdout.write('\n');

  const { manifest, shards } = buildDataset(histories, {
    window,
    folderDepth: config.defaults?.folderDepth ?? 2,
  });

  mkdirSync(path.join(args.out, 'shards'), { recursive: true });
  writeFileSync(path.join(args.out, 'manifest.json'), JSON.stringify(manifest));
  for (const [year, shard] of Object.entries(shards)) {
    writeFileSync(path.join(args.out, 'shards', `${year}.json`), JSON.stringify(shard));
  }

  const commits = manifest.shards.reduce((sum, s) => sum + s.commits, 0);
  console.log(
    `${commits} commits, ${manifest.paths.length} paths, ${manifest.authors.length} authors`,
  );
  console.log(`${manifest.shards.length} shards written to ${args.out}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('\nAnalysis failed:', err);
    process.exit(1);
  });
}

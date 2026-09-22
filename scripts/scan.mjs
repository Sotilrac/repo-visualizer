#!/usr/bin/env node
/**
 * Write or refresh a visualization config from a tree of clones.
 *
 * Usage:
 *   node scripts/scan.mjs <root> --config=<path> [--owners=A,B]
 *                                [--since=YYYY-MM-DD] [--until=YYYY-MM-DD] [--repropose]
 *
 * Reads every repo under <root>, collapses the ones that are the same remote,
 * and merges what it finds into the config. Your edits and comments survive.
 *
 * The config lives outside this repository. It names contributors and their
 * email addresses, while this repository is the generic tool, with no data of
 * its own. Set REPO_VIZ_CONFIG to avoid passing --config every time.
 */

import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverRepos } from './org/discover.mjs';
import { readRepoStats } from './org/gitStats.mjs';
import { applyMergeList, bucketIdentities, slugFor } from './org/identities.mjs';
import { DEFAULT_TEAMS, proposeTeam } from './org/teams.mjs';
import { loadConfig, mergeScan, writeConfig } from './org/vizConfig.mjs';

/** @param {string[]} argv */
export function parseArgs(argv) {
  const positional = argv.filter((a) => !a.startsWith('--'));
  const flags = Object.fromEntries(
    argv
      .filter((a) => a.startsWith('--'))
      .map((a) => {
        const [key, ...rest] = a.replace(/^--/, '').split('=');
        return [key, rest.length ? rest.join('=') : true];
      }),
  );
  const str = (value) => (typeof value === 'string' ? value : undefined);
  const list = (value) =>
    str(value)
      ?.split(',')
      .map((s) => s.trim())
      .filter(Boolean) ?? [];

  const config = str(flags.config) ?? process.env.REPO_VIZ_CONFIG;

  return {
    root: positional[0] ? path.resolve(positional[0]) : process.cwd(),
    config: config ? path.resolve(config) : null,
    owners: list(flags.owners),
    since: str(flags.since) ?? null,
    until: str(flags.until) ?? null,
    jobs: Number(str(flags.jobs) ?? os.availableParallelism?.() ?? 4),
    repropose: flags.repropose === true,
  };
}

/**
 * Turn discovered repos and their histories into the rows of the config.
 *
 * @param {ReturnType<typeof discoverRepos>} discovered
 * @param {(repoPath: string) => ReturnType<typeof readRepoStats>} stats
 * @param {{
 *   teams?: Array<{ id: string, domains?: string[], bots?: boolean }>,
 *   since?: string | null,
 *   until?: string | null,
 *   merge?: string[][],
 *   owners?: string[],
 * }} options
 */
export function buildScan(
  discovered,
  stats,
  { teams = DEFAULT_TEAMS, since = null, until = null, merge = [], owners = [] } = {},
) {
  /** @type {Array<{ name: string, email: string, commits: number, repos: string[] }>} */
  const identities = [];
  const repos = discovered.map((repo) => {
    const s = stats(repo.path);
    for (const identity of s.identities) identities.push({ ...identity, repos: [repo.name] });
    return {
      name: repo.name,
      remote: repo.remote,
      commits: s.commits,
      files: s.files,
      folders: s.folders,
      first: s.first,
      last: s.last,
    };
  });

  const grouped = bucketIdentities(identities).map((person) => ({
    id: slugFor(person),
    team: proposeTeam(person, teams),
    name: person.name,
    emails: person.emails,
    names: person.names,
    commits: person.commits,
  }));
  const people = applyMergeList(grouped, merge);

  return { repos, people, teams, owners, window: { since, until } };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.config) {
    console.error(
      'No config path. Pass --config=<path> or set REPO_VIZ_CONFIG.\n' +
        'Keep it outside this repository: it lists contributor email addresses.',
    );
    process.exit(1);
  }

  console.log(`Scanning ${args.root}`);
  const discovered = discoverRepos(args.root, { owners: args.owners });
  console.log(`  ${discovered.length} repos after collapsing duplicate remotes`);

  const doc = loadConfig(args.config);
  const existing = doc.toJS();
  const merge = /** @type {string[][]} */ (existing.merge ?? []);
  // Teams come from the config once it has any, so adding a partner company
  // is an edit to the file rather than a flag on the command line.
  const teams = existing.teams?.length ? existing.teams : DEFAULT_TEAMS;
  const folderDepth = existing.defaults?.folderDepth ?? 2;
  if (merge.length) console.log(`  ${merge.length} merge group(s) from the config`);

  const scan = buildScan(
    discovered,
    (p) => readRepoStats(p, { since: args.since, until: args.until, folderDepth }),
    {
      teams,
      since: args.since,
      until: args.until,
      merge,
      owners: args.owners,
    },
  );

  const totalCommits = scan.repos.reduce((sum, r) => sum + r.commits, 0);
  console.log(`  ${totalCommits} commits, ${scan.people.length} people`);

  if (args.repropose) console.log('  reproposing every disposition, overwriting hand-set ones');
  // Everyone after the first id in a merge group has been merged into it.
  const merged = merge.flatMap((group) => group.slice(1));
  writeConfig(args.config, mergeScan(doc, scan, { repropose: args.repropose, merged }));
  console.log(`Wrote ${args.config}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('Scan failed:', err);
    process.exit(1);
  });
}

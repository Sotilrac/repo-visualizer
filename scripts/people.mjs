#!/usr/bin/env node
/**
 * Export the config's people, and their avatars, next to the dataset.
 *
 * Usage:
 *   node scripts/people.mjs --config=<path> [--out=public/data]
 *
 * Run it after editing the config. Without it the visualization falls back
 * to raw git authors, so one person with three addresses is three actors.
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { buildPeoplePayload } from './org/exportPeople.mjs';

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
    out: path.resolve(str(flags.out) ?? path.join(repoRoot, 'public', 'data')),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.config) {
    console.error('No config path. Pass --config=<path> or set REPO_VIZ_CONFIG.');
    process.exit(1);
  }
  if (!existsSync(args.config)) {
    console.error(`No config at ${args.config}`);
    process.exit(1);
  }

  const config = parse(readFileSync(args.config, 'utf8')) ?? {};
  const { byEmail, people, avatarFiles } = buildPeoplePayload(config);

  mkdirSync(path.join(args.out, 'avatars'), { recursive: true });
  let copied = 0;
  let missing = 0;
  for (const file of avatarFiles) {
    const from = path.join(path.dirname(args.config), file);
    if (!existsSync(from)) {
      missing += 1;
      continue;
    }
    copyFileSync(from, path.join(args.out, 'avatars', path.basename(file)));
    copied += 1;
  }

  writeFileSync(path.join(args.out, 'people.json'), JSON.stringify({ byEmail, people }));

  console.log(`${Object.keys(people).length} people, ${Object.keys(byEmail).length} addresses`);
  console.log(`${copied} avatars copied${missing ? `, ${missing} missing` : ''}`);
  console.log(`Wrote ${path.join(args.out, 'people.json')}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();

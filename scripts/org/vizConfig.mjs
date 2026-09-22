/**
 * Read, merge and write a visualization config.
 *
 * The config is a YAML file kept outside this repository. It names
 * contributors and their email addresses, while this repository is the
 * generic tool, with no data of its own. Shape:
 *
 *   window:   since, until
 *   defaults: lod, folderDepth, avatarFallback
 *   projects: id, name, hue
 *   repos:    name, lod (0 hidden, 1 bubble, 2 folders, 3 files), project,
 *             plus the scan's remote, commits, files, first, last
 *   teams:    id, name, hue, shown, domains, bots
 *   people:   id, team, role, avatar, active, plus the scan's name, names,
 *             emails, commits
 *
 * The file is the hand-edited source of truth: a level of detail per repo, a
 * team per person, plus the window, teams and projects. A re-scan has
 * to preserve all of that, including comments, so the merge edits a parsed
 * yaml Document in place.
 *
 * Generated fields, the ones marked below, are overwritten on every scan.
 * A row that stops appearing is marked `missing` and kept, so a bad clone
 * tree cannot discard a decision someone made.
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Document, isScalar, parseDocument, visit } from 'yaml';
import { isJoinableEmail } from './identities.mjs';
import { DEFAULT_TEAMS } from './teams.mjs';

/** Fields the scan owns. It writes no others, and overwrites no others. */
const GENERATED_REPO_FIELDS = ['remote', 'commits', 'files', 'first', 'last'];
// `name` is not here on purpose. The scan proposes one when it creates a row,
// and never touches it again, because renaming someone is the first edit
// anybody makes.
const GENERATED_PERSON_FIELDS = ['names', 'emails', 'commits', 'first', 'last'];

const HEADER = `Hand-edited configuration for the history visualizer.

Run \`npm run scan\` to refresh it: new repos and people are appended, the
generated counts are updated, and everything you set by hand, including these
comments, is left alone.

There is one field to set per row.
  repos:  lod  0 hidden, 1 one bubble, 2 bubble with folders, 3 folders and files
  people: team which team they are on; a team with shown: false is left out

merge: lists people the grouping kept apart who are the same person. The
first id in a group keeps its row and the others fold into it.`;

const DEFAULTS = { lod: 1, folderDepth: 2, avatarFallback: 'initials' };

/**
 * Strings YAML 1.1 parsers read as something other than a string.
 *
 * The yaml package emits to the 1.2 spec, where `yes` and `=` are ordinary
 * text. PyYAML and other 1.1 readers give them other meanings, and this file
 * has to work under any parser it is opened with. One real commit author is
 * literally named `=`, which is the 1.1 value key, and an unquoted one made
 * the whole file unparseable.
 */
const YAML_11_SPECIAL =
  /^(=|~|null|Null|NULL|true|True|TRUE|false|False|FALSE|y|Y|yes|Yes|YES|n|N|no|No|NO|on|On|ON|off|Off|OFF)$/;
const LOOKS_NUMERIC = /^[+-]?(0[0-7]+|0[xX][0-9a-fA-F]+|\d+(\.\d*)?([eE][+-]?\d+)?|\.\d+)$/;

/** @param {string} value */
function needsQuoting(value) {
  return value === '' || YAML_11_SPECIAL.test(value) || LOOKS_NUMERIC.test(value);
}

/** @param {string} file */
export function loadConfig(file) {
  if (!existsSync(file)) {
    const doc = new Document({});
    doc.commentBefore = HEADER.split('\n')
      .map((line) => (line ? ` ${line}` : ''))
      .join('\n');
    return doc;
  }
  return parseDocument(readFileSync(file, 'utf8'));
}

/**
 * @param {import('yaml').Document} doc
 * @param {string} file
 */
export function writeConfig(file, doc) {
  // Keep the previous contents next to the file. The config becomes
  // hand-edited quickly, and a bad scan should be one `mv` from undone.
  if (existsSync(file)) copyFileSync(file, `${file}.bak`);

  visit(doc, (_key, node) => {
    if (isScalar(node) && typeof node.value === 'string' && needsQuoting(node.value)) {
      node.type = 'QUOTE_DOUBLE';
    }
  });
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, doc.toString({ lineWidth: 100, singleQuote: false }));
}

function ensureMap(doc, key, value) {
  if (!doc.has(key)) doc.set(key, doc.createNode(value));
  return doc.get(key);
}

/** Key order for a new row: identity, then the field to edit, then the counts. */
function orderRow(row, key, defaults, generated) {
  /** @type {Record<string, unknown>} */
  const ordered = { [key]: row[key] };
  for (const [field, value] of Object.entries(defaults)) {
    ordered[field] = field in row ? row[field] : value;
  }
  for (const field of generated) if (field in row) ordered[field] = row[field];
  for (const [field, value] of Object.entries(row)) {
    if (!(field in ordered)) ordered[field] = value;
  }
  return ordered;
}

/**
 * Find the row a scanned person belongs to, even after a rename.
 *
 * The id is derived from the display name, so improving the name changes the
 * id, and matching on id only would orphan the row and every hand edit on
 * it. An address is the durable identifier, as long as it is one an
 * address can be: a half-filled git config yields `@example.com`, which
 * several people share and which therefore identifies none of them.
 */
function findByEmail(items, emails) {
  const wanted = new Set(emails.map((e) => String(e).trim().toLowerCase()).filter(isJoinableEmail));
  if (wanted.size === 0) return undefined;
  return items.find((item) => {
    const stored = item.get('emails');
    const list = stored?.items?.map((n) => String(n.value ?? n)) ?? [];
    return list.some((email) => wanted.has(email.trim().toLowerCase()));
  });
}

/** Remove rows the config merged into another, which are gone on purpose. */
function dropRows(doc, section, key, ids) {
  if (!ids.length) return;
  const seq = /** @type {import('yaml').YAMLSeq<any>} */ (doc.get(section));
  const gone = new Set(ids);
  seq.items = seq.items.filter((item) => !gone.has(String(item.get(key))));
}

/**
 * Merge one scanned row into a sequence, keyed on `key`.
 *
 * @param {import('yaml').Document} doc
 */
function mergeRows(doc, section, scanned, key, generated, defaults) {
  if (!doc.has(section)) doc.set(section, doc.createNode([]));
  const seq = /** @type {import('yaml').YAMLSeq<any>} */ (doc.get(section));
  /** @type {Map<string, any>} */
  const existing = new Map();
  for (const item of seq.items) existing.set(String(item.get(key)), item);
  const matched = new Set();

  for (const row of scanned) {
    const found =
      existing.get(String(row[key])) ??
      (row.emails ? findByEmail(seq.items, row.emails) : undefined);
    if (found) matched.add(String(found.get(key)));
    if (!found) {
      seq.add(doc.createNode(orderRow(row, key, defaults, generated)));
      continue;
    }
    for (const field of generated) {
      // createNode, so the write-time quoting pass can see inside a list. A
      // raw JS array is stringified directly and never visited.
      if (field in row) found.set(field, doc.createNode(row[field]));
    }
    for (const [field, value] of Object.entries(defaults)) {
      if (!found.has(field)) found.set(field, value);
    }
    found.delete('missing');
  }

  const seenKeys = new Set([...scanned.map((row) => String(row[key])), ...matched]);
  for (const item of seq.items) {
    if (!seenKeys.has(String(item.get(key)))) item.set('missing', true);
  }
}

/**
 * @param {import('yaml').Document} doc
 * @param {{
 *   repos?: any[],
 *   people?: any[],
 *   teams?: any[],
 *   window?: { since: string | null, until: string | null },
 * }} scan
 * @param {{ repropose?: boolean, merged?: string[] }} [options] repropose
 *   overwrites every person's `as`, including ones set by hand; the level of
 *   detail on a repo is never overwritten, since no rule proposes it.
 *   `merged` lists ids the config merged into another row, which are dropped
 *   instead of marked missing.
 */
export function mergeScan(doc, scan, { repropose = false, merged = [] } = {}) {
  if (scan.window) ensureMap(doc, 'window', scan.window);
  ensureMap(doc, 'defaults', DEFAULTS);
  ensureTeams(doc, scan.teams ?? DEFAULT_TEAMS);

  const defaultLod = doc.getIn(['defaults', 'lod']) ?? DEFAULTS.lod;
  mergeRows(doc, 'repos', scan.repos ?? [], 'name', GENERATED_REPO_FIELDS, { lod: defaultLod });
  const personFields = repropose ? [...GENERATED_PERSON_FIELDS, 'team'] : GENERATED_PERSON_FIELDS;
  mergeRows(doc, 'people', scan.people ?? [], 'id', personFields, { team: null });
  dropRows(doc, 'people', 'id', merged);

  return doc;
}

/**
 * Fields the editor is allowed to write, per section.
 *
 * Everything else in a row is either the scan's to own or the row's identity.
 * Letting a form overwrite a commit count would produce a config that
 * disagrees with the repositories it describes, and the next scan would
 * silently correct it, so the write is refused instead.
 */
const EDITABLE = {
  repos: new Set(['lod', 'project']),
  people: new Set(['name', 'team', 'role', 'avatar', 'active']),
  teams: new Set(['name', 'hue', 'shown', 'domains']),
};

/**
 * Apply a batch of edits from the editor to a config document.
 *
 * Every edit is checked before any is written, so a bad request cannot
 * leave the file half-updated.
 *
 * @param {import('yaml').Document} doc
 * @param {Array<Record<string, any>>} edits
 */
export function applyEdits(doc, edits) {
  const rowEdits = [];
  const mergeEdits = [];

  for (const edit of edits) {
    if (edit.section === 'merge') {
      checkMergeEdit(doc, edit);
      mergeEdits.push(edit);
      continue;
    }

    const editable = EDITABLE[edit.section];
    if (!editable) throw new Error(`Unknown section ${edit.section}`);
    if (!editable.has(edit.field)) {
      throw new Error(
        `${edit.section}.${edit.field} belongs to the scan and cannot be edited here`,
      );
    }
    const row = findRow(doc, edit.section, edit.id);
    if (!row) throw new Error(`No ${edit.section} row with id ${edit.id}`);
    rowEdits.push({ row, edit });
  }

  for (const { row, edit } of rowEdits) {
    if (edit.value === null) row.delete(edit.field);
    else row.set(edit.field, doc.createNode(edit.value));
  }
  for (const edit of mergeEdits) applyMergeEdit(doc, edit);

  return doc;
}

function rowKey(section) {
  return section === 'repos' ? 'name' : 'id';
}

/** Teams a config does not declare yet, so a fresh file has somewhere to put people. */
function ensureTeams(doc, teams) {
  if (doc.has('teams') && /** @type {any} */ (doc.get('teams'))?.items?.length) return;
  doc.set('teams', doc.createNode(teams));
}

function findRow(doc, section, id) {
  const seq = doc.get(section);
  return seq?.items?.find((item) => String(item.get(rowKey(section))) === String(id));
}

function checkMergeEdit(doc, edit) {
  if (edit.op === 'remove') return;
  const group = edit.group ?? [];
  for (const id of group) {
    if (!findRow(doc, 'people', id)) throw new Error(`No people row with id ${id}`);
  }
  if (group.length < 2) throw new Error('A merge group needs at least two ids');
  if (new Set(group).size !== group.length) throw new Error('A merge group names a row twice');
}

/** Read a scalar sequence off a row as plain strings. */
function listOf(row, field) {
  return (row.get(field)?.items ?? []).map((item) => String(item.value ?? item));
}

/**
 * Record the group and fold the rows now.
 *
 * The scan folds them too, from the same list, so the two agree. Doing it
 * here as well is what makes the editor show one row the moment you merge,
 * instead of after the next scan.
 */
function applyMergeEdit(doc, edit) {
  if (!doc.has('merge')) doc.set('merge', doc.createNode([]));
  const seq = /** @type {import('yaml').YAMLSeq<any>} */ (doc.get('merge'));
  const head = String(edit.group[0]);

  // Drop any recorded group that names one of these people, not only one
  // starting with the same id. Two groups over the same pair contradict each
  // other, and every id after the first is deleted from the config on the
  // next scan, so a contradiction erases the person entirely.
  const touched = new Set(edit.group.map(String));
  const overlaps = (item) => (item.items ?? []).some((id) => touched.has(String(id.value ?? id)));
  seq.items = seq.items.filter((item) =>
    edit.op === 'add'
      ? !overlaps(item)
      : String(item.items?.[0]?.value ?? item.items?.[0]) !== head,
  );
  if (edit.op !== 'add') return;

  seq.add(doc.createNode(edit.group));

  const keeper = findRow(doc, 'people', head);
  const absorbed = edit.group.slice(1).map(String);
  let commits = Number(keeper.get('commits') ?? 0);
  const names = new Set(listOf(keeper, 'names'));
  const emails = new Set(listOf(keeper, 'emails'));

  for (const id of absorbed) {
    const other = findRow(doc, 'people', id);
    if (!other) continue;
    commits += Number(other.get('commits') ?? 0);
    for (const name of listOf(other, 'names')) names.add(name);
    for (const email of listOf(other, 'emails')) emails.add(email);
  }

  keeper.set('commits', commits);
  keeper.set('names', doc.createNode([...names]));
  keeper.set('emails', doc.createNode([...emails]));
  dropRows(doc, 'people', 'id', absorbed);
}

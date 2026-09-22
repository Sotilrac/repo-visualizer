/**
 * Group the (name, email) pairs git reports into one row per person.
 *
 * Across six years and a hundred repos one person commits under several
 * addresses and several ways of writing their name. Two identities join when they
 * share an email or share a normalized name, and joins are transitive, so a
 * chain of overlaps collapses into one person.
 *
 * Every grouping here is a proposal written into the config for a human to
 * correct. The bias is towards under-merging: two rows for one person is a
 * visible mistake, one row for two people hides one of them.
 */

/**
 * An address usable as a join key: it has a local part and a domain.
 *
 * A git config left half-filled produces commits authored by `@example.com`,
 * with no local part. Several people can end up with that same string, and
 * joining on it merges them into one. The address is still recorded on
 * the person who used it; it just does not decide who they are.
 */
const JOINABLE_EMAIL = /^[^@\s]+@[^@\s]+$/;

/** @param {string} email */
export function isJoinableEmail(email) {
  return JOINABLE_EMAIL.test(email.trim());
}

/**
 * @typedef {object} Identity
 * @property {string} name
 * @property {string} email
 * @property {number} commits
 * @property {string[]} [repos]
 */

/**
 * @typedef {object} Person
 * @property {string} name     the most prolific spelling
 * @property {string[]} names
 * @property {string[]} emails
 * @property {string[]} repos
 * @property {number} commits
 */

/**
 * How usable a spelling is as a display name, higher being better.
 *
 * The most prolific spelling is usually the right one, but not always: one
 * contributor's git config left their name as `=`, and it outnumbered the
 * spelling that identifies them. A full name wins over a bare handle for
 * the same reason.
 */
function nameQuality(name) {
  const trimmed = name.trim();
  if (!/[a-z]/i.test(trimmed)) return 0;
  if (trimmed.includes(' ')) return 2;
  return 1;
}

/** Case and punctuation removed, so "Ada Lovelace" and "ada lovelace" meet. */
function normalizeName(name) {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** A disjoint-set over identity indices: shared email or name unions two rows. */
function union(parent, a, b) {
  const rootA = find(parent, a);
  const rootB = find(parent, b);
  if (rootA !== rootB) parent[rootB] = rootA;
}

function find(parent, i) {
  while (parent[i] !== i) {
    parent[i] = parent[parent[i]];
    i = parent[i];
  }
  return i;
}

/**
 * @param {Identity[]} identities
 * @returns {Person[]}
 */
export function bucketIdentities(identities) {
  const parent = identities.map((_, i) => i);
  /** @type {Map<string, number>} */
  const byEmail = new Map();
  /** @type {Map<string, number>} */
  const byName = new Map();

  identities.forEach((identity, i) => {
    const email = identity.email.trim().toLowerCase();
    const name = normalizeName(identity.name);

    if (email && JOINABLE_EMAIL.test(email)) {
      const seen = byEmail.get(email);
      if (seen === undefined) byEmail.set(email, i);
      else union(parent, seen, i);
    }
    if (name) {
      const seen = byName.get(name);
      if (seen === undefined) byName.set(name, i);
      else union(parent, seen, i);
    }
  });

  /** @type {Map<number, Identity[]>} */
  const groups = new Map();
  identities.forEach((identity, i) => {
    const root = find(parent, i);
    const group = groups.get(root);
    if (group) group.push(identity);
    else groups.set(root, [identity]);
  });

  const people = [...groups.values()].map((group) => {
    const sorted = [...group].sort(
      (a, b) => nameQuality(b.name) - nameQuality(a.name) || b.commits - a.commits,
    );
    return {
      name: sorted[0].name,
      names: [...new Set(group.map((i) => i.name))],
      emails: [...new Set(group.map((i) => i.email))],
      repos: [...new Set(group.flatMap((i) => i.repos ?? []))],
      commits: group.reduce((total, i) => total + i.commits, 0),
    };
  });

  return people.sort((a, b) => b.commits - a.commits || a.name.localeCompare(b.name));
}

/** @param {{ name: string, emails: string[] }} person */
export function slugFor(person) {
  const fromName = normalizeName(person.name).replace(/ /g, '-');
  if (fromName) return fromName;
  const local = (person.emails[0] ?? '').split('@')[0];
  return normalizeName(local).replace(/ /g, '-') || 'unknown';
}

/**
 * Fold rows the automatic grouping kept apart, as named in the config.
 *
 * The grouping joins on a shared address or a shared name, and errs towards
 * leaving people separate. It cannot know that `ghopper81` on a
 * GitHub noreply address is the same person as `Grace Hopper` on a work one.
 * The config states it instead:
 *
 *   merge:
 *     - [grace-hopper, ghopper81]
 *
 * The first id in a group wins: its row stays, keeping its name and its
 * disposition, and the others are merged into it.
 *
 * @param {Array<Record<string, any>>} people
 * @param {string[][]} groups
 */
export function applyMergeList(people, groups) {
  if (!groups?.length) return people;

  // Copies throughout: the caller's rows are left exactly as they were.
  const copies = new Map(people.map((person) => [person.id, { ...person }]));
  const absorbed = new Set();

  for (const group of groups) {
    const members = group.map((id) => copies.get(id)).filter(Boolean);
    if (members.length < 2) continue;

    const [keeper, ...rest] = members;
    for (const other of rest) {
      keeper.names = [...new Set([...keeper.names, ...other.names])];
      keeper.emails = [...new Set([...keeper.emails, ...other.emails])];
      keeper.repos = [...new Set([...(keeper.repos ?? []), ...(other.repos ?? [])])];
      keeper.commits += other.commits;
      absorbed.add(other.id);
    }
  }

  return [...copies.values()]
    .filter((person) => !absorbed.has(person.id))
    .sort((a, b) => b.commits - a.commits || a.name.localeCompare(b.name));
}

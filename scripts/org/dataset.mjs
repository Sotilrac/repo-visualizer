/**
 * Merge per-repo histories into one dataset the app can load.
 *
 * Six years across a hundred repos is tens of thousands of commits touching
 * hundreds of thousands of paths, and the same path string appears in every
 * commit that touched it. Written out in full that is too large to serve.
 * So paths and authors are interned into tables in the manifest, a commit
 * refers to them by index, and the commits are split into one file per
 * calendar year. The app loads the manifest and only the years its window
 * covers.
 *
 * A path is qualified by its repo, because two repos both have a README.
 */

/**
 * @typedef {object} WalkedRepo
 * @property {string} name
 * @property {string | null} [remote]
 * @property {string} [project]
 * @property {any[]} commits  oldest first, as the repo walk produced them
 */

const STATUS_DELETED = 1;
const STATUS_MODIFIED = 0;

/** A table that hands out a stable index per distinct value. */
function interner(keyOf = (value) => value) {
  const index = new Map();
  const values = [];
  return {
    values,
    idFor(value) {
      const key = keyOf(value);
      const seen = index.get(key);
      if (seen !== undefined) return seen;
      const id = values.length;
      index.set(key, id);
      values.push(value);
      return id;
    },
  };
}

/**
 * @param {WalkedRepo[]} repos
 * @param {{ window?: { since: string | null, until: string | null } }} [options]
 */
export function buildDataset(repos, { window = { since: null, until: null } } = {}) {
  // `git log --since` filters on the committer date, and a commit shows its
  // author date, so a 2015 commit rebased in 2021 gets through the git
  // filter and then lands in a 2015 shard. Filter again on the date that is
  // actually stored.
  const from = window.since ? Date.parse(window.since) : Number.NEGATIVE_INFINITY;
  const to = window.until ? Date.parse(window.until) : Number.POSITIVE_INFINITY;

  const paths = interner();
  const authors = interner((author) => `${author.name}\u0000${author.email}`);

  /** @type {any[]} */
  const merged = [];
  const manifestRepos = repos.map((repo, repoId) => {
    const touched = new Set();

    let kept = 0;

    for (const commit of repo.commits ?? []) {
      const at = Date.parse(commit.date);
      if (at < from || at > to) continue;

      const time = Math.floor(at / 1000);
      const changes = [];

      for (const change of commit.changes ?? []) {
        const pathId = paths.idFor(`${repo.name}/${change.path}`);
        touched.add(pathId);

        const entry = [
          pathId,
          change.added ?? 0,
          change.removed ?? 0,
          change.status === 'D' ? STATUS_DELETED : STATUS_MODIFIED,
        ];
        // An import list is absent far more often than not, so it is only
        // written when there is one.
        const imports = (change.resolvedImports ?? []).map((target) =>
          paths.idFor(`${repo.name}/${target}`),
        );
        if (imports.length) entry.push(imports);

        changes.push(entry);
      }

      // A commit touching only excluded files has no beam target and no node
      // to change. It would advance the clock and draw an empty frame.
      if (changes.length === 0) continue;

      kept += 1;
      merged.push({
        t: time,
        r: repoId,
        a: authors.idFor({ name: commit.author ?? '', email: commit.authorEmail ?? '' }),
        sha: commit.shortSha ?? String(commit.sha ?? '').slice(0, 7),
        m: commit.message ?? '',
        c: changes,
      });
    }

    return {
      name: repo.name,
      remote: repo.remote ?? null,
      ...(repo.project ? { project: repo.project } : {}),
      commits: kept,
      files: touched.size,
    };
  });

  merged.sort((a, b) => a.t - b.t || a.r - b.r);

  /** @type {Record<number, { commits: any[] }>} */
  const shards = {};
  for (const commit of merged) {
    const year = new Date(commit.t * 1000).getUTCFullYear();
    if (!shards[year]) shards[year] = { commits: [] };
    shards[year].commits.push(commit);
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    window,
    repos: manifestRepos,
    authors: authors.values,
    paths: paths.values,
    shards: Object.keys(shards)
      .map(Number)
      .sort((a, b) => a - b)
      .map((year) => ({ year, file: `shards/${year}.json`, commits: shards[year].commits.length })),
  };

  return { manifest, shards };
}

/**
 * Turn the sharded dataset back into the commit list the app works with.
 *
 * The analyzer interns paths and authors and splits commits by year to keep
 * the files servable. The graph wants plain objects, so this expands them
 * once on load. Paths come back qualified by repo, which is what makes the
 * repo the cluster in a flat multi-repo view.
 */

const STATUS_DELETED = 1;

/**
 * The shard files a window needs. A year is skipped only when it lies wholly
 * outside, since a boundary in the middle of a year still needs that year.
 *
 * @param {Array<{ year: number, file: string }>} shards
 * @param {{ since?: string | null, until?: string | null }} window
 */
export function shardsForWindow(shards, window = {}) {
  const from = window.since ? new Date(window.since).getUTCFullYear() : -Infinity;
  const to = window.until ? new Date(window.until).getUTCFullYear() : Infinity;
  return shards.filter((shard) => shard.year >= from && shard.year <= to).map((s) => s.file);
}

/**
 * @param {any} manifest
 * @param {Record<string|number, { commits: any[] }>} shards keyed by year
 */
export function expandDataset(manifest, shards) {
  const paths = manifest.paths ?? [];
  const authors = manifest.authors ?? [];
  const repos = (manifest.repos ?? []).map((repo) => ({
    name: repo.name,
    remote: repo.remote ?? null,
  }));

  const commits = Object.keys(shards)
    .map(Number)
    .sort((a, b) => a - b)
    .flatMap((year) => shards[year]?.commits ?? [])
    .sort((a, b) => a.t - b.t)
    .map((commit) => {
      const author = authors[commit.a] ?? { name: '', email: '' };
      return {
        sha: commit.sha,
        shortSha: commit.sha,
        date: new Date(commit.t * 1000).toISOString(),
        author: author.name,
        authorEmail: author.email,
        message: commit.m,
        repo: repos[commit.r]?.name,
        changes: (commit.c ?? []).map(([pathId, added, removed, status, imports]) => ({
          path: paths[pathId],
          added,
          removed,
          status: status === STATUS_DELETED ? 'D' : 'M',
          resolvedImports: (imports ?? []).map((id) => paths[id]),
        })),
      };
    });

  return {
    repo: repos.length === 1 ? repos[0].name : `${repos.length} repos`,
    repos,
    generatedAt: manifest.generatedAt,
    totalCommits: commits.length,
    exclude: manifest.exclude ?? [],
    commits,
  };
}

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
    lod: repo.lod ?? 1,
    ...(repo.project ? { project: repo.project } : {}),
    ...(repo.submodules?.length ? { submodules: repo.submodules } : {}),
  }));

  const commits = Object.keys(shards)
    .map(Number)
    .sort((a, b) => a - b)
    .flatMap((year) => shards[year]?.commits ?? [])
    .sort((a, b) => a.t - b.t)
    .map((commit) => {
      const author = authors[commit.a] ?? { name: '', email: '' };
      const changes = (commit.c ?? []).map(([pathId, added, removed, status, imports]) => ({
        path: paths[pathId],
        added,
        removed,
        status: status === STATUS_DELETED ? 'D' : 'M',
        resolvedImports: (imports ?? []).map((id) => paths[id]),
      }));

      return {
        sha: commit.sha,
        shortSha: commit.sha,
        date: new Date(commit.t * 1000).toISOString(),
        author: author.name,
        authorEmail: author.email,
        // Everyone else the commit names. They fire at the same files.
        coAuthors: (commit.co ?? []).map((id) => authors[id]).filter(Boolean),
        message: commit.m,
        repo: repos[commit.r]?.name,
        // Derived rather than stored: the numbers are a sum of the changes,
        // and the dataset is big enough without repeating them.
        stats: {
          filesChanged: changes.length,
          insertions: changes.reduce((total, c) => total + c.added, 0),
          deletions: changes.reduce((total, c) => total + c.removed, 0),
        },
        changes,
      };
    });

  return {
    // What the page calls itself, when the config says.
    title: manifest.title ?? null,
    repo: repos.length === 1 ? repos[0].name : `${repos.length} repos`,
    repos,
    generatedAt: manifest.generatedAt,
    folderDepth: manifest.folderDepth ?? 2,
    totalCommits: commits.length,
    exclude: manifest.exclude ?? [],
    commits,
  };
}

import { describe, expect, it } from 'vitest';
import { buildDataset } from '../scripts/org/dataset.mjs';

/** What one repo's walk hands over. */
const walked = (name, commits) => ({
  name,
  remote: `https://github.com/Acme/${name}`,
  commits,
});

const commit = (sha, date, author, changes) => ({
  sha,
  date,
  author: author[0],
  authorEmail: author[1],
  message: `work on ${sha}`,
  changes,
});

const change = (path, { added = 5, removed = 0, status = 'M', imports = [] } = {}) => ({
  path,
  added,
  removed,
  status,
  resolvedImports: imports,
});

const ada = ['Ada', 'ada@acme.com'];
const bo = ['Bo', 'bo@acme.com'];

describe('repos', () => {
  const dataset = buildDataset([
    walked('battery', [commit('a1', '2021-03-04T10:00:00Z', ada, [change('src/a.js')])]),
    walked('core', [commit('b1', '2022-07-19T10:00:00Z', bo, [change('src/b.js')])]),
  ]);

  it('lists each one in the manifest', () => {
    expect(dataset.manifest.repos.map((r) => r.name)).toEqual(['battery', 'core']);
  });

  it('keeps the remote, so the app can link to it', () => {
    expect(dataset.manifest.repos[0].remote).toBe('https://github.com/Acme/battery');
  });

  it('refers to a repo by its index, not its name, in every commit', () => {
    const all = Object.values(dataset.shards).flatMap((s) => s.commits);

    expect(all.map((c) => c.r).sort()).toEqual([0, 1]);
  });
});

describe('paths', () => {
  const dataset = buildDataset([
    walked('battery', [
      commit('a1', '2021-03-04T10:00:00Z', ada, [change('src/a.js'), change('src/b.js')]),
      commit('a2', '2021-03-05T10:00:00Z', ada, [change('src/a.js')]),
    ]),
    walked('core', [commit('b1', '2021-04-01T10:00:00Z', bo, [change('src/a.js')])]),
  ]);

  it('are qualified by their repo, so two repos can hold the same name', () => {
    expect(dataset.manifest.paths).toContain('battery/src/a.js');
    expect(dataset.manifest.paths).toContain('core/src/a.js');
  });

  it('are stored once however often they are touched', () => {
    expect(dataset.manifest.paths.filter((p) => p === 'battery/src/a.js')).toHaveLength(1);
  });

  it('appear in a change as an index into that table', () => {
    const first = dataset.shards[2021].commits[0];
    const id = first.c[0][0];

    expect(dataset.manifest.paths[id]).toBe('battery/src/a.js');
  });
});

describe('authors', () => {
  const dataset = buildDataset([
    walked('battery', [
      commit('a1', '2021-03-04T10:00:00Z', ada, [change('a.js')]),
      commit('a2', '2021-03-05T10:00:00Z', ada, [change('a.js')]),
      commit('b1', '2021-03-06T10:00:00Z', bo, [change('a.js')]),
    ]),
  ]);

  it('are interned, so a name and address are stored once each', () => {
    expect(dataset.manifest.authors).toHaveLength(2);
  });

  it('keep the address, which is what resolves them to a person', () => {
    expect(dataset.manifest.authors.map((a) => a.email).sort()).toEqual([
      'ada@acme.com',
      'bo@acme.com',
    ]);
  });

  it('appear in a commit as an index', () => {
    const [first] = dataset.shards[2021].commits;

    expect(dataset.manifest.authors[first.a].email).toBe('ada@acme.com');
  });
});

describe('ordering and sharding', () => {
  const dataset = buildDataset([
    walked('battery', [
      commit('old', '2020-12-31T23:00:00Z', ada, [change('a.js')]),
      commit('later', '2022-06-01T10:00:00Z', ada, [change('a.js')]),
    ]),
    walked('core', [commit('middle', '2021-05-05T10:00:00Z', bo, [change('b.js')])]),
  ]);

  it('splits the history by calendar year', () => {
    expect(Object.keys(dataset.shards).sort()).toEqual(['2020', '2021', '2022']);
  });

  it('interleaves the repos, oldest first', () => {
    const all = Object.entries(dataset.shards)
      .sort(([a], [b]) => Number(a) - Number(b))
      .flatMap(([, s]) => s.commits);

    expect(all.map((c) => c.sha)).toEqual(['old', 'middle', 'later']);
  });

  it('lists the shards in the manifest with their sizes', () => {
    expect(dataset.manifest.shards).toEqual([
      { year: 2020, file: 'shards/2020.json', commits: 1 },
      { year: 2021, file: 'shards/2021.json', commits: 1 },
      { year: 2022, file: 'shards/2022.json', commits: 1 },
    ]);
  });

  it('records a commit time in seconds, not a date string', () => {
    expect(dataset.shards[2021].commits[0].t).toBe(
      Math.floor(Date.parse('2021-05-05T10:00:00Z') / 1000),
    );
  });
});

describe('changes', () => {
  const dataset = buildDataset([
    walked('battery', [
      commit('a1', '2021-03-04T10:00:00Z', ada, [
        change('src/a.js', { added: 12, removed: 3, imports: ['src/b.js'] }),
        change('src/gone.js', { status: 'D' }),
        change('src/b.js'),
      ]),
    ]),
  ]);
  const [first] = dataset.shards[2021].commits;

  it('keep the counts', () => {
    expect(first.c[0].slice(1, 3)).toEqual([12, 3]);
  });

  it('mark a deletion, and leave a modification at zero', () => {
    const statuses = Object.fromEntries(first.c.map((c) => [dataset.manifest.paths[c[0]], c[3]]));

    expect(statuses['battery/src/gone.js']).toBe(1);
    expect(statuses['battery/src/a.js']).toBe(0);
  });

  it('resolve an import to a path id in the same repo', () => {
    const imports = first.c[0][4];

    expect(imports.map((id) => dataset.manifest.paths[id])).toEqual(['battery/src/b.js']);
  });

  it('leave out the import list when there is none', () => {
    const plain = first.c.find((c) => dataset.manifest.paths[c[0]] === 'battery/src/gone.js');

    expect(plain).toHaveLength(4);
  });
});

describe('the manifest', () => {
  it('records the window it was built for', () => {
    const dataset = buildDataset([], { window: { since: '2020-10-22', until: null } });

    expect(dataset.manifest.window).toEqual({ since: '2020-10-22', until: null });
  });

  it('counts the commits and files per repo', () => {
    const dataset = buildDataset([
      walked('battery', [
        commit('a1', '2021-03-04T10:00:00Z', ada, [change('a.js'), change('b.js')]),
        commit('a2', '2021-03-05T10:00:00Z', ada, [change('a.js')]),
      ]),
    ]);

    expect(dataset.manifest.repos[0]).toMatchObject({ commits: 2, files: 2 });
  });

  it('copes with a repo that has no commits in the window', () => {
    const dataset = buildDataset([walked('quiet', [])]);

    expect(dataset.manifest.repos[0].commits).toBe(0);
    expect(dataset.shards).toEqual({});
  });
});

describe('the window', () => {
  const walkedWith = (dates) =>
    walked(
      'battery',
      dates.map((date, i) => commit(`c${i}`, date, ada, [change('a.js')])),
    );

  it('drops a commit authored before it', () => {
    const dataset = buildDataset([walkedWith(['2015-01-01T10:00:00Z', '2021-01-01T10:00:00Z'])], {
      window: { since: '2020-10-22', until: null },
    });

    expect(Object.keys(dataset.shards)).toEqual(['2021']);
  });

  it('drops a commit authored after it', () => {
    const dataset = buildDataset([walkedWith(['2021-01-01T10:00:00Z', '2030-01-01T10:00:00Z'])], {
      window: { since: null, until: '2025-01-01' },
    });

    expect(Object.keys(dataset.shards)).toEqual(['2021']);
  });

  it('keeps everything when the window is open', () => {
    const dataset = buildDataset([walkedWith(['2015-01-01T10:00:00Z', '2021-01-01T10:00:00Z'])]);

    expect(Object.keys(dataset.shards).sort()).toEqual(['2015', '2021']);
  });

  it('counts only what it kept', () => {
    const dataset = buildDataset([walkedWith(['2015-01-01T10:00:00Z', '2021-01-01T10:00:00Z'])], {
      window: { since: '2020-10-22', until: null },
    });

    expect(dataset.manifest.repos[0].commits).toBe(1);
  });
});

describe('a commit that changes nothing visible', () => {
  it('is left out, since it would draw nothing', () => {
    const dataset = buildDataset([
      walked('battery', [
        commit('empty', '2021-03-04T10:00:00Z', ada, []),
        commit('real', '2021-03-05T10:00:00Z', ada, [change('a.js')]),
      ]),
    ]);

    expect(dataset.shards[2021].commits.map((c) => c.sha)).toEqual(['real']);
  });

  it('is not counted against its repo', () => {
    const dataset = buildDataset([
      walked('battery', [commit('empty', '2021-03-04T10:00:00Z', ada, [])]),
    ]);

    expect(dataset.manifest.repos[0].commits).toBe(0);
  });
});

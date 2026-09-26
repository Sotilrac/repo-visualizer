import { describe, expect, it } from 'vitest';
import {
  parseGitmodules,
  readGitmodules,
  repoNameFromUrl,
  submodulesIn,
} from '../scripts/org/submodules.mjs';
import { submoduleParents } from '../src/engine/bodies.js';
import { createLayout } from '../src/engine/layout.js';

const REAL = `[submodule "flexsea-dephy"]
\tpath = flexsea-dephy
\turl = ../flexsea-dephy.git
[submodule "serial"]
\tpath = libs/serial
\turl = git@github.com:Acme/serial.git
`;

describe('parseGitmodules', () => {
  it('reads each submodule with its path and url', () => {
    expect(parseGitmodules(REAL)).toEqual([
      { name: 'flexsea-dephy', path: 'flexsea-dephy', url: '../flexsea-dephy.git' },
      { name: 'serial', path: 'libs/serial', url: 'git@github.com:Acme/serial.git' },
    ]);
  });

  it('has nothing to say about a repo with no submodules', () => {
    expect(parseGitmodules('')).toEqual([]);
  });

  it('skips an entry with no url to follow', () => {
    expect(parseGitmodules('[submodule "half"]\n\tpath = half\n')).toEqual([]);
  });
});

describe('repoNameFromUrl', () => {
  it.each([
    ['../flexsea-dephy.git', 'flexsea-dephy'],
    ['git@github.com:Acme/serial.git', 'serial'],
    ['https://github.com/Acme/serial', 'serial'],
    ['https://github.com/Acme/serial.git?ref=main', 'serial'],
    ['https://gitlab.com/acme/group/thing.git/', 'thing'],
  ])('reads %s as %s', (url, name) => {
    expect(repoNameFromUrl(url)).toBe(name);
  });
});

describe('submodulesIn', () => {
  it('names the repos a repo pulls in', () => {
    expect(submodulesIn(REAL)).toEqual(['flexsea-dephy', 'serial']);
  });

  it('leaves out a submodule nobody has cloned', () => {
    expect(submodulesIn(REAL, { known: new Set(['serial']) })).toEqual(['serial']);
  });

  it('names a repo once however many times it appears', () => {
    const twice = `${REAL}[submodule "again"]\n\turl = ../flexsea-dephy.git\n`;

    expect(submodulesIn(twice)).toEqual(['flexsea-dephy', 'serial']);
  });
});

describe('readGitmodules', () => {
  it('reads the file off the branch it is given', () => {
    const calls = [];
    const run = (_cmd, args) => {
      calls.push(args.join(' '));
      return REAL;
    };

    expect(readGitmodules('/tmp/repo', { branch: 'origin/main', run })).toBe(REAL);
    expect(calls[0]).toBe('-C /tmp/repo show origin/main:.gitmodules');
  });

  it('answers with nothing when the branch has no .gitmodules', () => {
    const run = () => {
      throw new Error('fatal: path does not exist');
    };

    expect(readGitmodules('/tmp/repo', { run })).toBe('');
  });
});

describe('drawing a repo beside the ones it pulls in', () => {
  const dataset = {
    repos: [
      { name: 'flexsea-stm', submodules: ['flexsea-dephy'] },
      { name: 'plan-stack', submodules: ['serial', 'flexsea-dephy'] },
      { name: 'flexsea-dephy' },
      { name: 'serial' },
    ],
  };

  it('names the repo that carries each submodule', () => {
    expect(submoduleParents(dataset)).toEqual(
      new Map([
        ['flexsea-dephy', 'flexsea-stm'],
        ['serial', 'plan-stack'],
      ]),
    );
  });

  it('has nothing to say about a dataset with no submodules', () => {
    expect(submoduleParents({ repos: [{ name: 'a' }] }).size).toBe(0);
  });

  it('does not make a repo its own parent', () => {
    expect(submoduleParents({ repos: [{ name: 'a', submodules: ['a'] }] }).size).toBe(0);
  });

  it('puts a stack of repos together, away from the rest', () => {
    // Enough repos that there is somewhere else to be: two blobs out of
    // three are neighbours whatever the layout does.
    const strangers = Array.from({ length: 12 }, (_, i) => `other-${i}`);
    const layout = createLayout({ width: 1600, height: 900 });
    layout.setGroups(submoduleParents(dataset));

    const repo = (name) => ({
      id: name,
      kind: 'repo',
      repo: name,
      parent: null,
      files: 20,
      size: 2000,
      churn: 100,
      commits: 10,
      bornAt: 0,
      lastTouchedAt: 0,
    });

    // The submodule turns up before the repo that carries it, which is the
    // usual way round: a library is older than the stack built on it.
    layout.sync([repo('flexsea-dephy'), ...strangers.map(repo)], []);
    layout.sync([repo('flexsea-dephy'), repo('flexsea-stm'), ...strangers.map(repo)], []);

    const centers = layout.getClusterCenters();
    const at = (name) => centers.get(name).target ?? centers.get(name);
    const from = (name) =>
      Math.hypot(at('flexsea-stm').x - at(name).x, at('flexsea-stm').y - at(name).y);
    const mean = (names) => names.reduce((sum, name) => sum + from(name), 0) / names.length;

    expect(from('flexsea-dephy')).toBeLessThan(mean(strangers));
  });
});

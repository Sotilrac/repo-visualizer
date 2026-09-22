import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { loadConfig, mergeScan, writeConfig } from '../scripts/org/vizConfig.mjs';

let file;

const repos = [
  { name: 'battery', remote: 'https://github.com/Acme/battery', commits: 10, files: 4 },
];
const people = [{ id: 'ada', name: 'Ada', emails: ['ada@acme.com'], names: ['Ada'], commits: 7 }];

beforeEach(() => {
  file = path.join(mkdtempSync(path.join(tmpdir(), 'rv-cfg-')), 'viz.yaml');
});
afterEach(() => rmSync(path.dirname(file), { recursive: true, force: true }));

const round = (scan) => {
  writeConfig(file, mergeScan(loadConfig(file), scan));
  return parse(readFileSync(file, 'utf8'));
};

describe('a first scan', () => {
  it('writes a repo row per discovered repo', () => {
    expect(round({ repos, people }).repos).toEqual([
      expect.objectContaining({
        name: 'battery',
        remote: 'https://github.com/Acme/battery',
        commits: 10,
      }),
    ]);
  });

  it('gives every repo the default level of detail', () => {
    expect(round({ repos, people }).repos[0].lod).toBe(1);
  });

  it('writes a person row per merged identity', () => {
    expect(round({ repos, people }).people).toEqual([
      expect.objectContaining({ id: 'ada', name: 'Ada', commits: 7 }),
    ]);
  });

  it('writes the window and the defaults', () => {
    const config = round({ repos, people, window: { since: '2020-10-22', until: null } });

    expect(config.window).toEqual({ since: '2020-10-22', until: null });
    expect(config.defaults.lod).toBe(1);
  });

  it('carries the proposed team through', () => {
    const config = round({ repos, people: [{ ...people[0], team: 'external' }] });

    expect(config.people[0].team).toBe('external');
  });
});

describe('a re-scan', () => {
  it('keeps a hand-set level of detail', () => {
    round({ repos, people });
    writeFileSync(file, readFileSync(file, 'utf8').replace('    lod: 1', '    lod: 3'));

    expect(round({ repos, people }).repos[0].lod).toBe(3);
  });

  it('keeps a hand-set team', () => {
    round({ repos, people });
    writeFileSync(file, readFileSync(file, 'utf8').replace('team: null', 'team: bots'));

    expect(round({ repos, people }).people[0].team).toBe('bots');
  });

  it('keeps comments a human added', () => {
    round({ repos, people });
    writeFileSync(
      file,
      readFileSync(file, 'utf8').replace(
        '  - name: battery',
        '  # the battery one\n  - name: battery',
      ),
    );

    round({ repos, people });

    expect(readFileSync(file, 'utf8')).toContain('# the battery one');
  });

  it('refreshes the generated counts', () => {
    round({ repos, people });

    const config = round({ repos: [{ ...repos[0], commits: 99 }], people });

    expect(config.repos[0].commits).toBe(99);
  });

  it('adds a repo that appeared since the last scan', () => {
    round({ repos, people });

    const config = round({
      repos: [...repos, { name: 'toolbox', remote: null, commits: 1 }],
      people,
    });

    expect(config.repos.map((r) => r.name).sort()).toEqual(['battery', 'toolbox']);
  });

  it('marks a repo that stopped appearing rather than deleting it', () => {
    round({ repos, people });

    const config = round({ repos: [], people });

    expect(config.repos).toHaveLength(1);
    expect(config.repos[0].missing).toBe(true);
  });

  it('clears the mark when the repo comes back', () => {
    round({ repos, people });
    round({ repos: [], people });

    expect(round({ repos, people }).repos[0].missing).toBeUndefined();
  });

  it('keeps a person who stopped appearing', () => {
    round({ repos, people });

    expect(round({ repos, people: [] }).people[0].missing).toBe(true);
  });
});

describe('loadConfig', () => {
  it('returns an empty document when the file does not exist', () => {
    expect(loadConfig(file).toJS()).toEqual({});
  });
});

describe('values other parsers could misread', () => {
  const emit = (scan) => {
    writeConfig(file, mergeScan(loadConfig(file), scan));
    return readFileSync(file, 'utf8');
  };

  it.each([
    ['=', 'the yaml 1.1 value key, and a real commit author name'],
    ['~', 'null in yaml 1.1'],
    ['null', 'null spelled out'],
    ['yes', 'a yaml 1.1 boolean'],
    ['no', 'a yaml 1.1 boolean'],
    ['on', 'a yaml 1.1 boolean'],
    ['0755', 'an octal-looking string'],
    ['1.0', 'a number-looking string'],
    ['#hash', 'a comment start'],
    ['- dash', 'a sequence entry'],
    ['key: value', 'a mapping'],
    ['', 'the empty string'],
  ])('quotes %s (%s)', (value) => {
    const text = emit({
      repos: [],
      people: [{ id: 'x', name: value, emails: [], names: [], commits: 1 }],
    });

    expect(text).toContain(`name: "${value}"`);
  });

  it('leaves ordinary values unquoted', () => {
    const text = emit({
      repos: [],
      people: [
        { id: 'ada', name: 'Ada Lovelace', emails: ['ada@acme.com'], names: [], commits: 1 },
      ],
    });

    expect(text).toContain('name: Ada Lovelace');
    expect(text).toContain('- ada@acme.com');
  });

  it('leaves numbers as numbers', () => {
    const text = emit({ repos: [{ name: 'battery', commits: 10 }], people: [] });

    expect(text).toContain('commits: 10');
  });
});

describe('quoting survives a re-scan', () => {
  it('quotes a hazardous value inside a refreshed list', () => {
    const person = { id: 'x', name: 'Paul', emails: ['p@acme.com'], names: ['Paul'], commits: 1 };
    writeConfig(file, mergeScan(loadConfig(file), { repos: [], people: [person] }));

    writeConfig(
      file,
      mergeScan(loadConfig(file), { repos: [], people: [{ ...person, names: ['=', 'Paul'] }] }),
    );

    expect(readFileSync(file, 'utf8')).toContain('- "="');
  });

  it('quotes a hazardous value inside a refreshed email list', () => {
    const person = { id: 'x', name: 'Paul', emails: ['p@acme.com'], names: ['Paul'], commits: 1 };
    writeConfig(file, mergeScan(loadConfig(file), { repos: [], people: [person] }));

    writeConfig(
      file,
      mergeScan(loadConfig(file), { repos: [], people: [{ ...person, emails: ['no'] }] }),
    );

    expect(readFileSync(file, 'utf8')).toContain('- "no"');
  });
});

describe('a person whose display name changes', () => {
  const emit = (people) => {
    writeConfig(file, mergeScan(loadConfig(file), { repos: [], people }));
    return parse(readFileSync(file, 'utf8'));
  };

  const before = [
    { id: 'ghopper', name: '=', emails: ['ghopper@acme.com'], names: ['='], commits: 24 },
  ];
  const after = [
    {
      id: 'grace-hopper',
      name: 'Grace Hopper',
      emails: ['ghopper@acme.com'],
      names: ['=', 'Grace Hopper'],
      commits: 24,
    },
  ];

  it('keeps one row rather than orphaning the old one', () => {
    emit(before);

    expect(emit(after).people).toHaveLength(1);
  });

  it('keeps the id the config was already written with', () => {
    emit(before);

    expect(emit(after).people[0].id).toBe('ghopper');
  });

  it('keeps a hand-set team through the rename', () => {
    emit(before);
    writeFileSync(file, readFileSync(file, 'utf8').replace('team: null', 'team: external'));

    expect(emit(after).people[0].team).toBe('external');
  });

  it('matches on any shared address, not only the first', () => {
    emit([
      {
        id: 'ada',
        name: 'Ada',
        emails: ['ada@acme.com', 'ada@example.net'],
        names: ['Ada'],
        commits: 5,
      },
    ]);

    const config = emit([
      {
        id: 'ada-lovelace',
        name: 'Ada Lovelace',
        emails: ['ada@example.net'],
        names: ['Ada Lovelace'],
        commits: 6,
      },
    ]);

    expect(config.people).toHaveLength(1);
    expect(config.people[0].id).toBe('ada');
  });

  it('still adds a genuinely new person', () => {
    emit(before);

    const config = emit([
      ...before,
      { id: 'grace', name: 'Grace', emails: ['grace@acme.com'], names: ['Grace'], commits: 1 },
    ]);

    expect(config.people.map((p) => p.id).sort()).toEqual(['grace', 'ghopper']);
  });
});

describe('a hand-set display name', () => {
  it('survives a re-scan', () => {
    const person = {
      id: 'ml',
      name: 'mhopper',
      emails: ['m@acme.com'],
      names: ['mhopper'],
      commits: 188,
    };
    writeConfig(file, mergeScan(loadConfig(file), { repos: [], people: [person] }));
    writeFileSync(
      file,
      readFileSync(file, 'utf8').replace('name: mhopper', 'name: Barbara Liskov'),
    );

    writeConfig(file, mergeScan(loadConfig(file), { repos: [], people: [person] }));

    expect(parse(readFileSync(file, 'utf8')).people[0].name).toBe('Barbara Liskov');
  });
});

describe('matching a row by address', () => {
  const emit = (people) => {
    writeConfig(file, mergeScan(loadConfig(file), { repos: [], people }));
    return parse(readFileSync(file, 'utf8'));
  };

  it('does not match two people through an address with no local part', () => {
    emit([
      {
        id: 'sabrina',
        name: 'Sabrina',
        emails: ['mhamilton@acme.com', '@acme.com'],
        names: ['Sabrina'],
        commits: 899,
      },
    ]);

    const config = emit([
      {
        id: 'sabrina',
        name: 'Sabrina',
        emails: ['mhamilton@acme.com', '@acme.com'],
        names: ['Sabrina'],
        commits: 899,
      },
      {
        id: 'shawn',
        name: 'Shawn',
        emails: ['@acme.com', 'dknuth@acme.com'],
        names: ['Shawn'],
        commits: 43,
      },
    ]);

    expect(config.people.map((p) => p.id).sort()).toEqual(['sabrina', 'shawn']);
  });
});

describe('reproposing teams', () => {
  const person = { id: 'bo', name: 'Bo', emails: ['bo@outside.net'], names: ['Bo'], commits: 3 };

  const emit = (people, options) => {
    writeConfig(file, mergeScan(loadConfig(file), { repos: [], people }, options));
    return parse(readFileSync(file, 'utf8'));
  };

  it('leaves a hand-set team alone by default', () => {
    emit([{ ...person, team: 'acme' }]);
    writeFileSync(file, readFileSync(file, 'utf8').replace('team: acme', 'team: bots'));

    expect(emit([{ ...person, team: 'external' }]).people[0].team).toBe('bots');
  });

  it('overwrites it when asked to repropose', () => {
    emit([{ ...person, team: 'acme' }]);
    writeFileSync(file, readFileSync(file, 'utf8').replace('team: acme', 'team: bots'));

    expect(emit([{ ...person, team: 'external' }], { repropose: true }).people[0].team).toBe(
      'external',
    );
  });

  it('leaves a repo level of detail alone even when reproposing', () => {
    writeConfig(
      file,
      mergeScan(loadConfig(file), { repos: [{ name: 'a', commits: 1 }], people: [] }),
    );
    writeFileSync(file, readFileSync(file, 'utf8').replace('    lod: 1', '    lod: 3'));

    writeConfig(
      file,
      mergeScan(
        loadConfig(file),
        { repos: [{ name: 'a', commits: 2 }], people: [] },
        { repropose: true },
      ),
    );

    expect(parse(readFileSync(file, 'utf8')).repos[0].lod).toBe(3);
  });
});

describe('rows the config folded into another', () => {
  const ada = { id: 'ada', name: 'Ada', emails: ['ada@acme.com'], names: ['Ada'], commits: 5 };
  const alias = {
    id: 'ada2',
    name: 'ada2',
    emails: ['1+ada2@users.noreply.github.com'],
    names: ['ada2'],
    commits: 2,
  };

  it('are removed rather than left marked missing', () => {
    writeConfig(file, mergeScan(loadConfig(file), { repos: [], people: [ada, alias] }));

    writeConfig(
      file,
      mergeScan(
        loadConfig(file),
        { repos: [], people: [{ ...ada, commits: 7 }] },
        { merged: ['ada2'] },
      ),
    );

    expect(parse(readFileSync(file, 'utf8')).people.map((p) => p.id)).toEqual(['ada']);
  });

  it('still marks a row that merely stopped appearing', () => {
    writeConfig(file, mergeScan(loadConfig(file), { repos: [], people: [ada, alias] }));
    writeConfig(file, mergeScan(loadConfig(file), { repos: [], people: [ada] }));

    const config = parse(readFileSync(file, 'utf8'));

    expect(config.people.find((p) => p.id === 'ada2').missing).toBe(true);
  });
});

describe('the previous contents', () => {
  it('are kept beside the file on every write', () => {
    writeConfig(file, mergeScan(loadConfig(file), { repos, people }));
    const first = readFileSync(file, 'utf8');

    writeConfig(file, mergeScan(loadConfig(file), { repos: [], people: [] }));

    expect(readFileSync(`${file}.bak`, 'utf8')).toBe(first);
  });

  it('are not invented on the first write', () => {
    writeConfig(file, mergeScan(loadConfig(file), { repos, people }));

    expect(existsSync(`${file}.bak`)).toBe(false);
  });
});

describe('the owners a scan was run for', () => {
  it('are recorded, so later commands do not need the flag again', () => {
    const config = round({ repos, people, owners: ['Acme'] });

    expect(config.owners).toEqual(['Acme']);
  });

  it('are left alone once set, since they are a decision', () => {
    round({ repos, people, owners: ['Acme'] });

    expect(round({ repos, people, owners: ['Globex'] }).owners).toEqual(['Acme']);
  });

  it('are absent when a scan names none', () => {
    expect(round({ repos, people }).owners).toBeUndefined();
  });
});

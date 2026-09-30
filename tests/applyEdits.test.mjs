import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { applyEdits, loadConfig, mergeScan, writeConfig } from '../scripts/org/vizConfig.mjs';

let file;

const repos = [
  { name: 'battery', remote: 'https://github.com/Acme/battery', commits: 10, files: 4 },
];
const people = [
  { id: 'ada', name: 'Ada', emails: ['ada@acme.com'], names: ['Ada'], commits: 7 },
  { id: 'bo', name: 'Bo', emails: ['bo@acme.com'], names: ['Bo'], commits: 3 },
];

beforeEach(() => {
  file = path.join(mkdtempSync(path.join(tmpdir(), 'rv-edit-')), 'viz.yaml');
  writeConfig(file, mergeScan(loadConfig(file), { repos, people }));
});
afterEach(() => rmSync(path.dirname(file), { recursive: true, force: true }));

const edit = (...edits) => {
  const doc = loadConfig(file);
  applyEdits(doc, edits);
  writeConfig(file, doc);
  return parse(readFileSync(file, 'utf8'));
};

describe('editing a row', () => {
  it('sets a level of detail on a repo', () => {
    expect(edit({ section: 'repos', id: 'battery', field: 'lod', value: 3 }).repos[0].lod).toBe(3);
  });

  it('sets a team on a person', () => {
    expect(
      edit({ section: 'people', id: 'bo', field: 'team', value: 'external' }).people[1].team,
    ).toBe('external');
  });

  it('renames a person without touching anyone else', () => {
    const config = edit({ section: 'people', id: 'ada', field: 'name', value: 'Ada Lovelace' });

    expect(config.people.map((p) => p.name)).toEqual(['Ada Lovelace', 'Bo']);
  });

  it('applies several edits at once', () => {
    const config = edit(
      { section: 'repos', id: 'battery', field: 'lod', value: 0 },
      { section: 'people', id: 'ada', field: 'team', value: 'bots' },
    );

    expect([config.repos[0].lod, config.people[0].team]).toEqual([0, 'bots']);
  });

  it('adds a field the row did not have', () => {
    expect(
      edit({ section: 'repos', id: 'battery', field: 'project', value: 'core' }).repos[0].project,
    ).toBe('core');
  });

  it('removes a field when the value is null', () => {
    edit({ section: 'repos', id: 'battery', field: 'project', value: 'core' });

    expect(
      edit({ section: 'repos', id: 'battery', field: 'project', value: null }).repos[0].project,
    ).toBeUndefined();
  });
});

describe('what the editor may not write', () => {
  it.each([
    ['repos', 'battery', 'commits'],
    ['repos', 'battery', 'remote'],
    ['people', 'ada', 'emails'],
    ['people', 'ada', 'commits'],
  ])('refuses %s.%s.%s, which the scan owns', (section, id, field) => {
    expect(() => edit({ section, id, field, value: 1 })).toThrow(/scan/i);
  });

  it('refuses an unknown section', () => {
    expect(() => edit({ section: 'windows', id: 'x', field: 'name', value: 'X' })).toThrow(
      /section/i,
    );
  });

  it('refuses an unknown row', () => {
    expect(() => edit({ section: 'repos', id: 'nope', field: 'lod', value: 1 })).toThrow(/nope/);
  });

  it('applies nothing at all when one edit in the batch is refused', () => {
    expect(() =>
      edit(
        { section: 'repos', id: 'battery', field: 'lod', value: 3 },
        { section: 'repos', id: 'nope', field: 'lod', value: 1 },
      ),
    ).toThrow();

    expect(parse(readFileSync(file, 'utf8')).repos[0].lod).toBe(1);
  });
});

describe('merge groups', () => {
  it('adds one', () => {
    expect(edit({ section: 'merge', op: 'add', group: ['ada', 'bo'] }).merge).toEqual([
      ['ada', 'bo'],
    ]);
  });

  it('removes one by its first id', () => {
    edit({ section: 'merge', op: 'add', group: ['ada', 'bo'] });

    expect(edit({ section: 'merge', op: 'remove', group: ['ada'] }).merge).toEqual([]);
  });

  it('refuses a group naming a row that does not exist', () => {
    expect(() => edit({ section: 'merge', op: 'add', group: ['ada', 'ghost'] })).toThrow(/ghost/);
  });
});

describe('comments', () => {
  it('survive an edit', () => {
    const withComment = readFileSync(file, 'utf8').replace(
      '  - name: battery',
      '  # the battery one\n  - name: battery',
    );
    require('node:fs').writeFileSync(file, withComment);

    edit({ section: 'repos', id: 'battery', field: 'lod', value: 2 });

    expect(readFileSync(file, 'utf8')).toContain('# the battery one');
  });
});

describe('merging folds the rows right away', () => {
  it('leaves one row, not two', () => {
    const config = edit({ section: 'merge', op: 'add', group: ['ada', 'bo'] });

    expect(config.people.map((p) => p.id)).toEqual(['ada']);
  });

  it('adds the commits up', () => {
    expect(edit({ section: 'merge', op: 'add', group: ['ada', 'bo'] }).people[0].commits).toBe(10);
  });

  it('keeps every address and spelling', () => {
    const [person] = edit({ section: 'merge', op: 'add', group: ['ada', 'bo'] }).people;

    expect(person.emails.sort()).toEqual(['ada@acme.com', 'bo@acme.com']);
    expect(person.names.sort()).toEqual(['Ada', 'Bo']);
  });

  it('keeps the first row name and team', () => {
    edit({ section: 'people', id: 'ada', field: 'name', value: 'Ada Lovelace' });
    edit({ section: 'people', id: 'ada', field: 'team', value: 'acme' });

    const [person] = edit({ section: 'merge', op: 'add', group: ['ada', 'bo'] }).people;

    expect(person.name).toBe('Ada Lovelace');
    expect(person.team).toBe('acme');
  });

  it('records the group so a re-scan keeps them together', () => {
    expect(edit({ section: 'merge', op: 'add', group: ['ada', 'bo'] }).merge).toEqual([
      ['ada', 'bo'],
    ]);
  });

  it('refuses to fold a row into itself', () => {
    expect(() => edit({ section: 'merge', op: 'add', group: ['ada', 'ada'] })).toThrow(
      /twice|itself/i,
    );
  });

  it('leaves the merged row in place when the group is undone', () => {
    edit({ section: 'merge', op: 'add', group: ['ada', 'bo'] });

    const config = edit({ section: 'merge', op: 'remove', group: ['ada'] });

    expect(config.merge).toEqual([]);
    expect(config.people.map((p) => p.id)).toEqual(['ada']);
  });
});

describe('a group that overlaps one already recorded', () => {
  it('replaces it rather than leaving both', () => {
    edit({ section: 'merge', op: 'add', group: ['ada', 'bo'] });

    // Undo it by hand, then merge the same pair the other way round.
    const config = edit({ section: 'merge', op: 'remove', group: ['ada'] });
    expect(config.merge).toEqual([]);
  });

  it('refuses to merge a row that is already folded away', () => {
    edit({ section: 'merge', op: 'add', group: ['ada', 'bo'] });

    expect(() => edit({ section: 'merge', op: 'add', group: ['ada', 'bo'] })).toThrow(/bo/);
  });

  it('drops an older group that shares any id, not only the first', () => {
    const doc = loadConfig(file);
    applyEdits(doc, [{ section: 'merge', op: 'add', group: ['ada', 'bo'] }]);
    writeConfig(file, doc);

    // A later scan splits them again, and this time bo is the keeper.
    const second = loadConfig(file);
    const rows = /** @type {any} */ (second.get('people'));
    rows.add(
      second.createNode({
        id: 'bo',
        name: 'Bo',
        emails: ['bo@acme.com'],
        names: ['Bo'],
        commits: 3,
      }),
    );
    applyEdits(second, [{ section: 'merge', op: 'add', group: ['bo', 'ada'] }]);
    writeConfig(file, second);

    expect(parse(readFileSync(file, 'utf8')).merge).toEqual([['bo', 'ada']]);
  });
});

describe('the page title', () => {
  it('is written at the top of the config', () => {
    const config = edit({ section: 'settings', field: 'title', value: 'Six Years at Dephy' });

    expect(config.title).toBe('Six Years at Dephy');
  });

  it('goes away again when it is cleared, so the default comes back', () => {
    edit({ section: 'settings', field: 'title', value: 'Something' });
    const config = edit({ section: 'settings', field: 'title', value: '' });

    expect(config.title).toBeUndefined();
  });

  it("refuses a setting that is not the editor's to write", () => {
    const doc = loadConfig(file);

    expect(() => applyEdits(doc, [{ section: 'settings', field: 'owners', value: ['x'] }])).toThrow(
      /cannot be edited/,
    );
  });
});

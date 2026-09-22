import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { createConfigApi } from '../scripts/org/configApi.mjs';
import { loadConfig, mergeScan, writeConfig } from '../scripts/org/vizConfig.mjs';

let dir;
let file;
let api;

const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const gravatarFound = async () => ({
  ok: true,
  headers: { get: () => 'image/png' },
  arrayBuffer: async () => png.buffer,
});
const gravatarMissing = async () => ({ ok: false, headers: { get: () => null } });

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'rv-api-'));
  file = path.join(dir, 'viz.yaml');
  writeConfig(
    file,
    mergeScan(loadConfig(file), {
      repos: [
        { name: 'battery', remote: 'https://github.com/Acme/battery', commits: 10, files: 4 },
      ],
      people: [{ id: 'ada', name: 'Ada', emails: ['ada@acme.com'], names: ['Ada'], commits: 7 }],
    }),
  );
  api = createConfigApi({ configPath: file, fetchImpl: gravatarFound });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('read', () => {
  it('returns the parsed config', async () => {
    const { config } = await api.read();

    expect(config.repos[0].name).toBe('battery');
    expect(config.people[0].id).toBe('ada');
  });

  it('reports where the file is, so the page can show it', async () => {
    expect((await api.read()).path).toBe(file);
  });
});

describe('edit', () => {
  it('writes an allowed field', async () => {
    await api.edit([{ section: 'repos', id: 'battery', field: 'lod', value: 3 }]);

    expect(parse(readFileSync(file, 'utf8')).repos[0].lod).toBe(3);
  });

  it('returns the config as it now stands', async () => {
    const { config } = await api.edit([
      { section: 'people', id: 'ada', field: 'team', value: 'external' },
    ]);

    expect(config.people[0].team).toBe('external');
  });

  it('refuses a field the scan owns and leaves the file alone', async () => {
    const before = readFileSync(file, 'utf8');

    await expect(
      api.edit([{ section: 'repos', id: 'battery', field: 'commits', value: 1 }]),
    ).rejects.toThrow();
    expect(readFileSync(file, 'utf8')).toBe(before);
  });
});

describe('setAvatar', () => {
  it('saves a fetched gravatar next to the config', async () => {
    const { avatar } = await api.setAvatar({
      id: 'ada',
      source: 'gravatar',
      email: 'ada@acme.com',
    });

    expect(existsSync(path.join(dir, 'avatars', 'ada.png'))).toBe(true);
    expect(avatar).toBe('file:avatars/ada.png');
  });

  it('records the avatar on the person', async () => {
    await api.setAvatar({ id: 'ada', source: 'gravatar', email: 'ada@acme.com' });

    expect(parse(readFileSync(file, 'utf8')).people[0].avatar).toBe('file:avatars/ada.png');
  });

  it('reports a miss rather than writing a placeholder', async () => {
    const quiet = createConfigApi({ configPath: file, fetchImpl: gravatarMissing });

    await expect(
      quiet.setAvatar({ id: 'ada', source: 'gravatar', email: 'ada@acme.com' }),
    ).rejects.toThrow(/no gravatar/i);
    expect(existsSync(path.join(dir, 'avatars', 'ada.png'))).toBe(false);
  });

  it('writes a generated tile when asked for initials', async () => {
    const { avatar } = await api.setAvatar({ id: 'ada', source: 'initials' });

    expect(avatar).toBe('file:avatars/ada.svg');
    expect(readFileSync(path.join(dir, 'avatars', 'ada.svg'), 'utf8')).toContain('>A<');
  });

  it('accepts a file already on disk', async () => {
    const chosen = path.join(dir, 'chosen.png');
    writeFileSync(chosen, Buffer.from(png));

    const { avatar } = await api.setAvatar({ id: 'ada', source: 'file', filePath: chosen });

    expect(avatar).toBe('file:avatars/ada.png');
    expect(readFileSync(path.join(dir, 'avatars', 'ada.png'))).toEqual(Buffer.from(png));
  });

  it('refuses an unknown person', async () => {
    await expect(api.setAvatar({ id: 'ghost', source: 'initials' })).rejects.toThrow(/ghost/);
  });

  it('clears an avatar', async () => {
    await api.setAvatar({ id: 'ada', source: 'initials' });

    const { config } = await api.setAvatar({ id: 'ada', source: 'none' });

    expect(config.people[0].avatar).toBeUndefined();
  });
});

describe('a generated tile follows the name', () => {
  it('is redrawn when the name changes', async () => {
    await api.setAvatar({ id: 'ada', source: 'initials' });
    expect(readFileSync(path.join(dir, 'avatars', 'ada.svg'), 'utf8')).toContain('>A<');

    await api.edit([{ section: 'people', id: 'ada', field: 'name', value: 'Ada Lovelace' }]);

    expect(readFileSync(path.join(dir, 'avatars', 'ada.svg'), 'utf8')).toContain('>AL<');
  });

  it('keeps its colour, which comes from the id', async () => {
    await api.setAvatar({ id: 'ada', source: 'initials' });
    const before = readFileSync(path.join(dir, 'avatars', 'ada.svg'), 'utf8');
    const hue = before.match(/hsl\((\d+)/)[1];

    await api.edit([{ section: 'people', id: 'ada', field: 'name', value: 'Someone Else' }]);

    expect(readFileSync(path.join(dir, 'avatars', 'ada.svg'), 'utf8')).toContain(`hsl(${hue}`);
  });

  it('leaves a fetched gravatar alone when the name changes', async () => {
    await api.setAvatar({ id: 'ada', source: 'gravatar', email: 'ada@acme.com' });

    await api.edit([{ section: 'people', id: 'ada', field: 'name', value: 'Ada Lovelace' }]);

    expect(existsSync(path.join(dir, 'avatars', 'ada.png'))).toBe(true);
    expect(existsSync(path.join(dir, 'avatars', 'ada.svg'))).toBe(false);
  });

  it('does not invent a tile for someone who has no avatar', async () => {
    await api.edit([{ section: 'people', id: 'ada', field: 'name', value: 'Ada Lovelace' }]);

    expect(existsSync(path.join(dir, 'avatars', 'ada.svg'))).toBe(false);
  });
});

describe('fillAvatars', () => {
  beforeEach(() => {
    writeConfig(
      file,
      mergeScan(loadConfig(file), {
        repos: [],
        people: [
          { id: 'ada', name: 'Ada', emails: ['ada@acme.com'], names: ['Ada'], commits: 7 },
          { id: 'bo', name: 'Bo', emails: ['bo@acme.com'], names: ['Bo'], commits: 3 },
          { id: 'cy', name: 'Cy', emails: [], names: ['Cy'], commits: 1 },
        ],
      }),
    );
  });

  it('fetches a gravatar for everyone who has one', async () => {
    const { summary } = await api.fillAvatars();

    expect(summary.gravatar).toBe(2);
    expect(existsSync(path.join(dir, 'avatars', 'ada.png'))).toBe(true);
  });

  it('falls back to initials for the rest', async () => {
    const quiet = createConfigApi({ configPath: file, fetchImpl: gravatarMissing });

    const { summary } = await quiet.fillAvatars();

    expect(summary.initials).toBe(3);
    expect(existsSync(path.join(dir, 'avatars', 'bo.svg'))).toBe(true);
  });

  it('gives someone with no address an initials tile without asking gravatar', async () => {
    let asked = 0;
    const counting = createConfigApi({
      configPath: file,
      fetchImpl: async () => {
        asked += 1;
        return gravatarFound();
      },
    });

    await counting.fillAvatars();

    expect(asked).toBe(2);
    expect(existsSync(path.join(dir, 'avatars', 'cy.svg'))).toBe(true);
  });

  it('leaves an avatar that is already set', async () => {
    await api.setAvatar({ id: 'ada', source: 'initials' });

    const { summary } = await api.fillAvatars();

    expect(summary.kept).toBe(1);
    expect(existsSync(path.join(dir, 'avatars', 'ada.svg'))).toBe(true);
  });

  it('replaces them all when told to', async () => {
    await api.setAvatar({ id: 'ada', source: 'initials' });

    const { summary } = await api.fillAvatars({ overwrite: true });

    expect(summary.kept).toBe(0);
    expect(existsSync(path.join(dir, 'avatars', 'ada.png'))).toBe(true);
  });

  it('skips people on a hidden team', async () => {
    await api.edit([
      { section: 'teams', id: 'bots', field: 'shown', value: false },
      { section: 'people', id: 'cy', field: 'team', value: 'bots' },
    ]);

    const { summary } = await api.fillAvatars();

    expect(summary.skipped).toBe(1);
    expect(existsSync(path.join(dir, 'avatars', 'cy.svg'))).toBe(false);
  });

  it('writes the config once, with every avatar recorded', async () => {
    await api.fillAvatars();

    const people = parse(readFileSync(file, 'utf8')).people;
    expect(people.map((p) => p.avatar)).toEqual([
      'file:avatars/ada.png',
      'file:avatars/bo.png',
      'file:avatars/cy.svg',
    ]);
  });
});

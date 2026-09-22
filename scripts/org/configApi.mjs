/**
 * What the config editor calls.
 *
 * Plain async methods, so the behaviour is testable without a browser or a
 * server. The vite plugin is the thin layer that maps HTTP onto these.
 *
 * Avatars are written next to the config, outside this repository, for the
 * same reason the config is: they are part of the data.
 */

import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fetchGravatar, initialsSvg } from './avatars.mjs';
import { applyEdits, loadConfig, writeConfig } from './vizConfig.mjs';

/**
 * @param {{ configPath: string, fetchImpl?: Parameters<typeof fetchGravatar>[1]['fetchImpl'] }} options
 */
export function createConfigApi({ configPath, fetchImpl = fetch }) {
  const avatarDir = path.join(path.dirname(configPath), 'avatars');

  const load = () => loadConfig(configPath);
  const save = (doc) => {
    writeConfig(configPath, doc);
    return { path: configPath, config: doc.toJS() };
  };

  /** @param {import('yaml').Document} doc */
  const people = (doc) => /** @type {any} */ (doc.get('people'))?.items ?? [];

  /** @param {import('yaml').Document} doc */
  const findPerson = (doc, id) => people(doc).find((item) => String(item.get('id')) === String(id));

  const firstEmail = (person) => String(person.get('emails')?.items?.[0]?.value ?? '');

  /** Write the generated tile for a person and point their row at it. */
  const writeTile = (person, id) => {
    mkdirSync(avatarDir, { recursive: true });
    const file = `${id}.svg`;
    writeFileSync(path.join(avatarDir, file), initialsSvg(String(person.get('name') ?? id), id));
    person.set('avatar', `file:avatars/${file}`);
    return file;
  };

  /** Remove any other avatar this person has, so there is only ever one. */
  const dropOtherAvatars = (id, keep) => {
    for (const ext of ['png', 'svg', 'jpg', 'jpeg', 'webp']) {
      const stale = `${id}.${ext}`;
      if (stale !== keep) rmSync(path.join(avatarDir, stale), { force: true });
    }
  };

  return {
    async read() {
      const doc = load();
      return { path: configPath, config: doc.toJS() };
    },

    /** @param {Array<Record<string, any>>} edits */
    async edit(edits) {
      const doc = load();
      applyEdits(doc, edits);

      // A generated tile is drawn from the name, so renaming someone has to
      // redraw it. A fetched image is a photograph of a person and is left
      // alone; so is a row with no avatar at all.
      for (const edit of edits) {
        if (edit.section !== 'people' || edit.field !== 'name') continue;
        const person = findPerson(doc, edit.id);
        if (String(person?.get('avatar') ?? '').endsWith('.svg')) writeTile(person, edit.id);
      }

      return save(doc);
    },

    /**
     * Give everyone an avatar: their gravatar where there is one, a generated
     * tile otherwise. People on a hidden team are left out, since they never
     * reach the visualization.
     *
     * @param {{ overwrite?: boolean }} [options]
     */
    async fillAvatars({ overwrite = false } = {}) {
      const doc = load();
      const summary = { gravatar: 0, initials: 0, kept: 0, skipped: 0 };
      mkdirSync(avatarDir, { recursive: true });

      const teamRows = /** @type {any} */ (doc.get('teams'))?.items ?? [];
      const hidden = new Set(
        teamRows
          .filter((team) => team.get('shown') === false)
          .map((team) => String(team.get('id'))),
      );

      for (const person of people(doc)) {
        const id = String(person.get('id'));
        if (hidden.has(String(person.get('team')))) {
          summary.skipped += 1;
          continue;
        }
        if (person.get('avatar') && !overwrite) {
          summary.kept += 1;
          continue;
        }

        const address = firstEmail(person);
        const image = address ? await fetchGravatar(address, { fetchImpl }) : null;

        if (image) {
          const file = `${id}.png`;
          writeFileSync(path.join(avatarDir, file), image.body);
          person.set('avatar', `file:avatars/${file}`);
          dropOtherAvatars(id, file);
          summary.gravatar += 1;
        } else {
          dropOtherAvatars(id, writeTile(person, id));
          summary.initials += 1;
        }
      }

      return { ...save(doc), summary };
    },

    /**
     * @param {{
     *   id: string,
     *   source: 'gravatar' | 'initials' | 'file' | 'none',
     *   email?: string,
     *   filePath?: string,
     * }} request
     */
    async setAvatar({ id, source, email, filePath }) {
      const doc = load();
      const person = findPerson(doc, id);
      if (!person) throw new Error(`No people row with id ${id}`);

      if (source === 'none') {
        person.delete('avatar');
        return save(doc);
      }

      mkdirSync(avatarDir, { recursive: true });

      let file;
      if (source === 'gravatar') {
        const address = email ?? String(person.get('emails')?.items?.[0]?.value ?? '');
        const image = await fetchGravatar(address, { fetchImpl });
        if (!image) throw new Error(`No gravatar for ${address}`);
        file = `${id}.png`;
        writeFileSync(path.join(avatarDir, file), image.body);
      } else if (source === 'initials') {
        file = writeTile(person, id);
      } else {
        if (!filePath) throw new Error('No file given');
        file = `${id}${path.extname(filePath) || '.png'}`;
        copyFileSync(filePath, path.join(avatarDir, file));
      }

      dropOtherAvatars(id, file);

      const avatar = `file:avatars/${file}`;
      person.set('avatar', avatar);
      return { ...save(doc), avatar };
    },
  };
}

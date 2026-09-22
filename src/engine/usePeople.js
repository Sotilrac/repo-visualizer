/**
 * The people the config describes, if an export is present.
 *
 * Without it the visualization falls back to raw git authors, which means
 * one actor per address: the same person committing from work and from a
 * personal account appears twice. With it, every address resolves to the
 * person the config merged them into, with the name, avatar and team colour
 * set in the editor.
 */

import { useEffect, useState } from 'react';

/** @typedef {{ name: string, hue?: number, avatar?: string, team?: string }} Person */

const EMPTY = { byEmail: {}, people: {} };

export function usePeople() {
  const [people, setPeople] = useState(EMPTY);

  useEffect(() => {
    let live = true;
    fetch('data/people.json')
      .then((response) => (response.ok ? response.json() : EMPTY))
      .then((payload) => {
        if (live) setPeople({ byEmail: payload.byEmail ?? {}, people: payload.people ?? {} });
      })
      .catch(() => {
        // No export, or it failed to parse. Raw git authors it is.
      });
    return () => {
      live = false;
    };
  }, []);

  return people;
}

/**
 * Resolve a commit's author to a person from the config.
 *
 * @param {{ byEmail: Record<string, string>, people: Record<string, Person> }} directory
 * @param {{ author?: string, authorEmail?: string }} commit
 * @returns {{ key: string, name: string, hue?: number, avatar?: string } | null}
 *   null when the config knows this address and has hidden them
 */
export function resolveAuthor(directory, commit) {
  if (!commit) return null;
  const email = (commit.authorEmail ?? '').trim().toLowerCase();
  const id = directory.byEmail[email];

  if (id) {
    const person = directory.people[id];
    return person ? { key: id, ...person } : null;
  }

  // An address the config has no row for, which happens between a scan and
  // an edit. Draw them, so a contributor is never silently absent.
  const hasDirectory = Object.keys(directory.byEmail).length > 0;
  if (hasDirectory && isHidden(directory, email)) return null;

  return { key: email || (commit.author ?? 'unknown'), name: commit.author ?? email };
}

/** An address that maps to a person the export left out is a hidden one. */
function isHidden(directory, email) {
  const id = directory.byEmail[email];
  return Boolean(id) && !directory.people[id];
}

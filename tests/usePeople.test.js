import { describe, expect, it } from 'vitest';
import { resolveAuthor } from '../src/engine/usePeople.js';

const directory = {
  byEmail: {
    'ada@acme.com': 'ada',
    'a.lovelace@example.net': 'ada',
    'bo@acme.com': 'bo',
  },
  people: {
    ada: { name: 'Ada Lovelace', hue: 210, avatar: 'data/avatars/ada.png' },
    bo: { name: 'Bo', hue: 210 },
  },
};

describe('resolveAuthor', () => {
  it('collapses two addresses onto one person', () => {
    const first = resolveAuthor(directory, { author: 'Ada', authorEmail: 'ada@acme.com' });
    const second = resolveAuthor(directory, {
      author: 'ada',
      authorEmail: 'a.lovelace@example.net',
    });

    expect(first.key).toBe(second.key);
  });

  it('uses the name from the config, not the one in the commit', () => {
    expect(resolveAuthor(directory, { author: 'ada', authorEmail: 'ada@acme.com' }).name).toBe(
      'Ada Lovelace',
    );
  });

  it('carries the avatar and the team colour', () => {
    const person = resolveAuthor(directory, { authorEmail: 'ada@acme.com' });

    expect(person.avatar).toBe('data/avatars/ada.png');
    expect(person.hue).toBe(210);
  });

  it('matches an address whatever its casing', () => {
    expect(resolveAuthor(directory, { authorEmail: 'Ada@ACME.com' }).key).toBe('ada');
  });

  it('falls back to the commit author when the config has no row', () => {
    const person = resolveAuthor(directory, { author: 'Newcomer', authorEmail: 'new@acme.com' });

    expect(person.name).toBe('Newcomer');
    expect(person.key).toBe('new@acme.com');
  });

  it('drops someone the export left out, which is how a hidden team stays off', () => {
    const withHidden = { byEmail: { 'ci@acme.com': 'ci' }, people: {} };

    expect(resolveAuthor(withHidden, { author: 'ci', authorEmail: 'ci@acme.com' })).toBeNull();
  });

  it('draws everyone when there is no export at all', () => {
    const person = resolveAuthor(
      { byEmail: {}, people: {} },
      { author: 'Ada', authorEmail: 'a@b.c' },
    );

    expect(person.name).toBe('Ada');
  });

  it('copes with a commit that has no address', () => {
    expect(resolveAuthor(directory, { author: 'Ada' }).key).toBe('Ada');
  });
});

describe('nothing to resolve', () => {
  it('answers null for no commit at all', () => {
    expect(resolveAuthor(directory, null)).toBeNull();
    expect(resolveAuthor(directory, undefined)).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { bucketIdentities, slugFor } from '../scripts/org/identities.mjs';

/** @param {[string, string, number]} row name, email, commits */
const id = ([name, email, commits]) => ({ name, email, commits });

describe('bucketIdentities', () => {
  it('merges identities sharing an email', () => {
    const people = bucketIdentities([
      id(['Grace Hopper', 'g.hopper1906@example.net', 2004]),
      id(['ghopper', 'g.hopper1906@example.net', 330]),
      id(['Unknown', 'g.hopper1906@example.net', 233]),
    ]);

    expect(people).toHaveLength(1);
    expect(people[0].commits).toBe(2567);
  });

  it('merges identities sharing a normalized name', () => {
    const people = bucketIdentities([
      id(['Ada Lovelace', 'ada.lovelace@example.net', 776]),
      id(['ada lovelace', 'ada@acme.com', 485]),
    ]);

    expect(people).toHaveLength(1);
    expect(people[0].emails.sort()).toEqual(['ada.lovelace@example.net', 'ada@acme.com']);
  });

  it('merges transitively through a shared email', () => {
    const people = bucketIdentities([
      id(['Alan Turing', 'alan@acme.com', 1525]),
      id(['Alan Turing', 'a.turing@example.net', 497]),
      id(['aturing', 'a.turing@example.net', 342]),
    ]);

    expect(people).toHaveLength(1);
    expect(people[0].names.sort()).toEqual(['Alan Turing', 'aturing']);
  });

  it('keeps unrelated people apart', () => {
    expect(
      bucketIdentities([
        id(['Katherine Johnson', 'kjohnson@acme.com', 1821]),
        id(['Barbara Liskov', 'bliskov@acme.com', 1693]),
      ]),
    ).toHaveLength(2);
  });

  it('names a person after their most prolific identity', () => {
    const [person] = bucketIdentities([
      id(['em', 'emilie@acme.com', 841]),
      id(['Emilie du Chatelet', 'emilie@acme.com', 1063]),
    ]);

    expect(person.name).toBe('Emilie du Chatelet');
  });

  it('skips a spelling that is not usable as a name, however prolific', () => {
    const [person] = bucketIdentities([
      id(['=', 'ghopper@acme.com', 24]),
      id(['Grace Hopper', 'ghopper@acme.com', 3]),
    ]);

    expect(person.name).toBe('Grace Hopper');
    expect(person.names).toContain('=');
  });

  it('keeps an unusable name when there is no alternative', () => {
    const [person] = bucketIdentities([id(['=', 'ghopper@acme.com', 24])]);

    expect(person.name).toBe('=');
  });

  it('prefers a full name over a bare handle', () => {
    const [person] = bucketIdentities([
      id(['jbackus77', 'jbackus@acme.com', 40]),
      id(['John Backus', 'jbackus@acme.com', 2]),
    ]);

    expect(person.name).toBe('John Backus');
  });

  it('orders people by commit count', () => {
    const people = bucketIdentities([
      id(['Small', 'small@x.com', 5]),
      id(['Big', 'big@x.com', 500]),
    ]);

    expect(people.map((p) => p.name)).toEqual(['Big', 'Small']);
  });

  it('tolerates a malformed email rather than dropping the commits', () => {
    const [person] = bucketIdentities([id(['Radia Perlman', 'rperlman@acme,com', 281])]);

    expect(person.commits).toBe(281);
    expect(person.emails).toEqual(['rperlman@acme,com']);
  });

  it('does not merge two people through an address with no local part', () => {
    const people = bucketIdentities([
      id(['Margaret Hamilton', 'mhamilton@acme.com', 899]),
      id(['Margaret Hamilton', '@acme.com', 12]),
      id(['Donald Knuth', '@acme.com', 40]),
      id(['Donald Knuth', 'dknuth@acme.com', 3]),
    ]);

    expect(people.map((p) => p.name).sort()).toEqual(['Donald Knuth', 'Margaret Hamilton']);
  });

  it('keeps a malformed address on the person it belongs to', () => {
    const [person] = bucketIdentities([
      id(['Radia Perlman', 'rperlman@acme.com', 10]),
      id(['Radia Perlman', 'rperlman@acme,com', 2]),
    ]);

    expect(person.emails.sort()).toEqual(['rperlman@acme,com', 'rperlman@acme.com']);
  });

  it('does not merge two people who share an email local part on other domains', () => {
    expect(
      bucketIdentities([
        id(['Alice Ng', 'ang@acme.com', 10]),
        id(['Adam Ng', 'ang@other.com', 10]),
      ]),
    ).toHaveLength(2);
  });
});

describe('slugFor', () => {
  it('slugifies the display name', () => {
    expect(slugFor({ name: 'Émilie du Châtelet', emails: ['emilie@acme.com'] })).toBe(
      'emilie-du-chatelet',
    );
  });

  it('falls back to the email local part when the name is unusable', () => {
    expect(slugFor({ name: '???', emails: ['emilie@acme.com'] })).toBe('emilie');
  });
});

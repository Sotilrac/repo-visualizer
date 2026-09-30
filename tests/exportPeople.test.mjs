import { describe, expect, it } from 'vitest';
import { buildPeoplePayload } from '../scripts/org/exportPeople.mjs';

const config = {
  teams: [
    { id: 'acme', name: 'Acme', hue: 210, shown: true },
    { id: 'bots', name: 'Bots', shown: false },
  ],
  people: [
    {
      id: 'ada',
      name: 'Ada Lovelace',
      team: 'acme',
      avatar: 'file:avatars/ada.png',
      emails: ['ada@acme.com', 'ada.lovelace@example.net'],
      commits: 40,
    },
    { id: 'bo', name: 'Bo', team: 'acme', emails: ['bo@acme.com'], commits: 3 },
    {
      id: 'ci',
      name: 'github-actions[bot]',
      team: 'bots',
      emails: ['1+ci@users.noreply.github.com'],
      commits: 99,
    },
  ],
};

describe('buildPeoplePayload', () => {
  it('maps every address to its person', () => {
    const { byEmail } = buildPeoplePayload(config);

    expect(byEmail['ada@acme.com']).toBe('ada');
    expect(byEmail['ada.lovelace@example.net']).toBe('ada');
  });

  it('lowercases the addresses, since git casing varies', () => {
    const { byEmail } = buildPeoplePayload({
      ...config,
      people: [{ id: 'ada', name: 'Ada', team: 'acme', emails: ['Ada@ACME.com'] }],
    });

    expect(byEmail['ada@acme.com']).toBe('ada');
  });

  it('carries the display name, not the git one', () => {
    expect(buildPeoplePayload(config).people.ada.name).toBe('Ada Lovelace');
  });

  it('turns the avatar into a url the page can load', () => {
    expect(buildPeoplePayload(config).people.ada.avatar).toBe('data/avatars/ada.png');
  });

  it('leaves the avatar unset for someone who has none', () => {
    expect(buildPeoplePayload(config).people.bo.avatar).toBeUndefined();
  });

  it('takes the colour from the team', () => {
    expect(buildPeoplePayload(config).people.ada.hue).toBe(210);
  });

  it('leaves out anyone on a hidden team', () => {
    const { people, byEmail } = buildPeoplePayload(config);

    expect(people.ci).toBeUndefined();
    expect(byEmail['1+ci@users.noreply.github.com']).toBeUndefined();
  });

  it('lists the avatar files to copy, so the exporter knows what to take', () => {
    expect(buildPeoplePayload(config).avatarFiles).toEqual(['avatars/ada.png']);
  });

  it('copes with a config that has no people yet', () => {
    expect(buildPeoplePayload({}).people).toEqual({});
  });
});

describe('a team kept out of the legend but drawn as one person', () => {
  /**
   * External contributors: too many to name and not worth a colour each, so
   * the team is hidden from the legend and drawn as a single face.
   */
  const config = {
    teams: [
      { id: 'acme', name: 'Acme', hue: 210, shown: true },
      { id: 'external', name: 'External', hue: 20, shown: false, merged: true },
      { id: 'bots', name: 'Bots', shown: false },
    ],
    people: [
      { id: 'ada', name: 'Ada', team: 'acme', emails: ['ada@acme.com'] },
      { id: 'pat', name: 'Pat', team: 'external', emails: ['pat@other.com'] },
      { id: 'sam', name: 'Sam', team: 'external', emails: ['sam@other.org'] },
      { id: 'ci', name: 'CI', team: 'bots', emails: ['ci@acme.com'] },
    ],
  };

  it('draws the whole team as one person', () => {
    const { people } = buildPeoplePayload(config);

    expect(people['team:external']).toMatchObject({ name: 'External', team: 'external' });
    expect(people.pat).toBeUndefined();
    expect(people.sam).toBeUndefined();
  });

  it('sends every address on it to that one person', () => {
    const { byEmail } = buildPeoplePayload(config);

    expect(byEmail['pat@other.com']).toBe('team:external');
    expect(byEmail['sam@other.org']).toBe('team:external');
  });

  it('still leaves a hidden team with nobody to merge into off the graph', () => {
    const { people, byEmail } = buildPeoplePayload(config);

    expect(people.ci).toBeUndefined();
    expect(byEmail['ci@acme.com']).toBeUndefined();
  });
});

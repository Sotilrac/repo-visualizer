import { describe, expect, it } from 'vitest';
import { buildPeoplePayload } from '../scripts/org/exportPeople.mjs';
import { DEFAULT_TEAMS, proposeTeam, teamFor } from '../scripts/org/teams.mjs';

const teams = [
  { id: 'acme', name: 'Acme', domains: ['acme.com', 'acme.co.uk'] },
  { id: 'globex', name: 'Globex', domains: ['globex.com'] },
  { id: 'external', name: 'External', domains: [] },
  { id: 'bots', name: 'Bots', shown: false, bots: true },
];

describe('teamFor', () => {
  it('finds the team owning a domain', () => {
    expect(teamFor(teams, 'ada@acme.com')).toBe('acme');
  });

  it('matches case-insensitively', () => {
    expect(teamFor(teams, 'Ada@ACME.CoM')).toBe('acme');
  });

  it('accepts any of the domains a team lists', () => {
    expect(teamFor(teams, 'ada@acme.co.uk')).toBe('acme');
  });

  it('does not match a domain that merely ends the same way', () => {
    expect(teamFor(teams, 'spoof@notacme.com')).toBeNull();
  });

  it('returns null for an address no team claims', () => {
    expect(teamFor(teams, 'someone@elsewhere.net')).toBeNull();
  });
});

describe('proposeTeam', () => {
  it('assigns the team owning any of the addresses', () => {
    expect(
      proposeTeam({ emails: ['x@example.net', 'ada@globex.com'], names: ['Ada'] }, teams),
    ).toBe('globex');
  });

  it('prefers the first team in config order when two match', () => {
    expect(proposeTeam({ emails: ['ada@globex.com', 'ada@acme.com'], names: ['Ada'] }, teams)).toBe(
      'acme',
    );
  });

  it('falls back to external for an outside address', () => {
    expect(proposeTeam({ emails: ['dev@upstream.example'], names: ['Dev'] }, teams)).toBe(
      'external',
    );
  });

  it('assigns a bot to the bots team', () => {
    expect(
      proposeTeam(
        { emails: ['1+x[bot]@users.noreply.github.com'], names: ['github-actions[bot]'] },
        teams,
      ),
    ).toBe('bots');
  });

  it('does not treat a github noreply address as outside', () => {
    expect(
      proposeTeam({ emails: ['45+someone@users.noreply.github.com'], names: ['Someone'] }, teams),
    ).toBeNull();
  });

  it('leaves the team unset when no team claims the address and there is no external team', () => {
    const narrow = [{ id: 'acme', name: 'Acme', domains: ['acme.com'] }];

    expect(proposeTeam({ emails: ['dev@elsewhere.net'], names: ['Dev'] }, narrow)).toBeNull();
  });
});

describe('DEFAULT_TEAMS', () => {
  it('is what a fresh config starts with', () => {
    expect(DEFAULT_TEAMS.map((t) => t.id)).toEqual(['external', 'bots']);
  });

  it('hides the bots team', () => {
    expect(DEFAULT_TEAMS.find((t) => t.id === 'bots').shown).toBe(false);
  });

  it('shows the external team', () => {
    expect(DEFAULT_TEAMS.find((t) => t.id === 'external').shown).toBe(true);
  });
});

describe('a team drawn as one person', () => {
  const config = {
    teams: [
      { id: 'dephy', name: 'Dephy', hue: 210 },
      { id: 'external', name: 'External', hue: 40, merged: true },
      { id: 'bots', name: 'Bots', shown: false },
    ],
    people: [
      { id: 'ada', name: 'Ada', team: 'dephy', emails: ['ada@acme.com'] },
      { id: 'kai', name: 'Kai', team: 'external', emails: ['kai@other.com'] },
      { id: 'nia', name: 'Nia', team: 'external', emails: ['nia@third.com', 'nia@fourth.com'] },
      { id: 'bot', name: 'Bot', team: 'bots', emails: ['bot@acme.com'] },
    ],
  };

  const { byEmail, people } = buildPeoplePayload(config);

  it('gives the whole team one entry', () => {
    expect(Object.keys(people).sort()).toEqual(['ada', 'team:external']);
  });

  it('points every address on it at that entry', () => {
    expect([byEmail['kai@other.com'], byEmail['nia@third.com'], byEmail['nia@fourth.com']]).toEqual(
      ['team:external', 'team:external', 'team:external'],
    );
  });

  it('names the entry after the team, in the team colour', () => {
    expect(people['team:external']).toEqual({ name: 'External', team: 'external', hue: 40 });
  });

  it('leaves everyone else as themselves', () => {
    expect(byEmail['ada@acme.com']).toBe('ada');
  });

  it('still leaves a hidden team out', () => {
    expect(people).not.toHaveProperty('bot');
  });
});

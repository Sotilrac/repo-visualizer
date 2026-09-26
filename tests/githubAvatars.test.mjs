import { describe, expect, it } from 'vitest';
import { fetchGithubAvatar, githubAvatarUrl, githubIdentity } from '../scripts/org/avatars.mjs';

describe('githubIdentity', () => {
  it('reads the account id out of a noreply address', () => {
    expect(githubIdentity({ emails: ['483059+Sotilrac@users.noreply.github.com'] })).toEqual({
      id: '483059',
      login: 'Sotilrac',
      certain: true,
    });
  });

  it('reads the older noreply form, which has no id', () => {
    expect(githubIdentity({ emails: ['ada@users.noreply.github.com'] })).toEqual({
      login: 'ada',
      certain: true,
    });
  });

  it('prefers the noreply address over a name that looks like a handle', () => {
    const person = { emails: ['7+real@users.noreply.github.com'], names: ['guess'] };

    expect(githubIdentity(person).login).toBe('real');
  });

  it('falls back to a name that could be a login, and says it is a guess', () => {
    expect(githubIdentity({ names: ['ada-lovelace'] })).toEqual({
      login: 'ada-lovelace',
      certain: false,
    });
  });

  it('does not take a full name for a login', () => {
    expect(githubIdentity({ names: ['Ada Lovelace'], name: 'Ada Lovelace' })).toBeNull();
  });

  it('does not take an email for a login', () => {
    expect(githubIdentity({ names: ['ada@acme.com'] })).toBeNull();
  });

  it('has nothing to say about a person with neither', () => {
    expect(githubIdentity({ emails: ['ada@acme.com'] })).toBeNull();
  });

  it('ignores an address from a lookalike domain', () => {
    expect(githubIdentity({ emails: ['1+x@users.noreply.github.com.evil.net'] })).toBeNull();
  });
});

describe('githubAvatarUrl', () => {
  it('asks by account id when the commits gave one', () => {
    expect(githubAvatarUrl({ id: '483059', login: 'Sotilrac' })).toBe(
      'https://avatars.githubusercontent.com/u/483059?v=4&s=256',
    );
  });

  it('asks by login when they did not', () => {
    expect(githubAvatarUrl({ login: 'ada' }, { size: 128 })).toBe(
      'https://github.com/ada.png?size=128',
    );
  });
});

describe('fetchGithubAvatar', () => {
  const png = {
    ok: true,
    headers: { get: () => 'image/png' },
    arrayBuffer: async () => new ArrayBuffer(4),
  };
  const missing = { ok: false, headers: { get: () => null } };

  it('brings back the image and the account it came from', async () => {
    const image = await fetchGithubAvatar(
      { emails: ['9+ada@users.noreply.github.com'] },
      { fetchImpl: async () => png },
    );

    expect([image.login, image.contentType]).toEqual(['ada', 'image/png']);
  });

  it('answers with nothing when the account has gone', async () => {
    const image = await fetchGithubAvatar(
      { emails: ['9+ada@users.noreply.github.com'] },
      { fetchImpl: async () => missing },
    );

    expect(image).toBeNull();
  });

  it('does not guess from a handle unless it is asked to', async () => {
    const calls = [];
    const fetchImpl = async (url) => {
      calls.push(url);
      return png;
    };

    expect(await fetchGithubAvatar({ names: ['ada'] }, { fetchImpl })).toBeNull();
    expect(calls).toEqual([]);
  });

  it('guesses from a handle when it is', async () => {
    const image = await fetchGithubAvatar(
      { names: ['ada'] },
      { handles: true, fetchImpl: async () => png },
    );

    expect(image.login).toBe('ada');
  });

  it('does not reach the network for someone with no GitHub account', async () => {
    const calls = [];
    const image = await fetchGithubAvatar(
      { emails: ['ada@acme.com'], names: ['Ada Lovelace'] },
      {
        fetchImpl: async (url) => {
          calls.push(url);
          return png;
        },
      },
    );

    expect([image, calls]).toEqual([null, []]);
  });
});

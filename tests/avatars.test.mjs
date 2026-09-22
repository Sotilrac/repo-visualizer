import { describe, expect, it } from 'vitest';
import {
  fetchGravatar,
  gravatarHash,
  gravatarUrl,
  initialsFor,
  initialsSvg,
  tileHue,
} from '../scripts/org/avatars.mjs';

describe('gravatarHash', () => {
  it('hashes the trimmed, lowercased address', () => {
    // The published example from gravatar's own documentation.
    expect(gravatarHash('  MyEmailAddress@example.com ')).toBe(
      gravatarHash('myemailaddress@example.com'),
    );
  });

  it('is 32 hex characters', () => {
    expect(gravatarHash('ada@acme.com')).toMatch(/^[0-9a-f]{32}$/);
  });

  it('differs between addresses', () => {
    expect(gravatarHash('ada@acme.com')).not.toBe(gravatarHash('bo@acme.com'));
  });
});

describe('gravatarUrl', () => {
  it('asks for a 404 on a miss, so a miss is detectable', () => {
    expect(gravatarUrl('ada@acme.com')).toContain('d=404');
  });

  it('asks for the size it was given', () => {
    expect(gravatarUrl('ada@acme.com', { size: 128 })).toContain('s=128');
  });

  it('asks for a generated tile when one is named', () => {
    const url = gravatarUrl('ada@acme.com', { fallback: 'identicon' });

    expect(url).toContain('d=identicon');
    expect(url).not.toContain('d=404');
  });
});

describe('initialsFor', () => {
  it.each([
    ['Ada Lovelace', 'AL'],
    ['Émilie du Châtelet', 'ÉC'],
    ['Cher', 'C'],
    ['jean-francois duval', 'JD'],
    ['  padded  name  ', 'PN'],
  ])('reduces %s to %s', (name, expected) => {
    expect(initialsFor(name)).toBe(expected);
  });

  it('falls back to a question mark for a name with no letters', () => {
    expect(initialsFor('=')).toBe('?');
  });
});

describe('tileHue', () => {
  it('is stable for the same id', () => {
    expect(tileHue('ada')).toBe(tileHue('ada'));
  });

  it('is inside the colour wheel', () => {
    for (const id of ['ada', 'bo', 'grace', 'alan', '=']) {
      expect(tileHue(id)).toBeGreaterThanOrEqual(0);
      expect(tileHue(id)).toBeLessThan(360);
    }
  });

  it('spreads ids across the wheel rather than clustering', () => {
    const hues = ['ada', 'bo', 'grace', 'alan', 'emilie', 'radia', 'katherine'].map(tileHue);

    expect(new Set(hues).size).toBe(hues.length);
    expect(Math.max(...hues) - Math.min(...hues)).toBeGreaterThan(120);
  });

  it('separates two ids', () => {
    expect(tileHue('ada')).not.toBe(tileHue('bo'));
  });
});

describe('initialsSvg', () => {
  it('draws the initials', () => {
    expect(initialsSvg('Ada Lovelace', 'ada')).toContain('>AL<');
  });

  it('is square at the size asked for', () => {
    const svg = initialsSvg('Ada Lovelace', 'ada', { size: 128 });

    expect(svg).toContain('width="128"');
    expect(svg).toContain('height="128"');
  });

  it('uses the id for its colour, so a rename does not change it', () => {
    expect(initialsSvg('Ada Lovelace', 'ada')).toBe(initialsSvg('Ada Lovelace', 'ada'));
    expect(initialsSvg('A Different Name', 'ada')).toContain(`hsl(${tileHue('ada')}`);
  });

  it('escapes a name that would break the markup', () => {
    expect(initialsSvg('<script>', 'x')).not.toContain('<script>');
  });
});

describe('fetchGravatar', () => {
  const png = new Uint8Array([137, 80, 78, 71]);
  const ok = async () => ({
    ok: true,
    headers: new Headers({ 'content-type': 'image/png' }),
    arrayBuffer: async () => png.buffer,
  });
  const missing = async () => ({ ok: false, status: 404, headers: new Headers() });

  it('returns the image when there is one', async () => {
    const result = await fetchGravatar('ada@acme.com', { fetchImpl: ok });

    expect(result.contentType).toBe('image/png');
    expect([...result.body]).toEqual([137, 80, 78, 71]);
  });

  it('returns null on a miss rather than a placeholder', async () => {
    expect(await fetchGravatar('nobody@acme.com', { fetchImpl: missing })).toBeNull();
  });

  it('requests the address it was given', async () => {
    let asked = '';
    await fetchGravatar('ada@acme.com', {
      fetchImpl: async (url) => {
        asked = url;
        return ok();
      },
    });

    expect(asked).toContain(gravatarHash('ada@acme.com'));
  });
});

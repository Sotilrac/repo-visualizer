import { describe, expect, it } from 'vitest';
import { coAuthorsIn, personFrom } from '../scripts/org/coAuthors.mjs';

const squashed = `Add the pack controller (#142)

Pairing all week on this one.

Co-authored-by: Ada Lovelace <ada@acme.com>
Co-authored-by: Grace Hopper <12+ghopper@users.noreply.github.com>
`;

describe('coAuthorsIn', () => {
  it('reads everyone the trailers name', () => {
    expect(coAuthorsIn(squashed)).toEqual([
      { name: 'Ada Lovelace', email: 'ada@acme.com' },
      { name: 'Grace Hopper', email: '12+ghopper@users.noreply.github.com' },
    ]);
  });

  it('has nobody to report on an ordinary commit', () => {
    expect(coAuthorsIn('Fix the units on the torque estimate')).toEqual([]);
  });

  it('does not mind how the trailer is capitalised or spaced', () => {
    expect(coAuthorsIn('CO-AUTHORED-BY:   Ada  <ada@acme.com>  ')).toEqual([
      { name: 'Ada', email: 'ada@acme.com' },
    ]);
  });

  it('names a person once however many times they are listed', () => {
    const twice = 'x\n\nCo-authored-by: Ada <ada@acme.com>\nCo-authored-by: Ada <ADA@acme.com>';

    expect(coAuthorsIn(twice)).toHaveLength(1);
  });

  it('keeps the address it can match people by, in lower case', () => {
    expect(coAuthorsIn('x\n\nCo-authored-by: Ada <Ada@Acme.COM>')[0].email).toBe('ada@acme.com');
  });

  it('falls back to the address when the trailer has no name', () => {
    expect(coAuthorsIn('x\n\nCo-authored-by: <ada@acme.com>')[0].name).toBe('ada@acme.com');
  });

  it('ignores a line that only mentions the words', () => {
    expect(coAuthorsIn('This was co-authored by Ada, see below')).toEqual([]);
  });

  it('ignores a trailer with no address to go on', () => {
    expect(coAuthorsIn('x\n\nCo-authored-by: Ada Lovelace')).toEqual([]);
  });

  it('survives an empty message', () => {
    expect(coAuthorsIn('')).toEqual([]);
    expect(coAuthorsIn(undefined)).toEqual([]);
  });
});

describe('personFrom', () => {
  it('reads a name and address', () => {
    expect(personFrom('Ada Lovelace <ada@acme.com>')).toEqual({
      name: 'Ada Lovelace',
      email: 'ada@acme.com',
    });
  });

  it('has nothing to report without an address', () => {
    expect(personFrom('Ada Lovelace')).toBeNull();
  });

  it('has nothing to report on an empty trailer', () => {
    expect(personFrom('')).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { familiesOf, familyHues, familyOf } from '../src/engine/repoFamilies.js';

describe('which family a repo belongs to', () => {
  it('is the first word of its name', () => {
    expect(familyOf('flexsea-core')).toBe('flexsea');
    expect(familyOf('flexsea-dephy')).toBe('flexsea');
  });

  it('reads a dash, an underscore or a dot as a break', () => {
    expect(familyOf('bendy_motor')).toBe('bendy');
    expect(familyOf('talaria.api')).toBe('talaria');
  });

  it('reads a capital as a break too', () => {
    expect(familyOf('dataWorks')).toBe('data');
    expect(familyOf('DataAnalysisSimulations')).toBe('data');
  });

  it('ignores case, so FlexSEA and flexsea are one family', () => {
    expect(familyOf('FlexSEA-Embedded-STM')).toBe(familyOf('flexsea-build'));
  });

  it('leaves a one word name as its own family', () => {
    expect(familyOf('nexus')).toBe('nexus');
  });

  it('drops the marker a project id carries', () => {
    expect(familyOf('~flexsea')).toBe('flexsea');
  });

  it('copes with a name that is nothing at all', () => {
    expect(familyOf('')).toBe('');
    expect(familyOf(null)).toBe('');
  });
});

describe('grouping the repos', () => {
  it('puts a prefix together', () => {
    const families = familiesOf(['flexsea-core', 'nexus', 'flexsea-dephy']);

    expect(families.get('flexsea')).toEqual(['flexsea-core', 'flexsea-dephy']);
    expect(families.get('nexus')).toEqual(['nexus']);
  });
});

describe('the colours that come out', () => {
  /** Families placed evenly round the circle, in the order they arrive. */
  const evenly = (_family, i, total) => (i * 360) / total;
  const names = ['flexsea-core', 'flexsea-dephy', 'flexsea-build', 'nexus'];

  it('gives a family of one exactly its own hue', () => {
    expect(familyHues(['nexus'], () => 120).get('nexus').hue).toBe(120);
  });

  it('keeps a family within a band of each other', () => {
    // Away from zero, where the hue circle wraps and the arithmetic below
    // would measure the long way round.
    const hues = familyHues(names, () => 200);
    const flexsea = ['flexsea-core', 'flexsea-dephy', 'flexsea-build'].map((n) => hues.get(n).hue);

    expect(Math.max(...flexsea) - Math.min(...flexsea)).toBeLessThanOrEqual(26);
  });

  it('centres the family on its hue, so it does not drift off', () => {
    const hues = familyHues(names, () => 200);
    const flexsea = ['flexsea-core', 'flexsea-dephy', 'flexsea-build'].map((n) => hues.get(n).hue);

    expect((Math.min(...flexsea) + Math.max(...flexsea)) / 2).toBeCloseTo(200, 6);
  });

  it('still tells the members of a family apart', () => {
    const hues = familyHues(names, evenly);

    expect(hues.get('flexsea-core').hue).not.toBe(hues.get('flexsea-dephy').hue);
  });

  it('puts different families somewhere else entirely', () => {
    const hues = familyHues(names, evenly);

    expect(Math.abs(hues.get('nexus').hue - hues.get('flexsea-core').hue)).toBeGreaterThan(26);
  });

  it('varies the shade within a family as well as the hue', () => {
    const hues = familyHues(names, evenly);

    expect(hues.get('flexsea-core').variant).not.toBe(hues.get('flexsea-dephy').variant);
  });

  it('names every repo it was given', () => {
    expect([...familyHues(names, evenly).keys()].sort()).toEqual([...names].sort());
  });
});

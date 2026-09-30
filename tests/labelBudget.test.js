import { describe, expect, it } from 'vitest';
import { budgetFor, shortened, showsCount } from '../src/engine/labelBudget.js';

describe('how many characters there is room for', () => {
  it('is what the setting says at a zoom of one', () => {
    expect(budgetFor(22, 1)).toBe(22);
  });

  it('tightens as you pull back', () => {
    expect(budgetFor(22, 0.5)).toBeLessThan(22);
  });

  it('loosens as you close in', () => {
    expect(budgetFor(22, 1.3)).toBeGreaterThan(22);
  });

  it('stops tightening, so a name never disappears entirely', () => {
    expect(budgetFor(22, 0.01)).toBe(budgetFor(22, 0.2));
    expect(budgetFor(22, 0.01)).toBeGreaterThanOrEqual(6);
  });

  it('stops loosening, since there is nothing left to reveal', () => {
    expect(budgetFor(22, 4)).toBe(budgetFor(22, 8));
  });

  it('keeps a short setting readable', () => {
    expect(budgetFor(4, 0.3)).toBe(6);
  });
});

describe('cutting a name down', () => {
  it('leaves one that fits alone', () => {
    expect(shortened('flexsea', 10)).toBe('flexsea');
  });

  it('marks one that did not with an ellipsis', () => {
    expect(shortened('FlexSEA-Embedded-STM', 10)).toBe('FlexSEA-E…');
  });

  it('counts the ellipsis against the budget', () => {
    expect(shortened('abcdefghij', 5)).toHaveLength(5);
  });

  it('does not leave a space before the ellipsis', () => {
    expect(shortened('flexsea core build', 9)).toBe('flexsea…');
  });

  it('copes with nothing to cut', () => {
    expect(shortened('', 8)).toBe('');
    expect(shortened(null, 8)).toBe('');
  });
});

describe('whether a bubble carries its count', () => {
  it('does once it is drawn big enough', () => {
    expect(showsCount(20, 16)).toBe(true);
  });

  it('does not while it is small', () => {
    expect(showsCount(9, 16)).toBe(false);
  });
});

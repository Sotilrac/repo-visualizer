import { describe, expect, it } from 'vitest';
import { defaultDirection, sortRows } from '../src/config/useSortable.js';

const rows = [
  { name: 'zebra', commits: 9 },
  { name: 'Alpha', commits: 100 },
  { name: 'middle', commits: 50 },
];

const names = (sorted) => sorted.map((r) => r.name);

describe('sortRows', () => {
  it('sorts text case-insensitively, so handles mix with names', () => {
    expect(names(sortRows(rows, { key: 'name', direction: 'asc' }))).toEqual([
      'Alpha',
      'middle',
      'zebra',
    ]);
  });

  it('reverses on descending', () => {
    expect(names(sortRows(rows, { key: 'name', direction: 'desc' }))).toEqual([
      'zebra',
      'middle',
      'Alpha',
    ]);
  });

  it('sorts numbers as numbers, not as strings', () => {
    expect(sortRows(rows, { key: 'commits', direction: 'asc' }).map((r) => r.commits)).toEqual([
      9, 50, 100,
    ]);
  });

  it('leaves the caller array alone', () => {
    const before = names(rows);
    sortRows(rows, { key: 'name', direction: 'desc' });

    expect(names(rows)).toEqual(before);
  });

  it('puts rows with no value last, whichever direction', () => {
    const withGaps = [{ name: 'a', lod: 3 }, { name: 'b' }, { name: 'c', lod: 1 }];

    expect(names(sortRows(withGaps, { key: 'lod', direction: 'asc' }))).toEqual(['c', 'a', 'b']);
    expect(names(sortRows(withGaps, { key: 'lod', direction: 'desc' }))).toEqual(['a', 'c', 'b']);
  });

  it('is stable enough to leave equal rows in their original order', () => {
    const tied = [
      { name: 'first', commits: 5 },
      { name: 'second', commits: 5 },
    ];

    expect(names(sortRows(tied, { key: 'commits', direction: 'desc' }))).toEqual([
      'first',
      'second',
    ]);
  });

  it('sorts an empty list without complaint', () => {
    expect(sortRows([], { key: 'name', direction: 'asc' })).toEqual([]);
  });
});

describe('defaultDirection', () => {
  it('starts counts at the largest', () => {
    expect(defaultDirection('commits')).toBe('desc');
    expect(defaultDirection('files')).toBe('desc');
  });

  it('starts everything else at A', () => {
    expect(defaultDirection('name')).toBe('asc');
  });
});

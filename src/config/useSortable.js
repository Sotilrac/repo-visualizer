import { useMemo, useState } from 'react';

/**
 * Column sorting for the editor tables.
 *
 * Clicking a column sorts by it, clicking again reverses. Numbers compare as
 * numbers and text compares case-insensitively, so a `Commits` column does
 * not order 9 after 100 and a `Name` column does not put every lowercase
 * handle after every capitalised name.
 *
 * @param {Array<Record<string, any>>} rows
 * @param {{ key: string, direction?: 'asc' | 'desc' }} initial
 */
export function useSortable(rows, initial) {
  const [sort, setSort] = useState({ direction: 'asc', ...initial });

  const sorted = useMemo(() => sortRows(rows, sort), [rows, sort]);

  /** @param {string} key */
  const toggle = (key) =>
    setSort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: defaultDirection(key) },
    );

  return { rows: sorted, sort, toggle };
}

/**
 * @param {Array<Record<string, any>>} rows
 * @param {{ key: string, direction: 'asc' | 'desc' }} sort
 */
export function sortRows(rows, sort) {
  const factor = sort.direction === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const left = a[sort.key];
    const right = b[sort.key];
    // Rows with no value sort last in both directions. Reversing them along
    // with everything else would put the blanks on top whenever the order is
    // descending.
    const blank = missing(left) - missing(right);
    if (blank !== 0) return blank;
    return compare(left, right) * factor;
  });
}

const missing = (value) => (value === undefined || value === null || value === '' ? 1 : 0);

/** Counts are most useful largest first; names are most useful A to Z. */
export function defaultDirection(key) {
  return ['commits', 'files'].includes(key) ? 'desc' : 'asc';
}

function compare(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { sensitivity: 'base' });
}

import { describe, expect, it } from 'vitest';
import { recordingSpan } from '../src/engine/recordingOverlay.js';

describe('the span a recording covers', () => {
  it('runs from the first commit to the last', () => {
    expect(recordingSpan('2020-10-22T10:00:00Z', '2026-09-30T18:00:00Z')).toBe(
      'Oct 2020 – Sep 2026',
    );
  });

  it('says one month once, rather than twice', () => {
    expect(recordingSpan('2021-03-02T10:00:00Z', '2021-03-28T10:00:00Z')).toBe('Mar 2021');
  });

  it('says nothing without both ends', () => {
    expect(recordingSpan(null, '2026-09-30T18:00:00Z')).toBe('');
    expect(recordingSpan('2020-10-22T10:00:00Z', undefined)).toBe('');
  });

  it('says nothing for a date it cannot read', () => {
    expect(recordingSpan('not a date', '2026-09-30T18:00:00Z')).toBe('');
  });
});

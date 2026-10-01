import { describe, expect, it } from 'vitest';
import { clampLines } from '../src/engine/recordingCard.js';

/** Ten pixels a character, so a width of 100 is ten characters. */
const measure = (text) => text.length * 10;

describe('fitting a commit message into the card', () => {
  it('leaves a short message on one line', () => {
    expect(clampLines(measure, 'fix the bug', 200, 2)).toEqual(['fix the bug']);
  });

  it('wraps on words', () => {
    expect(clampLines(measure, 'fix the flaky test', 100, 2)).toEqual(['fix the', 'flaky test']);
  });

  it('cuts the last line short rather than running on', () => {
    const lines = clampLines(measure, 'one two three four five six seven', 100, 2);

    expect(lines).toHaveLength(2);
    expect(lines[1].endsWith('…')).toBe(true);
  });

  it('breaks a word nothing can wrap, like a long branch name', () => {
    const lines = clampLines(measure, 'espressif/bugfix/coap_sbom_version', 100, 2);

    expect(lines).toHaveLength(2);
    expect(lines.every((line) => measure(line) <= 100)).toBe(true);
  });

  it('keeps only the first line of a one-line field', () => {
    expect(clampLines(measure, 'src/engine/useTimeline.js', 100, 1)).toEqual(['src/engin…']);
  });

  it('says nothing for nothing', () => {
    expect(clampLines(measure, '', 100, 2)).toEqual([]);
    expect(clampLines(measure, null, 100, 2)).toEqual([]);
  });

  it('drops the newlines a commit body brings with it', () => {
    expect(clampLines(measure, 'subject\n\nbody text', 100, 1)).toEqual(['subject b…']);
  });
});

import { describe, expect, it } from 'vitest';
import { DEFAULT_TITLE, pageName, tabTitle } from '../src/shared/pageTitle.js';

describe('what the page is called', () => {
  it('takes the name the config gives it', () => {
    expect(pageName('Six Years at Dephy')).toBe('Six Years at Dephy');
  });

  it('falls back when the config says nothing', () => {
    expect(pageName(null)).toBe(DEFAULT_TITLE);
    expect(pageName(undefined)).toBe(DEFAULT_TITLE);
  });

  it('falls back on a name that is only spaces', () => {
    expect(pageName('   ')).toBe(DEFAULT_TITLE);
  });

  it('trims what it is given', () => {
    expect(pageName('  Dephy  ')).toBe('Dephy');
  });
});

describe('what the tab is called', () => {
  it('adds the tagline the page itself leaves out', () => {
    expect(tabTitle('Dephy')).toBe('Dephy — A cinematic journey through the codebase');
  });

  it('uses the fallback name too', () => {
    expect(tabTitle('')).toBe(`${DEFAULT_TITLE} — A cinematic journey through the codebase`);
  });
});

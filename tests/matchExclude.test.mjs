import { describe, expect, it } from 'vitest';
import { matchesExcludePattern } from '../scripts/matchExclude.mjs';

describe('literal patterns', () => {
  it('matches the folder itself', () => {
    expect(matchesExcludePattern('vendor', ['vendor'])).toBe(true);
  });

  it('matches anything under the folder', () => {
    expect(matchesExcludePattern('vendor/lib/a.js', ['vendor'])).toBe(true);
  });

  it('matches the folder at any depth, not only at the root', () => {
    expect(matchesExcludePattern('src/vendor/a.js', ['vendor'])).toBe(true);
  });

  it('ignores a trailing slash on the pattern', () => {
    expect(matchesExcludePattern('vendor/a.js', ['vendor/'])).toBe(true);
  });

  it('does not match a folder that merely starts with the pattern', () => {
    expect(matchesExcludePattern('vendored/a.js', ['vendor'])).toBe(false);
  });
});

describe('glob patterns', () => {
  it('* spans a single path segment', () => {
    expect(matchesExcludePattern('src/a/file.js', ['src/*/file.js'])).toBe(true);
    expect(matchesExcludePattern('src/a/b/file.js', ['src/*/file.js'])).toBe(false);
  });

  it('** spans any depth', () => {
    expect(matchesExcludePattern('src/a/b/c/file.js', ['src/**'])).toBe(true);
  });

  it('anchors at both ends', () => {
    expect(matchesExcludePattern('lib/src/a.js', ['src/**'])).toBe(false);
  });

  it('treats a dot in the pattern literally', () => {
    expect(matchesExcludePattern('srcXjs/a.js', ['src.js/**'])).toBe(false);
  });

  it('matches the test-file patterns the defaults rely on', () => {
    expect(matchesExcludePattern('src/deep/thing.test.ts', ['**/*.test.ts'])).toBe(true);
  });
});

describe('bare extension shorthand', () => {
  it('matches the extension anywhere in the tree', () => {
    expect(matchesExcludePattern('a/b/config.json', ['.json'])).toBe(true);
  });

  it('is case insensitive', () => {
    expect(matchesExcludePattern('a/B.JSON', ['.json'])).toBe(true);
  });

  it('does not match a longer extension ending in the same letters', () => {
    expect(matchesExcludePattern('a/b.geojson', ['.json'])).toBe(false);
  });
});

describe('normalisation and edge cases', () => {
  it('accepts backslash separators', () => {
    expect(matchesExcludePattern('src\\vendor\\a.js', ['vendor'])).toBe(true);
  });

  it('strips a leading ./', () => {
    expect(matchesExcludePattern('./vendor/a.js', ['vendor'])).toBe(true);
  });

  it('returns false for an empty pattern list', () => {
    expect(matchesExcludePattern('anything', [])).toBe(false);
  });

  it('skips empty strings in the pattern list', () => {
    expect(matchesExcludePattern('anything', ['', null, undefined])).toBe(false);
  });

  it('tolerates a missing pattern list', () => {
    expect(matchesExcludePattern('anything', undefined)).toBe(false);
  });
});

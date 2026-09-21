import { afterEach, describe, expect, it } from 'vitest';
import {
  getCustomExcludes,
  getDefaultExcludes,
  getEffectiveExcludes,
  setCustomExcludes,
  shouldIncludeFile,
} from '../scripts/includeFile.mjs';

afterEach(() => setCustomExcludes([]));

describe('built-in excludes', () => {
  it('keeps ordinary source files', () => {
    expect(shouldIncludeFile('src/engine/layout.js')).toBe(true);
  });

  it.each([
    ['node_modules/react/index.js', 'a dependency'],
    ['dist/bundle.js', 'build output'],
    ['__pycache__/mod.pyc', 'a cache directory'],
    ['src/thing.test.ts', 'a test file'],
    ['src/thing.min.js', 'a minified file'],
    ['README.md', 'documentation'],
    ['notes.txt', 'a text file'],
    ['build.log', 'a log'],
    ['.github/workflows/ci.yml', 'a CI template'],
  ])('drops %s (%s)', (path) => {
    expect(shouldIncludeFile(path)).toBe(false);
  });

  it('drops a skipped directory found at any depth', () => {
    expect(shouldIncludeFile('packages/app/node_modules/x/index.js')).toBe(false);
  });

  it('accepts backslash separators', () => {
    expect(shouldIncludeFile('node_modules\\react\\index.js')).toBe(false);
  });
});

describe('custom excludes', () => {
  it('drops a path matching a custom pattern', () => {
    setCustomExcludes(['legacy/**']);
    expect(shouldIncludeFile('legacy/old.js')).toBe(false);
    expect(shouldIncludeFile('current/new.js')).toBe(true);
  });

  it('applies the bare extension shorthand', () => {
    setCustomExcludes(['.json']);
    expect(shouldIncludeFile('src/data.json')).toBe(false);
  });

  it('is replaced, not appended to, on each call', () => {
    setCustomExcludes(['a/**']);
    setCustomExcludes(['b/**']);
    expect(getCustomExcludes()).toEqual(['b/**']);
    expect(shouldIncludeFile('a/x.js')).toBe(true);
  });

  it('ignores a non-array argument', () => {
    // @ts-expect-error deliberately wrong type: the guard is what is under test
    setCustomExcludes('legacy/**');
    expect(getCustomExcludes()).toEqual([]);
  });
});

describe('the exclude lists handed to the app', () => {
  it('reports the built-ins', () => {
    expect(getDefaultExcludes().length).toBeGreaterThan(0);
  });

  it('hands out a copy, so a caller cannot mutate the built-ins', () => {
    getDefaultExcludes().push('injected');
    expect(getDefaultExcludes()).not.toContain('injected');
  });

  it('concatenates built-ins and custom patterns', () => {
    setCustomExcludes(['legacy/**']);
    expect(getEffectiveExcludes()).toEqual([...getDefaultExcludes(), 'legacy/**']);
  });
});

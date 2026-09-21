/**
 * The analyzer and the app both decide whether a path is excluded, from the
 * same pattern list that ships inside history.json. They have to agree.
 */

import { describe, expect, it } from 'vitest';
import { matchesExcludePattern as analyzerMatches } from '../scripts/matchExclude.mjs';
import { matchesExcludePattern as appMatches } from '../src/engine/excludes.js';

const CASES = [
  ['vendor/a.js', ['vendor']],
  ['src/vendor/a.js', ['vendor']],
  ['vendored/a.js', ['vendor']],
  ['src/a/file.js', ['src/*/file.js']],
  ['src/a/b/file.js', ['src/*/file.js']],
  ['src/a/b/c.js', ['src/**']],
  ['src/deep/thing.test.ts', ['**/*.test.ts']],
  ['a/b/config.json', ['.json']],
  ['a/B.JSON', ['.json']],
  ['a/b.geojson', ['.json']],
  ['src/a.js', ['.json']],
  ['./vendor/a.js', ['vendor']],
  ['src\\vendor\\a.js', ['vendor']],
  ['anything', []],
];

describe('the two exclude matchers', () => {
  it.each(CASES)('agree on %s against %j', (...[filePath, patterns]) => {
    expect(appMatches(String(filePath), /** @type {string[]} */ (patterns))).toBe(
      analyzerMatches(String(filePath), /** @type {string[]} */ (patterns)),
    );
  });
});

describe('the app matcher', () => {
  it('honours the bare extension shorthand the analyzer writes into history.json', () => {
    expect(appMatches('src/data.json', ['.json'])).toBe(true);
  });
});

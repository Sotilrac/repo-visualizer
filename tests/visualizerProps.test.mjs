/**
 * App hands the renderer a bag of props and the engine takes them apart by
 * name. A prop added to one side and not the other is silently dropped,
 * which is how the people ran without the config's identities for a while.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (rel) => readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), 'utf8');

/** The names in `const visProps = { ... }`. */
function sentByApp() {
  const source = read('src/App.jsx');
  const start = source.indexOf('const visProps = {');
  const block = source.slice(start, source.indexOf('\n  };', start));
  return [...block.matchAll(/^\s{4}(\w+)[:,]/gm)].map((m) => m[1]);
}

/** The names `useGraphEngine` destructures from its options. */
function takenByEngine() {
  const source = read('src/visualizers/useGraphEngine.js');
  const start = source.indexOf('export function useGraphEngine({');
  const block = source.slice(start, source.indexOf('\n}) {', start));
  return [...block.matchAll(/^\s{2}(\w+)/gm)].map((m) => m[1]);
}

describe('the props between App and the engine', () => {
  it('sends something', () => {
    expect(sentByApp().length).toBeGreaterThan(8);
  });

  it('is read at the other end', () => {
    const engine = new Set(takenByEngine());
    // The renderer component keeps a couple for itself before spreading
    // the rest, and those are named here rather than in the engine.
    const ownedByTheComponent = new Set(['onInitFailed', 'exportResolution']);

    for (const prop of sentByApp()) {
      if (ownedByTheComponent.has(prop)) continue;
      expect(engine.has(prop), `useGraphEngine never reads ${prop}`).toBe(true);
    }
  });
});

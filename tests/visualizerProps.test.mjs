/**
 * The canvas visualizers each take the shared props apart by name and hand
 * them to useVisualizerCore. A prop added to App and to the core but not to
 * the four components in between is silently dropped, which is how the
 * actors ran without the config's people for a while.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const VISUALIZERS = [
  'GalaxyVisualizer',
  'OrganicVisualizer',
  'NeuralVisualizer',
  'MinimalVisualizer',
];

/** Props every canvas visualizer has to accept and forward. */
const SHARED = [
  'state',
  'commitIndex',
  'dataset',
  'autoFit',
  'showActors',
  'resolveAuthor',
  'selectedPath',
  'selectedCluster',
  'excludePatterns',
  'onNodeClick',
  'onBodyCount',
  'cameraApiRef',
  'recordingOverlay',
];

const read = (rel) => readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), 'utf8');

describe.each(VISUALIZERS)('%s', (name) => {
  const source = read(`src/visualizers/${name}.jsx`);

  it.each(SHARED)('accepts and forwards %s', (prop) => {
    // Once in the parameter list, once in the object handed to the core.
    const uses = source.split(new RegExp(`\\b${prop}\\b`)).length - 1;
    expect(uses, `${name} mentions ${prop} ${uses} time(s)`).toBeGreaterThanOrEqual(2);
  });
});

describe('App', () => {
  it('passes every shared prop to the visualizers', () => {
    const source = read('src/App.jsx');
    const block = source.slice(source.indexOf('const visProps = {'));

    for (const prop of SHARED) {
      expect(block, `visProps is missing ${prop}`).toContain(prop);
    }
  });
});

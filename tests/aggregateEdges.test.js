import { describe, expect, it } from 'vitest';
import { aggregateEdges } from '../src/engine/aggregateEdges.js';

const edges = [
  { from: 'battery/src/a.js', to: 'battery/src/b.js', weight: 1 },
  { from: 'battery/src/a.js', to: 'battery/lib/c.js', weight: 2 },
  { from: 'core/d.js', to: 'battery/src/a.js', weight: 1 },
];

/** Everything drawn at file level. */
const asFiles = (path) => path;

describe('aggregateEdges', () => {
  it('leaves edges alone when both ends are drawn', () => {
    const out = aggregateEdges(edges, asFiles);

    expect(out).toHaveLength(3);
  });

  it('lifts an end to the body that stands in for it', () => {
    const toRepo = (path) => path.split('/')[0];

    expect(aggregateEdges([edges[2]], toRepo)).toMatchObject([
      { source: 'core', target: 'battery', weight: 1 },
    ]);
  });

  it('drops an edge whose ends land on the same body', () => {
    const toRepo = (path) => path.split('/')[0];

    expect(aggregateEdges([edges[0]], toRepo)).toEqual([]);
  });

  it('sums the weights of edges that collapse together', () => {
    const toFolder = (path) => path.split('/').slice(0, 2).join('/');
    const out = aggregateEdges(
      [
        { from: 'battery/src/a.js', to: 'battery/lib/c.js', weight: 2 },
        { from: 'battery/src/b.js', to: 'battery/lib/d.js', weight: 3 },
      ],
      toFolder,
    );

    expect(out).toMatchObject([{ source: 'battery/src', target: 'battery/lib', weight: 5 }]);
  });

  it('keeps direction, so two ways round stay two edges', () => {
    const toRepo = (path) => path.split('/')[0];
    const out = aggregateEdges(
      [
        { from: 'core/a.js', to: 'battery/b.js', weight: 1 },
        { from: 'battery/b.js', to: 'core/a.js', weight: 1 },
      ],
      toRepo,
    );

    expect(out).toHaveLength(2);
  });

  it('drops an edge whose end is not drawn at all', () => {
    const hidden = (path) => (path.startsWith('core') ? null : path);

    expect(aggregateEdges([edges[2]], hidden)).toEqual([]);
  });

  it('caps a weight so one hot pair cannot dominate the layout', () => {
    const toRepo = (path) => path.split('/')[0];
    const many = Array.from({ length: 500 }, (_, i) => ({
      from: `core/a${i}.js`,
      to: 'battery/b.js',
      weight: 1,
    }));

    expect(aggregateEdges(many, toRepo)[0].weight).toBeLessThanOrEqual(20);
  });

  it('handles an empty list', () => {
    expect(aggregateEdges([], asFiles)).toEqual([]);
  });
});

describe('edges that cross a repo', () => {
  const body = (path) => path.split('/').slice(0, 2).join('/');

  it('marks one whose ends are in different repos', () => {
    const [edge] = aggregateEdges([{ from: 'app/src/a.c', to: 'lib/inc/b.h' }], body);

    expect(edge.crossRepo).toBe(true);
  });

  it('leaves one inside a repo unmarked', () => {
    const [edge] = aggregateEdges([{ from: 'app/src/a.c', to: 'app/inc/b.h' }], body);

    expect(edge.crossRepo).toBe(false);
  });

  it('marks a merged pair that carries even one crossing import', () => {
    // Both land on the same pair of bodies; one of them crosses.
    const onto = (path) => (path.startsWith('app') ? 'app' : 'lib');
    const [edge] = aggregateEdges(
      [
        { from: 'app/a.c', to: 'lib/b.h' },
        { from: 'app/c.c', to: 'lib/d.h' },
      ],
      onto,
    );

    expect(edge.crossRepo).toBe(true);
  });
});

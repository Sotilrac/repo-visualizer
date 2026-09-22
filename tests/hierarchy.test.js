import { describe, expect, it } from 'vitest';
import { ancestorsOf, entityChain, entityKind, visibleEntity } from '../src/engine/hierarchy.js';

const settings = { folderDepth: 2 };

describe('entityChain', () => {
  it('runs from the repo down to the file', () => {
    expect(entityChain('battery/src/a/b.js', settings)).toEqual([
      'battery',
      'battery/src',
      'battery/src/a',
      'battery/src/a/b.js',
    ]);
  });

  it('puts a project above the repo when there is one', () => {
    expect(entityChain('battery/a.js', { ...settings, project: 'power' })).toEqual([
      '~power',
      '~power/battery',
      '~power/battery/a.js',
    ]);
  });

  it('stops nesting folders past the configured depth', () => {
    const chain = entityChain('battery/a/b/c/d/deep.js', { folderDepth: 2 });

    expect(chain).toEqual(['battery', 'battery/a', 'battery/a/b', 'battery/a/b/c/d/deep.js']);
  });

  it('handles a file at the root of a repo', () => {
    expect(entityChain('battery/README.md', settings)).toEqual(['battery', 'battery/README.md']);
  });

  it('treats a path with no repo prefix as its own repo', () => {
    expect(entityChain('loose.js', settings)).toEqual(['loose.js']);
  });
});

describe('visibleEntity', () => {
  const path = 'battery/src/a/b.js';

  it('draws nothing at level 0', () => {
    expect(visibleEntity(path, { ...settings, lod: 0 })).toBeNull();
  });

  it('draws the repo at level 1', () => {
    expect(visibleEntity(path, { ...settings, lod: 1 })).toBe('battery');
  });

  it('draws the folder at level 2', () => {
    expect(visibleEntity(path, { ...settings, lod: 2 })).toBe('battery/src/a');
  });

  it('draws the file at level 3', () => {
    expect(visibleEntity(path, { ...settings, lod: 3 })).toBe(path);
  });

  it('draws the repo at level 2 for a file with no folder', () => {
    expect(visibleEntity('battery/README.md', { ...settings, lod: 2 })).toBe('battery');
  });

  it('draws the project at level 1 under a project, since the repo is inside it', () => {
    expect(visibleEntity(path, { ...settings, lod: 1, project: 'power' })).toBe('~power/battery');
  });

  it('defaults to level 1 when none is set', () => {
    expect(visibleEntity(path, settings)).toBe('battery');
  });
});

describe('ancestorsOf', () => {
  it('lists the containers of an entity, outermost first', () => {
    expect(ancestorsOf('battery/src/a')).toEqual(['battery', 'battery/src']);
  });

  it('gives a repo no ancestors', () => {
    expect(ancestorsOf('battery')).toEqual([]);
  });

  it('keeps a project as the outermost', () => {
    expect(ancestorsOf('~power/battery/src')).toEqual(['~power', '~power/battery']);
  });
});

describe('entityKind', () => {
  it.each([
    ['~power', 'project'],
    ['battery', 'repo'],
    ['~power/battery', 'repo'],
    ['battery/src', 'folder'],
    ['battery/src/a', 'folder'],
    ['battery/src/a/b.js', 'file'],
    ['~power/battery/src/a/b.js', 'file'],
  ])('reads %s as a %s', (id, kind) => {
    expect(entityKind(id)).toBe(kind);
  });
});

import { describe, expect, it } from 'vitest';
import { createImportResolver } from '../scripts/importResolve.mjs';

const tree = [
  'fx/src/main.c',
  'fx/src/motor.c',
  'fx/src/motor.h',
  'fx/inc/flexsea/device.h',
  'fx/inc/board.h',
  'fx/vendor/cmsis/core.h',
  'talaria/src/main.c',
  'talaria/inc/board.h',
];

const resolver = createImportResolver(tree);
const from = (file, spec) => resolver.resolve(spec, file);

describe('where an include points', () => {
  it('finds a header beside the file that included it', () => {
    expect(from('fx/src/main.c', 'motor.h')).toBe('fx/src/motor.h');
  });

  it('finds one the include spelled a path to', () => {
    expect(from('fx/src/main.c', 'flexsea/device.h')).toBe('fx/inc/flexsea/device.h');
  });

  it('finds one elsewhere in the repo by name alone', () => {
    expect(from('fx/src/main.c', 'board.h')).toBe('fx/inc/board.h');
  });

  it('takes the angled spelling too', () => {
    expect(from('fx/src/motor.c', 'board.h')).toBe('fx/inc/board.h');
  });

  it('picks the copy nearest the file that asked for it', () => {
    // Two board.h in the tree; the one in the same subtree wins.
    expect(from('talaria/src/main.c', 'board.h')).toBe('talaria/inc/board.h');
  });

  it('points at nothing for a toolchain header', () => {
    expect(from('fx/src/main.c', 'stdint.h')).toBeNull();
  });

  it('reaches further out when nothing closer answers', () => {
    expect(from('talaria/src/main.c', 'motor.h')).toBe('fx/src/motor.h');
  });

  it('ignores a leading ./', () => {
    expect(from('fx/src/main.c', './motor.h')).toBe('fx/src/motor.h');
  });

  it('follows a relative path out of the folder', () => {
    expect(from('fx/src/main.c', '../inc/board.h')).toBe('fx/inc/board.h');
  });

  it('picks the same file every run when a name matches several', () => {
    const many = createImportResolver(['r/a/deep/dir/x.h', 'r/b/x.h', 'r/src/main.c']);

    expect(many.resolve('x.h', 'r/src/main.c')).toBe('r/b/x.h');
  });

  it('leaves an absolute include alone', () => {
    expect(from('fx/src/main.c', '/usr/include/stdio.h')).toBeNull();
  });
});

describe('choosing between copies of a header', () => {
  const tree = [
    'app/src/main.c',
    'app/inc/board.h',
    'vendor/hal/inc/board.h',
    'app/src/deep/nested/leaf.c',
  ];
  const resolver = createImportResolver(tree);

  it('takes the one in the same subtree', () => {
    expect(resolver.resolve('board.h', 'app/src/main.c')).toBe('app/inc/board.h');
  });

  it('takes the same one from deeper in that subtree', () => {
    expect(resolver.resolve('board.h', 'app/src/deep/nested/leaf.c')).toBe('app/inc/board.h');
  });

  it('takes the vendored one when the include spells its path', () => {
    expect(resolver.resolve('hal/inc/board.h', 'app/src/main.c')).toBe('vendor/hal/inc/board.h');
  });
});

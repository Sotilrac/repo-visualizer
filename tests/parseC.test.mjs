import { describe, expect, it } from 'vitest';
import { parseC } from '../scripts/importParsers.mjs';

describe('reading C includes', () => {
  it('takes a quoted one', () => {
    expect(parseC('#include "motor.h"')).toEqual(['motor.h']);
  });

  it('takes an angled one', () => {
    expect(parseC('#include <stdint.h>')).toEqual(['stdint.h']);
  });

  it('keeps the path a header sits under', () => {
    expect(parseC('#include "inc/flexsea/device.h"')).toEqual(['inc/flexsea/device.h']);
  });

  it('allows the spacing people actually write', () => {
    const src = ['  #include "a.h"', '#  include <b.h>', '#include\t"c.h"'].join('\n');

    expect(parseC(src)).toEqual(['a.h', 'b.h', 'c.h']);
  });

  it('names each header once however often it is included', () => {
    expect(parseC('#include "a.h"\n#include "a.h"')).toEqual(['a.h']);
  });

  it('reads a whole file, not just its first line', () => {
    const src = '/* header */\n#pragma once\n#include "a.h"\n\nint main(void) { return 0; }\n';

    expect(parseC(src)).toEqual(['a.h']);
  });

  it('ignores a line that only mentions the word', () => {
    expect(parseC('// remember to #include "a.h" here later')).toEqual([]);
  });

  it('finds nothing in a file that includes nothing', () => {
    expect(parseC('int main(void) { return 0; }')).toEqual([]);
  });
});

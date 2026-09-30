import { describe, expect, it } from 'vitest';
import { actorsOn } from '../src/engine/isolate.js';

const body = (path, dir) => ({ path, dir });
const actor = (name, nodes) => ({
  name,
  aims: new Map(nodes.map((node) => [node.path, { node }])),
});

const inRepo = (dir) => (node) => node.dir === dir;

describe('who stays while one repo is picked out', () => {
  const ada = actor('Ada', [body('app/a.js', 'app')]);
  const bo = actor('Bo', [body('lib/b.js', 'lib')]);
  const cy = actor('Cy', [body('lib/c.js', 'lib'), body('app/d.js', 'app')]);

  it('keeps the people working inside it', () => {
    expect(actorsOn([ada, bo, cy], inRepo('app'))).toEqual([ada, cy]);
  });

  it('drops the people working elsewhere', () => {
    expect(actorsOn([ada, bo], inRepo('lib'))).toEqual([bo]);
  });

  it('keeps someone working in two places at once', () => {
    expect(actorsOn([cy], inRepo('lib'))).toEqual([cy]);
  });

  it('drops someone with nothing in hand', () => {
    expect(actorsOn([actor('Di', [])], inRepo('app'))).toEqual([]);
  });

  it('keeps everyone when nothing is picked out', () => {
    const all = [ada, bo, cy];

    expect(actorsOn(all, () => true)).toEqual(all);
  });
});

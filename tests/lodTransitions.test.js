import { describe, expect, it } from 'vitest';
import { createLodTransitions } from '../src/engine/lodTransitions.js';

const at = (transitions, levels, now) => {
  transitions.update(levels, now);
  return transitions;
};

describe('settling', () => {
  it('reports a repo at rest once it has been seen', () => {
    const t = at(createLodTransitions(), { battery: 2 }, 0);

    expect(t.stateFor('battery')).toMatchObject({ phase: 'steady', level: 2 });
  });

  it('knows nothing about a repo it has not seen', () => {
    expect(createLodTransitions().stateFor('battery')).toBeNull();
  });
});

describe('collapsing', () => {
  const collapsing = (elapsed) => {
    const t = createLodTransitions({ durationMs: 1000 });
    t.update({ battery: 3 }, 0);
    t.update({ battery: 1 }, 1000);
    t.update({ battery: 1 }, 1000 + elapsed);
    return t.stateFor('battery');
  };

  it('starts when the level drops', () => {
    expect(collapsing(0)).toMatchObject({ phase: 'collapsing', from: 3, to: 1, progress: 0 });
  });

  it('runs to completion over its duration', () => {
    expect(collapsing(500).progress).toBeCloseTo(0.5, 2);
  });

  it('keeps simulating the old level while it collapses, so there is something to animate', () => {
    expect(collapsing(500).level).toBe(3);
  });

  it('settles at the new level once it finishes', () => {
    expect(collapsing(1200)).toMatchObject({ phase: 'steady', level: 1 });
  });
});

describe('expanding', () => {
  const expanding = (elapsed) => {
    const t = createLodTransitions({ durationMs: 1000 });
    t.update({ battery: 1 }, 0);
    t.update({ battery: 3 }, 1000);
    t.update({ battery: 3 }, 1000 + elapsed);
    return t.stateFor('battery');
  };

  it('starts when the level rises', () => {
    expect(expanding(0)).toMatchObject({ phase: 'expanding', from: 1, to: 3, progress: 0 });
  });

  it('simulates the new level straight away, so the children exist to fly out', () => {
    expect(expanding(0).level).toBe(3);
  });

  it('settles once it finishes', () => {
    expect(expanding(1200)).toMatchObject({ phase: 'steady', level: 3 });
  });
});

describe('changing its mind mid-transition', () => {
  it('turns a collapse around when the repo is edited again', () => {
    const t = createLodTransitions({ durationMs: 1000 });
    t.update({ battery: 3 }, 0);
    t.update({ battery: 1 }, 1000);
    t.update({ battery: 3 }, 1500);

    expect(t.stateFor('battery')).toMatchObject({ phase: 'expanding', to: 3 });
  });

  it('takes only as long to reverse as it had already travelled', () => {
    const t = createLodTransitions({ durationMs: 1000 });
    t.update({ battery: 3 }, 0);
    t.update({ battery: 1 }, 1000);
    t.update({ battery: 1 }, 1200); // a fifth of the way collapsed
    t.update({ battery: 3 }, 1200); // turn around

    // A fifth of the way in means a fifth of the duration back, so 200ms
    // finishes it rather than the full second.
    t.update({ battery: 3 }, 1400);

    expect(t.stateFor('battery')).toMatchObject({ phase: 'steady', level: 3 });
  });

  it('is still moving partway through a reversal', () => {
    const t = createLodTransitions({ durationMs: 1000 });
    t.update({ battery: 3 }, 0);
    t.update({ battery: 1 }, 1000);
    t.update({ battery: 1 }, 1900); // nearly collapsed
    t.update({ battery: 3 }, 1900);
    t.update({ battery: 3 }, 2300);

    expect(t.stateFor('battery').phase).toBe('expanding');
  });
});

describe('several repos', () => {
  it('tracks them independently', () => {
    const t = createLodTransitions({ durationMs: 1000 });
    t.update({ battery: 3, core: 1 }, 0);
    t.update({ battery: 1, core: 1 }, 1000);

    expect(t.stateFor('battery').phase).toBe('collapsing');
    expect(t.stateFor('core').phase).toBe('steady');
  });

  it('forgets a repo that leaves the dataset', () => {
    const t = createLodTransitions();
    t.update({ battery: 2 }, 0);
    t.update({}, 1000);

    expect(t.stateFor('battery')).toBeNull();
  });

  it('lists the repos in motion, so the layout can skip the still ones', () => {
    const t = createLodTransitions({ durationMs: 1000 });
    t.update({ battery: 3, core: 2 }, 0);
    t.update({ battery: 1, core: 2 }, 1000);

    expect(t.moving()).toEqual(['battery']);
  });
});

describe('the first sighting', () => {
  it('does not animate a repo into existence at its configured level', () => {
    const t = createLodTransitions({ durationMs: 1000 });
    t.update({ battery: 3 }, 0);

    expect(t.stateFor('battery').phase).toBe('steady');
  });
});

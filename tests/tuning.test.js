import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TUNING,
  KNOBS,
  knobGroups,
  loadTuning,
  renderScale,
  saveTuning,
  withDefaults,
} from '../src/engine/tuning.js';

/** localStorage, without a browser. */
function store(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
    removeItem: (key) => delete data[key],
    data,
  };
}

describe('knobs', () => {
  it('starts every knob inside its own range', () => {
    for (const [key, knob] of Object.entries(KNOBS)) {
      expect(knob.value, key).toBeGreaterThanOrEqual(knob.min);
      expect(knob.value, key).toBeLessThanOrEqual(knob.max);
    }
  });

  it('groups them for the panel, keeping every one', () => {
    const grouped = knobGroups().flatMap(([, knobs]) => knobs.map((k) => k.key));

    expect(grouped.sort()).toEqual(Object.keys(KNOBS).sort());
  });
});

describe('withDefaults', () => {
  it('fills in a setting that was never set', () => {
    expect(withDefaults({}).repel).toBe(DEFAULT_TUNING.repel);
  });

  it('keeps one that was', () => {
    expect(withDefaults({ repel: 2.5 }).repel).toBe(2.5);
  });

  it('clamps a value beyond the slider', () => {
    expect(withDefaults({ repel: 99 }).repel).toBe(KNOBS.repel.max);
  });

  it('ignores a value that is not a number', () => {
    expect(withDefaults({ repel: 'loads' }).repel).toBe(DEFAULT_TUNING.repel);
  });

  it('drops a setting the app no longer has', () => {
    expect(withDefaults({ gravity: 3 })).not.toHaveProperty('gravity');
  });

  it('survives being handed nothing at all', () => {
    expect(withDefaults(null)).toEqual(DEFAULT_TUNING);
  });
});

describe('loadTuning and saveTuning', () => {
  it('brings back what was saved', () => {
    const storage = store();
    saveTuning({ ...DEFAULT_TUNING, repel: 1.7 }, storage);

    expect(loadTuning(storage).repel).toBe(1.7);
  });

  it('starts from the defaults when nothing was saved', () => {
    expect(loadTuning(store())).toEqual(DEFAULT_TUNING);
  });

  it('starts from the defaults when what was saved is broken', () => {
    expect(loadTuning(store({ 'repo-viz:tuning': '{oh no' }))).toEqual(DEFAULT_TUNING);
  });

  it('does not throw where storage is turned off', () => {
    const blocked = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    };

    expect(loadTuning(blocked)).toEqual(DEFAULT_TUNING);
    expect(() => saveTuning(DEFAULT_TUNING, blocked)).not.toThrow();
  });
});

describe('renderScale', () => {
  const budget = DEFAULT_TUNING.pixelBudget;

  it('draws a small window at the screen it is on', () => {
    expect(renderScale(800, 600, 2, budget)).toBe(2);
  });

  it('draws fewer pixels than the screen asks for on a big one', () => {
    expect(renderScale(1920, 1080, 2, budget)).toBeLessThan(2);
  });

  it('keeps to the budget it is given', () => {
    const scale = renderScale(1920, 1080, 2, 2.5);

    expect((1920 * scale * (1080 * scale)) / 1e6).toBeCloseTo(2.5, 1);
  });

  it('draws more when the budget goes up', () => {
    expect(renderScale(1920, 1080, 2, 9)).toBeGreaterThan(renderScale(1920, 1080, 2, 2));
  });

  it('never asks for more than the screen has', () => {
    expect(renderScale(800, 600, 1, 9)).toBe(1);
  });

  it('stays legible however tight the budget', () => {
    expect(renderScale(3840, 2160, 2, 0.2)).toBe(0.5);
  });
});

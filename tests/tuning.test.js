import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TUNING,
  folderDepthOf,
  KNOBS,
  knobGroups,
  loadTuning,
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

describe('how deep a repo breaks into folders', () => {
  it('follows the config while the knob is at zero', () => {
    expect(folderDepthOf(0, 3)).toBe(3);
  });

  it('lets the knob go deeper than the config asked for', () => {
    expect(folderDepthOf(5, 2)).toBe(5);
  });

  it('falls back to two when neither says anything', () => {
    expect(folderDepthOf(0, undefined)).toBe(2);
    expect(folderDepthOf(undefined, undefined)).toBe(2);
  });

  it('ignores a value that is not a number', () => {
    expect(folderDepthOf(Number.NaN, 4)).toBe(4);
    expect(folderDepthOf(null, null)).toBe(2);
  });

  it('gives back whole levels, since half a folder is not a thing', () => {
    expect(folderDepthOf(2.6, 2)).toBe(3);
  });
});

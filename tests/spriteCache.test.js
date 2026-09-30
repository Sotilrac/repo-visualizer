import { describe, expect, it, vi } from 'vitest';
import {
  createLayerBuffer,
  createSpriteCache,
  spriteStep,
} from '../src/visualizers/spriteCache.js';

/** A canvas that records nothing but its size, for counting. */
const fakeCanvas = (w, h) => ({ width: w, height: h, getContext: () => ({}) });

describe('createSpriteCache', () => {
  it('paints a sprite the first time it is asked for', () => {
    const paint = vi.fn();
    const cache = createSpriteCache({ create: fakeCanvas });
    cache.get('star:blue:12', 24, 24, paint);

    expect(paint).toHaveBeenCalledTimes(1);
  });

  it('hands back the same sprite after that, without painting again', () => {
    const paint = vi.fn();
    const cache = createSpriteCache({ create: fakeCanvas });
    const first = cache.get('star:blue:12', 24, 24, paint);
    const second = cache.get('star:blue:12', 24, 24, paint);

    expect(second).toBe(first);
    expect(paint).toHaveBeenCalledTimes(1);
  });

  it('keeps one sprite per distinct key', () => {
    const cache = createSpriteCache({ create: fakeCanvas });
    cache.get('star:blue:12', 24, 24, () => {});
    cache.get('star:pink:12', 24, 24, () => {});

    expect(cache.size).toBe(2);
  });

  it('gives the painter the size it asked for', () => {
    const cache = createSpriteCache({ create: fakeCanvas });
    let seen = null;
    cache.get('k', 40, 30, (_ctx, size) => {
      seen = size;
    });

    expect(seen).toEqual({ width: 40, height: 30 });
  });

  it('drops what nothing has asked for in a while', () => {
    const cache = createSpriteCache({ create: fakeCanvas });
    for (let i = 0; i < 300; i++) cache.get(`k${i}`, 4, 4, () => {});

    expect(cache.size).toBeLessThanOrEqual(240);
  });

  it('keeps what is still being drawn, however old', () => {
    const cache = createSpriteCache({ create: fakeCanvas });
    cache.get('kept', 4, 4, () => {});
    for (let i = 0; i < 300; i++) {
      cache.get(`k${i}`, 4, 4, () => {});
      cache.get('kept', 4, 4, () => {});
    }
    const paint = vi.fn();
    cache.get('kept', 4, 4, paint);

    expect(paint).not.toHaveBeenCalled();
  });
});

describe('spriteStep', () => {
  it('rounds nearby sizes together, so one sprite serves both', () => {
    expect(spriteStep(20)).toBe(spriteStep(20.9));
  });

  it('keeps small bubbles apart, where a pixel is a large share', () => {
    expect(spriteStep(4)).not.toBe(spriteStep(6));
  });

  it('is coarser the bigger they get', () => {
    expect(spriteStep(40)).toBe(spriteStep(41.5));
  });

  it('never rounds down to nothing', () => {
    expect(spriteStep(0.2)).toBeGreaterThan(0);
  });
});

describe('createLayerBuffer', () => {
  const fake = (w, h) => ({
    width: w,
    height: h,
    getContext: () => ({ setTransform() {}, clearRect() {} }),
  });

  it('paints the layer once', () => {
    const paint = vi.fn();
    const buffer = createLayerBuffer({ create: fake });
    buffer.get('a', 100, 50, paint);
    buffer.get('a', 100, 50, paint);

    expect(paint).toHaveBeenCalledTimes(1);
  });

  it('paints again when the picture changes', () => {
    const paint = vi.fn();
    const buffer = createLayerBuffer({ create: fake });
    buffer.get('a', 100, 50, paint);
    buffer.get('b', 100, 50, paint);

    expect(paint).toHaveBeenCalledTimes(2);
  });

  it('paints over the one canvas rather than keeping both', () => {
    const made = [];
    const buffer = createLayerBuffer({
      create: (w, h) => {
        const canvas = fake(w, h);
        made.push(canvas);
        return canvas;
      },
    });
    for (let i = 0; i < 50; i++) buffer.get(`frame${i}`, 1920, 1080, () => {});

    expect(made).toHaveLength(1);
  });

  it('starts a new canvas when the window changes size', () => {
    const made = [];
    const buffer = createLayerBuffer({
      create: (w, h) => {
        const canvas = fake(w, h);
        made.push(canvas);
        return canvas;
      },
    });
    buffer.get('a', 100, 50, () => {});
    buffer.get('a', 200, 50, () => {});

    expect(made.map((c) => c.width)).toEqual([100, 200]);
  });
});

import { describe, expect, it } from 'vitest';
import { blurForZoom, targetFor } from '../src/visualizers/pixi/bloom.js';

describe('how wide the glow is', () => {
  it('is what the style asked for at a zoom of one', () => {
    expect(blurForZoom(14, 1)).toBe(14);
  });

  it('narrows as the bubbles get smaller', () => {
    expect(blurForZoom(14, 0.5)).toBeLessThan(14);
    expect(blurForZoom(14, 0.5)).toBeGreaterThan(blurForZoom(14, 0.3));
  });

  it('widens as they get bigger', () => {
    expect(blurForZoom(14, 1.4)).toBeGreaterThan(14);
  });

  it('stops narrowing, so a far view still glows', () => {
    expect(blurForZoom(14, 0.15)).toBe(blurForZoom(14, 0.02));
    expect(blurForZoom(14, 0.02)).toBeGreaterThan(0);
  });

  it('stops widening, so a close view is not a fog', () => {
    expect(blurForZoom(14, 6)).toBe(blurForZoom(14, 8));
  });

  it('survives a camera that has not been set up yet', () => {
    expect(blurForZoom(14, 0)).toBe(14);
    expect(blurForZoom(14, Number.NaN)).toBe(14);
  });
});

describe('where the glow is drawn', () => {
  const screen = { width: 1600, height: 900, resolution: 1 };

  it('covers the same region as the scene', () => {
    const target = targetFor(screen, 0.5);

    // Same width and height, so the shader reads the blurred copy at the
    // scene's own coordinates and the glow sits on what is glowing.
    expect(target.width).toBe(screen.width);
    expect(target.height).toBe(screen.height);
  });

  it('spends fewer pixels on it', () => {
    expect(targetFor(screen, 0.5).resolution).toBe(0.5);
    expect(targetFor(screen, 0.25).resolution).toBe(0.25);
  });

  it('follows a screen that draws at more than one pixel per pixel', () => {
    const retina = { width: 1600, height: 900, resolution: 2 };
    const target = targetFor(retina, 0.5);

    expect(target.width).toBe(1600);
    expect(target.resolution).toBe(1);
  });
});

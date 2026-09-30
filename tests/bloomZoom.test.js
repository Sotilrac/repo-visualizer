import { describe, expect, it } from 'vitest';
import { blurForZoom } from '../src/visualizers/pixi/bloom.js';

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

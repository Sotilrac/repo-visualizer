import { describe, expect, it } from 'vitest';
import { clusterRgb, forgetColors, rgb } from '../src/visualizers/pixi/palette.js';

const palette = new Map([
  ['app', { hue: 200, variant: 0 }],
  ['lib', { hue: 40, variant: 1 }],
]);

describe('colours for the GPU', () => {
  it('turns a CSS colour into a number and an alpha', () => {
    const red = rgb('hsla(0, 100%, 50%, 0.5)');

    expect(red.value).toBe(0xff0000);
    expect(red.alpha).toBeCloseTo(0.5, 2);
  });

  it('parses each colour once', () => {
    expect(rgb('hsla(120, 100%, 50%, 1)')).toBe(rgb('hsla(120, 100%, 50%, 1)'));
  });

  it('gives a cluster every colour the look defines', () => {
    const app = clusterRgb(palette, 'app', 'galaxy');

    for (const role of ['core', 'swatch', 'disk', 'glow', 'edge', 'ripple']) {
      expect(app, `galaxy has no ${role}`).toHaveProperty(role);
      expect(typeof app[role].value).toBe('number');
    }
  });

  it('keeps two clusters apart', () => {
    expect(clusterRgb(palette, 'app', 'galaxy').swatch.value).not.toBe(
      clusterRgb(palette, 'lib', 'galaxy').swatch.value,
    );
  });

  it('gives the same cluster a different colour in a different look', () => {
    expect(clusterRgb(palette, 'app', 'galaxy').core.value).not.toBe(
      clusterRgb(palette, 'app', 'paper').core.value,
    );
  });

  it('forgets them when the config changes underneath', () => {
    const before = clusterRgb(palette, 'app', 'galaxy');
    forgetColors();

    expect(clusterRgb(palette, 'app', 'galaxy')).not.toBe(before);
  });
});

import { describe, expect, it } from 'vitest';
import { STYLES, styleFor } from '../src/visualizers/pixi/styles.js';

/** Everything the renderer reads off a style. */
const READS = ['background', 'sky', 'bloom', 'body', 'link', 'ripple', 'label', 'beams'];

describe('the looks', () => {
  it.each(Object.keys(STYLES))('%s says everything the renderer asks it', (name) => {
    for (const key of READS) {
      expect(STYLES[name], `${name} has no ${key}`).toHaveProperty(key);
    }
  });

  it.each(Object.keys(STYLES))('%s sizes its bodies, links and ripples', (name) => {
    const style = STYLES[name];
    expect(style.body.ringWidth).toBeGreaterThan(0);
    expect(style.link.width).toBeGreaterThan(0);
    // A hairline glow stroke is worse than none: it is what looks stepped.
    if (style.link.glow > 0) expect(style.link.glowWidth).toBeGreaterThan(0.25);
    expect(style.ripple.rings).toBeGreaterThanOrEqual(1);
    expect(style.label.size).toBeGreaterThan(6);
  });

  it('falls back rather than drawing nothing', () => {
    expect(styleFor('no such look')).toBe(STYLES.galaxy);
    expect(styleFor(undefined)).toBe(STYLES.galaxy);
  });

  it('lights the import lines wherever there is a glow to light them with', () => {
    for (const [name, style] of Object.entries(STYLES)) {
      const lit = style.link.glow > 0;
      expect(lit, `${name} glows: ${!!style.bloom}, its lines glow: ${lit}`).toBe(!!style.bloom);
    }
  });

  it('keeps the one paper-white look light and the rest dark', () => {
    expect(STYLES.minimal.background).toMatch(/^#f/i);
    expect(STYLES.minimal.bloom).toBeNull();
    for (const name of ['galaxy', 'neural', 'organic']) {
      expect(STYLES[name].bloom, `${name} has no glow`).not.toBeNull();
    }
  });
});

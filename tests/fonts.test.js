import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FONT_MONO, FONT_SANS, monoFont, sansFont } from '../src/shared/fonts.js';

const read = (rel) => readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), 'utf8');

describe('the canvas font helpers', () => {
  it('build a css font shorthand', () => {
    expect(monoFont(600, 15)).toBe(`600 15px ${FONT_MONO}`);
    expect(sansFont(500, 20)).toBe(`500 20px ${FONT_SANS}`);
  });
});

describe('two families, loaded once', () => {
  const html = read('index.html');
  const css = read('src/styles.css');

  it('requests exactly the two families from google fonts', () => {
    const families = [...html.matchAll(/family=([A-Za-z+]+)/g)].map((m) => m[1]);

    expect(families).toEqual(['Inter', 'JetBrains+Mono']);
  });

  it('declares no serif token', () => {
    expect(css).not.toMatch(/--font-serif/);
  });

  it('names no family the page never loads', () => {
    const loaded = ['Inter', 'JetBrains Mono'];
    const quoted = new Set([...css.matchAll(/"([A-Z][A-Za-z ]+)"/g)].map((m) => m[1]));

    for (const family of quoted) {
      if (/^(SFMono-Regular|Menlo|Georgia)$/.test(family)) continue;
      expect(loaded, `${family} is used but never loaded`).toContain(family);
    }
  });
});

describe('the canvas and the stylesheet agree', () => {
  it('no source file hardcodes a font stack of its own', () => {
    for (const rel of ['src/engine/recordingOverlay.js', 'src/visualizers/pixi/stage.js']) {
      expect(read(rel), `${rel} hardcodes a font stack`).not.toMatch(/px "/);
    }
  });
});

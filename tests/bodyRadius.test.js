import { describe, expect, it } from 'vitest';
import { bodyRadius } from '../src/engine/layout.js';

const folder = (files) => bodyRadius({ kind: 'folder', files });

describe('bodyRadius', () => {
  it('grows with what a container holds', () => {
    expect(folder(10)).toBeGreaterThan(folder(2));
  });

  it('still separates two big containers', () => {
    expect(folder(1000) - folder(100)).toBeGreaterThan(5);
  });

  it('keeps the biggest repo on screen', () => {
    expect(folder(40000)).toBeLessThanOrEqual(64);
  });

  it('gives a container with one file something to see', () => {
    expect(folder(1)).toBeGreaterThan(8);
  });

  it('sizes a file by its lines instead', () => {
    expect(bodyRadius({ kind: 'file', size: 2000 })).toBeGreaterThan(
      bodyRadius({ kind: 'file', size: 20 }),
    );
  });

  it('widens a body other bodies import', () => {
    expect(bodyRadius({ kind: 'file', size: 100 }, 9)).toBeGreaterThan(
      bodyRadius({ kind: 'file', size: 100 }),
    );
  });
});

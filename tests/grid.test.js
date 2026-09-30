import { describe, expect, it } from 'vitest';
import { createGrid } from '../src/engine/grid.js';

const body = (x, y, r = 10) => ({ x, y, r });

/** Everything the grid offers as a candidate near a point. */
function candidates(grid, x, y, radius) {
  const found = [];
  grid.near(x, y, radius, (item) => found.push(item));
  return found;
}

describe('createGrid', () => {
  it('offers what is nearby', () => {
    const grid = createGrid(64);
    const near = body(10, 10);
    grid.build([near, body(2000, 2000)]);

    expect(candidates(grid, 0, 0, 30)).toEqual([near]);
  });

  it('offers nothing when the neighbourhood is empty', () => {
    const grid = createGrid(64);
    grid.build([body(2000, 2000)]);

    expect(candidates(grid, 0, 0, 30)).toEqual([]);
  });

  it('finds a big item from outside the cell it is centred in', () => {
    const grid = createGrid(64);
    const wide = body(0, 0, 300);
    grid.build([wide]);

    // Well outside its cell, but inside the item itself.
    expect(candidates(grid, 250, 0, 4)).toEqual([wide]);
  });

  it('never offers the same item twice', () => {
    const grid = createGrid(16);
    const wide = body(0, 0, 100);
    grid.build([wide]);

    expect(candidates(grid, 0, 0, 100)).toHaveLength(1);
  });

  it('misses nothing a full scan would have found', () => {
    const grid = createGrid(64);
    const items = [];
    let seed = 7;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0xffffffff;
    };
    for (let i = 0; i < 400; i++)
      items.push(body(rand() * 2000 - 1000, rand() * 2000 - 1000, 4 + rand() * 40));
    grid.build(items);

    for (let i = 0; i < 50; i++) {
      const x = rand() * 2000 - 1000;
      const y = rand() * 2000 - 1000;
      const reach = 40;
      const brute = items.filter((it) => Math.hypot(it.x - x, it.y - y) <= it.r + reach);
      const offered = new Set(candidates(grid, x, y, reach));
      for (const hit of brute) expect(offered.has(hit)).toBe(true);
    }
  });

  it('forgets the last build', () => {
    const grid = createGrid(64);
    grid.build([body(10, 10)]);
    grid.build([]);

    expect(candidates(grid, 10, 10, 30)).toEqual([]);
  });
});

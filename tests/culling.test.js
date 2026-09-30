import { describe, expect, it } from 'vitest';
import { createCamera } from '../src/engine/camera.js';
import { onScreen, visible } from '../src/visualizers/pixi/culling.js';

/** A camera showing world (0,0) at the top left, at the given zoom. */
function at(scale = 1, tx = 0, ty = 0) {
  return { ...createCamera(), scale, tx, ty };
}

describe('onScreen', () => {
  it('keeps what is in the middle of the view', () => {
    expect(onScreen(at(), 800, 600, 400, 300, 10)).toBe(true);
  });

  it('drops what is far off to one side', () => {
    expect(onScreen(at(), 800, 600, 5000, 300, 10)).toBe(false);
  });

  it('keeps something whose edge reaches into the view', () => {
    // Centre is 200 to the left of the frame, but it is 260 wide.
    expect(onScreen(at(), 800, 600, -200, 300, 260)).toBe(true);
  });

  it('measures the radius in screen pixels, not world units', () => {
    // The same bubble, 200 past the right edge either way. Zoomed in it is
    // wide enough on screen to still show; zoomed out it is not.
    expect(onScreen(at(2, 0), 800, 600, 500, 300, 100)).toBe(true);
    expect(onScreen(at(1, 500), 800, 600, 500, 300, 100)).toBe(false);
  });

  it('follows the camera as it pans', () => {
    expect(onScreen(at(1, -5000, 0), 800, 600, 5200, 300, 10)).toBe(true);
  });

  it('keeps a little margin, so nothing pops in at the edge', () => {
    expect(onScreen(at(), 800, 600, 830, 300, 1)).toBe(true);
    expect(onScreen(at(), 800, 600, 1200, 300, 1)).toBe(false);
  });
});

describe('visible', () => {
  it('returns only what is on screen', () => {
    const here = { x: 400, y: 300, r: 8 };
    const gone = { x: 9000, y: 300, r: 8 };

    expect(visible([here, gone], at(), 800, 600)).toEqual([here]);
  });

  it('treats a missing radius as a small one', () => {
    expect(visible([{ x: 400, y: 300 }], at(), 800, 600)).toHaveLength(1);
  });
});

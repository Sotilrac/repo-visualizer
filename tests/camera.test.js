import { describe, expect, it } from 'vitest';
import { createCamera, fitBounds, lerpCamera, snapCamera } from '../src/engine/camera.js';
import { cameraSpeed } from '../src/engine/tuning.js';

/** @type {[number, number]} */
const viewport = [1600, 900];
const dot = (x, y, r = 10) => ({ x, y, r });

/** A camera already pointed at one dot in the middle. */
function pointedAt(points) {
  const cam = createCamera();
  fitBounds(cam, points, ...viewport);
  snapCamera(cam);
  return cam;
}

describe('fitBounds', () => {
  it('points the camera at what it is given', () => {
    const cam = pointedAt([dot(0, 0), dot(400, 200)]);

    expect(cam.tx).toBeCloseTo(1600 / 2 - 200 * cam.scale, 5);
  });

  it('leaves room for what is drawn beside the graph', () => {
    const tight = createCamera();
    const roomy = createCamera();
    fitBounds(tight, [dot(0, 0), dot(400, 0)], ...viewport);
    fitBounds(roomy, [dot(0, 0), dot(400, 0)], ...viewport, undefined, 120);

    expect(roomy.targetScale).toBeLessThan(tight.targetScale);
  });

  it('ignores a fit that has barely moved', () => {
    const cam = pointedAt([dot(0, 0), dot(400, 0)]);
    const was = { ...cam };
    fitBounds(cam, [dot(0, 0), dot(404, 1)], ...viewport);

    expect([cam.targetScale, cam.targetTx]).toEqual([was.targetScale, was.targetTx]);
  });

  it('follows a fit that has really moved', () => {
    const cam = pointedAt([dot(0, 0), dot(400, 0)]);
    const was = cam.targetScale;
    fitBounds(cam, [dot(0, 0), dot(1200, 0)], ...viewport);

    expect(cam.targetScale).toBeLessThan(was);
  });

  it('takes the first fit whatever its size', () => {
    const cam = createCamera();
    fitBounds(cam, [dot(0, 0), dot(30, 0)], ...viewport);

    expect(cam.targetScale).not.toBe(1);
  });

  it('has somewhere to point when there is nothing to look at', () => {
    const cam = pointedAt([dot(0, 0)]);
    fitBounds(cam, [], ...viewport);

    expect([cam.targetScale, cam.targetTx, cam.targetTy]).toEqual([1, 0, 0]);
  });
});

describe('lerpCamera', () => {
  it('closes the gap to the fit', () => {
    const cam = createCamera();
    cam.targetTx = 100;
    lerpCamera(cam, 16);

    expect(cam.tx).toBeGreaterThan(0);
    expect(cam.tx).toBeLessThan(100);
  });

  it('covers the same ground whatever the frame rate', () => {
    const slow = createCamera();
    const fast = createCamera();
    slow.targetTx = 100;
    fast.targetTx = 100;

    lerpCamera(slow, 48);
    for (let i = 0; i < 3; i++) lerpCamera(fast, 16);

    expect(Math.abs(slow.tx - fast.tx)).toBeLessThan(0.5);
  });

  it('arrives eventually', () => {
    const cam = createCamera();
    cam.targetTx = 100;
    for (let i = 0; i < 400; i++) lerpCamera(cam, 16);

    expect(cam.tx).toBeCloseTo(100, 2);
  });

  it('moves further in a frame the shorter the easing asked for', () => {
    const brisk = createCamera();
    const calm = createCamera();
    brisk.targetTx = 100;
    calm.targetTx = 100;

    lerpCamera(brisk, 16, cameraSpeed(100));
    lerpCamera(calm, 16, cameraSpeed(1000));

    expect(brisk.tx).toBeGreaterThan(calm.tx);
  });
});

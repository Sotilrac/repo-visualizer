/**
 * Bloom that blurs a smaller copy of the scene.
 *
 * Pixi's AdvancedBloomFilter takes the bright pass and the blur at the full
 * size of what it is filtering. A Kawase blur is a handful of taps at fixed
 * offsets, and against a field of one-pixel bright dots those taps land on a
 * lattice and beat against the dots: the scene picks up a faint diagonal
 * weave that gets worse the further you zoom out, because the dots get
 * closer together.
 *
 * Every bloom worth the name blurs a downsampled copy for exactly this
 * reason. Downsampling is a low-pass, so the frequencies that beat are gone
 * before a single blur tap is taken. The reference is Jimenez's mip chain
 * from Call of Duty: Advanced Warfare, which downsamples six times and
 * upsamples with a tent filter; one halving is enough here, because the
 * dots are the only thing at that frequency.
 *
 * Keeping the composite lined up is the fiddly part. The shader reads the
 * blurred copy at the same coordinates as the scene, so the blurred copy has
 * to hold its content at the same place in its texture. Pixi's texture pool
 * rounds a request up to a screen size or a power of two, whichever is
 * smaller, and those two rules do not agree once the size is halved: asking
 * the pool for the half-size copy of a 1600x900 frame hands back a 2048x1024
 * texture, the scene is read across all of it instead of the 1600x900 corner
 * it occupies, and the glow drifts up and to the left of what is glowing.
 * So these two are made to measure and kept.
 */

import { RenderTexture } from 'pixi.js';
import { AdvancedBloomFilter } from 'pixi-filters';

/**
 * The two passes AdvancedBloomFilter keeps to itself.
 *
 * Reaching for them is the point of subclassing it: the passes are right,
 * the size they run at is not.
 *
 * @param {any} filter
 */
const passesOf = (filter) => filter;

/** Pixels of blur per unit of zoom, so the glow belongs to the bubbles. */
const ZOOM_FLOOR = 0.3;
const ZOOM_CEILING = 1.6;

/**
 * How wide to blur at a given zoom.
 *
 * A glow is a property of the thing glowing, and zoomed out the things are
 * small. Holding the blur at its full width then spreads every bubble over
 * its neighbours into a wash, which is both a worse picture and more of the
 * beating this filter exists to avoid.
 *
 * @param {number} base the width at a zoom of 1
 * @param {number} scale the camera's zoom
 */
export function blurForZoom(base, scale) {
  const tracked = Math.min(ZOOM_CEILING, Math.max(ZOOM_FLOOR, scale || 1));
  return base * tracked;
}

/**
 * The shape of the target to blur in.
 *
 * The same region as the scene, at fewer pixels: same width and height,
 * lower resolution. Shrinking the width and height instead is what puts the
 * glow in the wrong place, because the shader reads the blurred copy at the
 * scene's own coordinates.
 *
 * @param {{ width: number, height: number, resolution: number }} source
 * @param {number} downscale
 */
export function targetFor(source, downscale) {
  return {
    width: source.width,
    height: source.height,
    resolution: source.resolution * downscale,
    antialias: false,
  };
}

class DownsampledBloom extends AdvancedBloomFilter {
  /** @param {any} options `downscale` is the fraction of the size to blur at */
  constructor({ downscale = 0.5, ...options } = {}) {
    super(options);
    this.downscale = downscale;
    /** @type {any} */
    this._bright = null;
    /** @type {any} */
    this._blurred = null;
    this._shape = '';
  }

  /**
   * Two targets the same shape as what is being filtered, with a fraction of
   * the pixels. Held between frames and remade only when the window changes.
   *
   * @param {any} input
   */
  _targets(input) {
    const source = input.source;
    const resolution = source.resolution * this.downscale;
    const shape = `${source.width}x${source.height}@${resolution}`;
    if (shape === this._shape) return;

    this._bright?.destroy(true);
    this._blurred?.destroy(true);
    const options = targetFor(source, this.downscale);
    this._bright = RenderTexture.create(options);
    this._blurred = RenderTexture.create(options);
    this._shape = shape;
  }

  /** @override */
  apply(filterManager, input, output, clearMode) {
    this._targets(input);

    // The extract runs into the smaller target, so it downsamples and picks
    // out the bright pixels in the one pass.
    passesOf(this)._extractFilter.apply(filterManager, input, this._bright, true);
    passesOf(this)._blurFilter.apply(filterManager, this._bright, this._blurred, true);

    this.uniforms.uBloomScale = this.bloomScale;
    this.uniforms.uBrightness = this.brightness;
    this.resources.uMapTexture = this._blurred.source;
    filterManager.applyFilter(this, input, output, clearMode);
  }

  /** @override */
  destroy() {
    this._bright?.destroy(true);
    this._blurred?.destroy(true);
    this._bright = null;
    this._blurred = null;
    super.destroy();
  }
}

/**
 * @param {{
 *   threshold: number,
 *   scale: number,
 *   blur: number,
 *   quality: number,
 *   downscale: number,
 * }} spec
 */
export function createBloom(spec) {
  const bloom = new DownsampledBloom({
    threshold: spec.threshold,
    bloomScale: spec.scale,
    brightness: 1,
    // The blur happens in the smaller copy, where a pixel covers more of the
    // screen, so the same spread needs fewer of them.
    blur: spec.blur * spec.downscale,
    quality: spec.quality,
    downscale: spec.downscale,
  });
  // A filter renders its own target, and its antialias setting is off
  // whatever the renderer was asked for. Everything that glows comes out
  // stepped without this.
  bloom.antialias = 'inherit';
  return bloom;
}

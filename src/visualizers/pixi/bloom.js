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
 * Asking for the same region at a lower resolution rather than for a
 * smaller region is what keeps the composite lined up: the shader reads the
 * blurred copy at the same coordinates as the scene, so the two have to
 * cover the same frame.
 */

import { TexturePool } from 'pixi.js';
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

class DownsampledBloom extends AdvancedBloomFilter {
  /** @param {any} options `downscale` is the fraction of the size to blur at */
  constructor({ downscale = 0.5, ...options } = {}) {
    super(options);
    this.downscale = downscale;
  }

  /** @override */
  apply(filterManager, input, output, clearMode) {
    const resolution = input.source.resolution * this.downscale;
    const size = { width: input.width, height: input.height, resolution, antialias: false };

    const bright = TexturePool.getOptimalTexture(size);
    passesOf(this)._extractFilter.apply(filterManager, input, bright, true);

    const blurred = TexturePool.getOptimalTexture(size);
    passesOf(this)._blurFilter.apply(filterManager, bright, blurred, true);

    this.uniforms.uBloomScale = this.bloomScale;
    this.uniforms.uBrightness = this.brightness;
    this.resources.uMapTexture = blurred.source;
    filterManager.applyFilter(this, input, output, clearMode);

    TexturePool.returnTexture(blurred);
    TexturePool.returnTexture(bright);
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

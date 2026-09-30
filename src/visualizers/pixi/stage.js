/**
 * The renderer.
 *
 * Everything is built in screen space, every frame. The camera is a
 * projection applied while the geometry is made rather than a transform on
 * a container, which is what makes a line one pixel wide at every zoom, a
 * circle round rather than a magnified sprite, and a label the size it was
 * asked for. Drawing into a scaled container is where the old renderer's
 * shrinking labels and soft edges came from.
 *
 * What is drawn is deliberately plain: filled discs, rings, straight and
 * curved lines. The galaxy look comes from one bloom pass over the layer
 * holding them, so the cost of the glow no longer grows with the number of
 * things glowing.
 */

import { Application, Container, Graphics, Rectangle, Sprite, Text, Texture } from 'pixi.js';
import { AVATAR_FOOTPRINT, AVATAR_RADIUS } from '../../engine/actors.js';
import { drawRecordingOverlay } from '../../engine/recordingOverlay.js';
import { FONT_MONO } from '../../shared/fonts.js';
import { blurForZoom, createBloom } from './bloom.js';
import { onScreen, visible } from './culling.js';
import { createFaces } from './faces.js';
import { repoLabelSpot } from './labels.js';
import { clusterRgb, rgb } from './palette.js';

/** The plate behind a repo's name: padding around the word, and its corners. */
const TAG_PAD_X = 7;
const TAG_PAD_Y = 3;
const TAG_RADIUS = 4;

/** Below this many screen pixels a label is unreadable, so it is left out. */
const LABEL_MIN_RADIUS = 9;

/**
 * @param {HTMLElement} host
 * @param {{ background: string, onReady?: () => void }} options
 */
export async function createStage(host, { background }) {
  const app = new Application();
  await app.init({
    background,
    antialias: true,
    // The real device ratio, capped. Nothing here is fill-rate bound any
    // more, so there is no reason to draw fewer pixels than the screen has.
    resolution: Math.min(2, globalThis.devicePixelRatio || 1),
    autoDensity: true,
    preference: 'webgl',
    powerPreference: 'high-performance',
    resizeTo: undefined,
  });
  host.appendChild(app.canvas);
  app.canvas.style.width = '100%';
  app.canvas.style.height = '100%';
  app.canvas.style.display = 'block';
  app.canvas.style.cursor = 'grab';
  // The frame loop drives this; Pixi's own ticker would draw again.
  app.ticker.stop();

  const clouds = new Container();
  const cloudTexture = softDisc();
  for (const cloud of NEBULAE) {
    const sprite = new Sprite(cloudTexture);
    sprite.anchor.set(0.5);
    sprite.tint = cloud.color;
    sprite.alpha = cloud.alpha;
    sprite.blendMode = 'add';
    clouds.addChild(sprite);
  }
  const sky = new Graphics();
  const lit = new Container();
  const linkArt = new Graphics();
  const bodyArt = new Graphics();
  const rippleArt = new Graphics();
  const beamArt = new Graphics();
  // The halo and the ring round a face belong with the things that glow;
  // the photograph itself does not, or the bloom washes it out.
  const faceGlowArt = new Graphics();
  lit.addChild(linkArt, bodyArt, rippleArt, beamArt, faceGlowArt);
  const avatarArt = new Container();
  const faces = createFaces();
  const labelArt = new Container();
  // A repo's name goes over its own folder and file names, on a plate of
  // the background colour, so a title reads as a title rather than as one
  // more word among the things it names.
  const tagArt = new Container();
  const tagPlates = new Graphics();
  tagArt.addChild(tagPlates);
  // Burned-in titles for a video export. Drawn with the 2D context onto a
  // canvas of its own and laid over the scene, so the one piece of the old
  // renderer that has to stay pixel for pixel does.
  const titles = new Sprite();
  titles.visible = false;
  app.stage.addChild(clouds, sky, lit, avatarArt, labelArt, tagArt, titles);
  const titleCanvas = document.createElement('canvas');
  let titleKey = '';

  let bloom = null;
  let bloomKey = '';
  let bloomBlur = 0;

  /** @type {Map<string, Sprite>} */
  const avatarPool = new Map();
  /** @type {Map<string, Text>} */
  const labelPool = new Map();

  let width = host.clientWidth;
  let height = host.clientHeight;

  function resize(w, h) {
    width = Math.max(1, w);
    height = Math.max(1, h);
    app.renderer.resize(width, height);
    lit.filterArea = new Rectangle(0, 0, width, height);
  }
  resize(width, height);

  /** Turn the bloom on, off, or on to different settings. */
  function setBloom(spec) {
    const key = spec
      ? `${spec.threshold}|${spec.scale}|${spec.blur}|${spec.quality}|${spec.downscale}`
      : '';
    if (key === bloomKey) return;
    bloomKey = key;
    if (!spec) {
      // Not an empty list: a container with a filter list still renders
      // through a texture, and a look without a glow should not pay for one.
      lit.filters = null;
      bloom = null;
      return;
    }
    bloom = createBloom(spec);
    bloomBlur = bloom.blur;
    lit.filters = [bloom];
  }

  /**
   * Track the zoom with the width of the glow.
   *
   * Quantised because setting it rebuilds the blur's kernels, and the
   * camera moves by a fraction of a pixel most frames.
   */
  function aimBloom(spec, scale) {
    if (!bloom || !spec) return;
    const wanted = blurForZoom(spec.blur, scale) * spec.downscale;
    if (Math.abs(wanted - bloomBlur) < 0.25) return;
    bloomBlur = wanted;
    bloom.blur = wanted;
  }

  /**
   * One reusable Text per label, so a frame allocates nothing.
   *
   * @param {Container} layer which one it belongs to, since a repo's name
   *   is drawn over everything else rather than among it
   */
  function labelFor(key, text, style, layer = labelArt) {
    let label = labelPool.get(key);
    if (!label) {
      label = new Text({
        text,
        style: {
          fontFamily: FONT_MONO,
          fontSize: style.size,
          fontWeight: '600',
          fill: style.color,
        },
      });
      label.anchor.set(0.5, 0.5);
      labelPool.set(key, label);
      layer.addChild(label);
    }
    if (label.text !== text) label.text = text;
    // The look can change under a pooled label, and a dark style's ink on a
    // light style's paper is unreadable.
    if (label.style.fill !== style.color) label.style.fill = style.color;
    if (label.style.fontSize !== style.size) label.style.fontSize = style.size;
    label.visible = true;
    return label;
  }

  /** Titles for an export, redrawn only when what they say changes. */
  function drawTitles(meta, background) {
    const key = meta ? `${JSON.stringify(meta)}|${width}|${height}|${background}` : '';
    titles.visible = !!meta;
    if (!meta || key === titleKey) return;
    titleKey = key;

    const dpr = app.renderer.resolution;
    titleCanvas.width = Math.max(1, Math.ceil(width * dpr));
    titleCanvas.height = Math.max(1, Math.ceil(height * dpr));
    const ctx = titleCanvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, titleCanvas.width, titleCanvas.height);
    drawRecordingOverlay(ctx, { w: width, h: height, dpr }, meta, background);
    titles.texture?.destroy(true);
    titles.texture = Texture.from(titleCanvas);
    titles.texture.source.update();
    titles.width = width;
    titles.height = height;
  }

  return {
    canvas: app.canvas,
    resize,

    /**
     * Draw at a multiple of the screen's own pixel ratio.
     *
     * A video is a capture of the canvas, so its resolution is whatever the
     * canvas is drawn at, and an export can ask for more than the screen.
     *
     * @param {number} multiple
     */
    setResolution(multiple) {
      const wanted =
        Math.min(4, Math.max(0.5, multiple)) * Math.min(2, globalThis.devicePixelRatio || 1);
      if (app.renderer.resolution === wanted) return;
      app.renderer.resolution = wanted;
      titleKey = '';
      app.renderer.resize(width, height);
    },

    /** @param {any} frame */
    draw(frame) {
      const { cam, style, w, h } = frame;
      if (w !== width || h !== height) resize(w, h);
      setBloom(style.bloom);
      aimBloom(style.bloom, cam.scale);
      app.renderer.background.color = style.background;

      const scale = cam.scale;
      const px = (x) => x * scale + cam.tx;
      const py = (y) => y * scale + cam.ty;

      drawClouds(clouds, frame, width, height);
      drawSky(sky, frame, width, height);
      drawLinks(linkArt, frame, px, py);
      drawBodies(bodyArt, frame, px, py, scale);
      drawRipples(rippleArt, frame, px, py, scale);
      drawBeams(beamArt, frame, px, py);
      drawAvatars(avatarArt, faceGlowArt, avatarPool, faces, frame, px, py, scale);
      drawLabels(labelFor, labelPool, tagPlates, frame, px, py, scale);
      drawTitles(frame.recording, style.background);

      app.render();
    },

    destroy() {
      app.destroy(true, { children: true, texture: false });
    },
  };
}

/** Stars and nebula, or a paper grid, behind everything. */
/**
 * One soft disc, white, as a texture.
 *
 * Four window-sized gradients a frame was one of the things the old
 * renderer spent its time on. This is painted once and blown up.
 */
function softDisc(size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const half = size / 2;
    const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
    grad.addColorStop(0.5, 'rgba(255, 255, 255, 0.35)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  return Texture.from(canvas);
}

/** Slow coloured clouds, far enough apart that the field is not even. */
const NEBULAE = [
  { x: 0.18, y: 0.32, r: 380, color: 0x8c5adc, alpha: 0.1 },
  { x: 0.82, y: 0.22, r: 420, color: 0x3c6edc, alpha: 0.1 },
  { x: 0.62, y: 0.78, r: 460, color: 0xdc5aa0, alpha: 0.08 },
  { x: 0.32, y: 0.85, r: 400, color: 0x5adcb4, alpha: 0.07 },
];

function drawClouds(layer, frame, w, h) {
  layer.visible = frame.style.sky === 'stars';
  if (!layer.visible) return;
  const drift = frame.now * 0.00002;
  NEBULAE.forEach((cloud, i) => {
    const sprite = layer.children[i];
    sprite.position.set(
      cloud.x * w + Math.sin(drift + cloud.x * 8) * 24,
      cloud.y * h + Math.cos(drift + cloud.y * 8) * 24,
    );
    sprite.width = cloud.r * 2.4;
    sprite.height = cloud.r * 2.4;
  });
}

function drawSky(g, frame, w, h) {
  const { style, stars, now } = frame;
  g.clear();
  if (style.sky === 'stars') {
    for (const star of stars) {
      const drift = (now * 0.00001 * star.z) % 1;
      const x = ((star.x + drift) % 1) * w;
      const y = star.y * h;
      const twinkle = 0.55 + 0.45 * Math.sin(now * 0.001 + star.twinkle);
      g.circle(x, y, star.r * star.z);
      g.fill({ color: 0xcfe0ff, alpha: (0.25 + 0.5 * star.z) * twinkle });
    }
    return;
  }
  if (style.sky === 'grid') {
    for (let y = 64; y < h; y += 64) {
      g.moveTo(0, y + 0.5).lineTo(w, y + 0.5);
    }
    g.stroke({ width: 1, color: 0x0f1116, alpha: 0.05 });
  }
}

/**
 * Lay one import's path, straight or bowed.
 *
 * Kept separate because the same curve is walked twice: once wide and dim
 * for the body of the line, once thin and hot for the filament inside it.
 */
function layLink(g, ax, ay, bx, by, curve) {
  g.moveTo(ax, ay);
  if (!curve) {
    g.lineTo(bx, by);
    return;
  }
  const dx = bx - ax;
  const dy = by - ay;
  const norm = Math.hypot(dx, dy) || 1;
  const off = norm * curve;
  g.quadraticCurveTo((ax + bx) / 2 - (dy / norm) * off, (ay + by) / 2 + (dx / norm) * off, bx, by);
}

function drawLinks(g, frame, px, py) {
  const { links, style, palette, linkAlpha } = frame;
  g.clear();
  // Where the lines cross they add up, which is what makes a bundle of
  // imports read as one brighter strand.
  g.blendMode = style.bloom ? 'add' : 'normal';
  if (!links.length) return;

  for (const link of links) {
    const a = link.source;
    const b = link.target;
    if (!a || !b) continue;
    const focus = linkAlpha(a.path, b.path);
    const alpha = focus * style.link.alpha;
    if (alpha < 0.02) continue;

    const ax = px(a.x);
    const ay = py(a.y);
    const bx = px(b.x);
    const by = py(b.y);
    // Both ends off the same side of the screen: the line between them
    // cannot cross it.
    if (Math.max(ax, bx) < 0 || Math.min(ax, bx) > frame.w) continue;
    if (Math.max(ay, by) < 0 || Math.min(ay, by) > frame.h) continue;

    const color = clusterRgb(palette, a.dir, frame.styleName);
    const width = style.link.width + Math.min(1.6, link.weight * 0.4);

    layLink(g, ax, ay, bx, by, style.link.curve);
    g.stroke({ width, color: color.edge.value, alpha: alpha * color.edge.alpha });

    // A hot filament down the middle, the same trick the bubbles use: the
    // wide stroke is too faint to pass the bloom's threshold, so the thing
    // that glows is a thin bright line inside it.
    if (style.link.glow > 0) {
      layLink(g, ax, ay, bx, by, style.link.curve);
      g.stroke({
        width: Math.max(0.75, width * style.link.glowWidth),
        // Bright enough to pass the threshold, but still the cluster's own
        // colour: the near-white the bubbles use for their centres turns
        // every import into the same white thread.
        color: (color.ripple ?? color.core).value,
        alpha: focus * style.link.glow,
      });
    }
  }

  // What the inspector is pointed at, over the top and much brighter.
  for (const link of frame.highlightLinks) {
    const color = clusterRgb(palette, link.source.dir, frame.styleName);
    layLink(
      g,
      px(link.source.x),
      py(link.source.y),
      px(link.target.x),
      py(link.target.y),
      style.link.curve,
    );
    g.stroke({ width: 3, color: (color.swatch ?? color.core).value, alpha: 0.95 });
  }
}

/**
 * The smallest a disc is drawn, in screen pixels.
 *
 * Below about a pixel each one lands on a different part of the pixel grid,
 * and a field of them beats against that grid into a pattern the bloom then
 * makes plain. Holding the size and taking the brightness down instead puts
 * the same amount of light on screen without the pattern.
 */
export const MIN_DOT = 1.1;

/**
 * The alpha to draw at, once a disc is being held at the floor.
 *
 * Area, not radius: a disc held at twice the size it asked for has to be a
 * quarter as bright to put the same light on the screen.
 *
 * @param {number} radius what it asked for, in screen pixels
 * @param {number} alpha
 */
export function fadedBelow(radius, alpha) {
  return radius >= MIN_DOT ? alpha : alpha * (radius / MIN_DOT) ** 2;
}

/** A filled disc that thins out rather than shrinking past a pixel. */
function dot(g, x, y, radius, color, alpha) {
  const faded = fadedBelow(radius, alpha);
  if (faded < 0.004) return;
  g.circle(x, y, Math.max(MIN_DOT, radius));
  g.fill({ color, alpha: faded });
}

function drawBodies(g, frame, px, py, scale) {
  const { style, palette, styleName, nodeOpacity, cam, w, h } = frame;
  g.clear();

  for (const n of visible(frame.nodes, cam, w, h)) {
    const alpha = nodeOpacity(n);
    if (alpha < 0.02) continue;
    const color = clusterRgb(palette, n.dir, styleName);
    const x = px(n.x);
    const y = py(n.y);
    const r = (n.r ?? 6) * scale;
    const container = !!n.kind && n.kind !== 'file';
    // The cluster's own colour. `core` is nearly white in the galaxy
    // palette, where it was a pinpoint inside a coloured corona; what
    // carries the identity now the glow is a post-process is the swatch.
    const tint = (color.swatch ?? color.core).value;

    if (container) {
      // A repo or a folder is not one thing, and a disc that size reads as
      // an enormous file. The ring says it holds what is inside it.
      // Zoomed out far enough the ring is wider than what it encircles, so
      // it thins with the bubble rather than filling it in.
      const ring = Math.min(style.body.ringWidth, Math.max(0.7, r * 0.7));
      if (fadedBelow(r, alpha) > 0.004) {
        g.circle(x, y, Math.max(MIN_DOT, r));
        g.stroke({ width: ring, color: tint, alpha: fadedBelow(r, alpha * style.body.ring) });
      }
      dot(g, x, y, r * style.body.core * 0.5, tint, alpha * style.body.fill);
      continue;
    }

    dot(g, x, y, r, tint, alpha * style.body.fill);
    // A hot centre, which is what the bloom picks up and turns into a star.
    // Only once the bubble is big enough to have a middle: below that the
    // disc itself is the star, and a white dot on top of a one-pixel disc
    // is just a brighter pixel that flickers as the camera moves.
    if (r > 2.5) {
      dot(g, x, y, r * style.body.core, color.core.value, alpha * 0.9);
    }
  }

  const chosen = frame.nodeByPath.get(frame.selectedPath);
  if (chosen) {
    g.circle(px(chosen.x), py(chosen.y), (chosen.r ?? 6) * scale + 7);
    g.stroke({ width: 2.6, color: 0xffffff, alpha: 0.92 });
  }
}

function drawRipples(g, frame, px, py, scale) {
  const { ripples, style, palette, styleName, nodeByPath, showRipple } = frame;
  g.clear();
  if (!ripples.length) return;

  for (const ripple of ripples) {
    if (!showRipple(ripple.path)) continue;
    const n = nodeByPath.get(ripple.path);
    if (!n) continue;
    const t = Math.max(0, Math.min(1, ripple.progress ?? 0));
    const ease = 1 - (1 - t) ** 2;
    const reach = (50 + 120 * (ripple.intensity ?? 0)) * style.ripple.reach;
    const color = clusterRgb(palette, n.dir, styleName).ripple;
    const x = px(n.x);
    const y = py(n.y);

    for (let ring = 0; ring < style.ripple.rings; ring++) {
      const phase = Math.min(1, ease + ring * 0.16);
      const r = phase * reach * scale;
      if (r < 0.5) continue;
      const alpha = (1 - t) * (1 - ring * 0.3) * color.alpha;
      if (alpha <= 0.01) continue;
      g.circle(x, y, r);
      g.stroke({ width: style.ripple.width, color: color.value, alpha });
    }
  }
}

function drawBeams(g, frame, px, py) {
  const { beams, style } = frame;
  g.clear();
  if (!style.beams || !beams.length) return;

  for (const beam of beams) {
    const from = beam.from;
    const fx = px(from.sx ?? from.x);
    const fy = py(from.sy ?? from.y);
    const tx = px(beam.to.x);
    const ty = py(beam.to.y);
    const progress = beam.progress;
    const headX = fx + (tx - fx) * progress;
    const headY = fy + (ty - fy) * progress;
    // A short tail behind the head, so it reads as something in flight
    // rather than as a line that is already there.
    const tail = Math.max(0, progress - 0.25);
    const tailX = fx + (tx - fx) * tail;
    const tailY = fy + (ty - fy) * tail;
    const fade = 1 - progress * 0.35;
    const color = beamColor(from.hue ?? 200);

    g.moveTo(fx, fy).lineTo(headX, headY);
    g.stroke({ width: 1.4, color, alpha: 0.12 * fade });
    g.moveTo(tailX, tailY).lineTo(headX, headY);
    g.stroke({ width: 3, color, alpha: 0.85 * fade, cap: 'round' });
  }
}

/** @type {Map<number, number>} */
const beamColors = new Map();
function beamColor(hue) {
  const key = Math.round(hue);
  const hit = beamColors.get(key);
  if (hit != null) return hit;
  // hsl(hue, 92%, 66%) as a number, worked out once per hue.
  const h = key / 60;
  const c = 0.92 * (1 - Math.abs(2 * 0.66 - 1));
  const x = c * (1 - Math.abs((h % 2) - 1));
  const m = 0.66 - c / 2;
  const [r, g, b] =
    h < 1
      ? [c, x, 0]
      : h < 2
        ? [x, c, 0]
        : h < 3
          ? [0, c, x]
          : h < 4
            ? [0, x, c]
            : h < 5
              ? [x, 0, c]
              : [c, 0, x];
  const made =
    (Math.round((r + m) * 255) << 16) |
    (Math.round((g + m) * 255) << 8) |
    Math.round((b + m) * 255);
  beamColors.set(key, made);
  return made;
}

function drawAvatars(layer, glow, pool, faces, frame, px, py, scale) {
  const { actors, images } = frame;
  for (const sprite of pool.values()) sprite.visible = false;
  glow.clear();

  for (const actor of actors) {
    if (actor.alpha <= 0.01) continue;
    const x = px(actor.sx ?? actor.x);
    const y = py(actor.sy ?? actor.y);
    const r = AVATAR_RADIUS * scale;
    const tint = hslTint(actor.hue);

    glow.circle(x, y, AVATAR_FOOTPRINT * scale);
    glow.fill({ color: tint, alpha: actor.alpha * 0.35 });
    glow.circle(x, y, r);
    glow.stroke({ width: 1.5, color: tint, alpha: actor.alpha * 0.9 });

    const image = images.get(actor);
    let sprite = pool.get(actor.key);
    if (!sprite) {
      sprite = new Sprite();
      sprite.anchor.set(0.5);
      pool.set(actor.key, sprite);
      layer.addChild(sprite);
    }
    // Until the image arrives they are a plain disc in their own colour.
    if (image) {
      const texture = faces.textureFor(image);
      if (sprite.texture !== texture) {
        sprite.texture = texture;
        sprite.tint = 0xffffff;
      }
    } else if (sprite.texture !== Texture.WHITE) {
      sprite.texture = Texture.WHITE;
      sprite.tint = tint;
    }

    sprite.visible = true;
    sprite.alpha = actor.alpha;
    sprite.position.set(x, y);
    sprite.width = r * 2;
    sprite.height = r * 2;
  }
}

/** @type {Map<number, number>} */
const tints = new Map();
function hslTint(hue) {
  const key = Math.round(hue ?? 200);
  const hit = tints.get(key);
  if (hit != null) return hit;
  const made = beamColor(key);
  tints.set(key, made);
  return made;
}

function drawLabels(labelFor, pool, plates, frame, px, py, scale) {
  const { nodes, actors, style, clusters, showLabels, palette, styleName } = frame;
  for (const label of pool.values()) label.visible = false;
  plates.clear();
  if (!showLabels) return;

  // One name per repo, and only for the repos with something on screen to
  // name. Where it goes depends on whether the repo is one bubble or a
  // cluster of them, which `repoLabelSpot` decides.
  /** @type {Map<string, Array<{ x: number, y: number, r: number }>>} */
  const byRepo = new Map();
  for (const n of nodes) {
    const spot = { x: px(n.x), y: py(n.y), r: (n.r ?? 6) * scale };
    const seen = byRepo.get(n.dir);
    if (seen) seen.push(spot);
    else byRepo.set(n.dir, [spot]);
  }
  for (const [dir, members] of byRepo) {
    // The word is laid out first, because how far out it goes depends on
    // how wide it is.
    const label = labelFor(`repo:${dir}`, dir, style.label, plates.parent);
    const angle = clusters.get(dir)?.angle ?? -Math.PI / 2;
    const at = repoLabelSpot(members, angle, {
      width: label.width + TAG_PAD_X * 2,
      height: label.height + TAG_PAD_Y * 2,
    });
    if (!at) continue;
    if (at.x < -120 || at.x > frame.w + 120 || at.y < -40 || at.y > frame.h + 40) {
      label.visible = false;
      continue;
    }
    label.position.set(at.x, at.y);
    label.alpha = style.label.alpha;

    // A plate the size of the word, in the colour of the sky behind it,
    // edged in the repo's own colour so the tag says which repo it is.
    const colour = clusterRgb(palette, dir, styleName);
    const w = label.width / 2 + TAG_PAD_X;
    const h = label.height / 2 + TAG_PAD_Y;
    plates.roundRect(at.x - w, at.y - h, w * 2, h * 2, TAG_RADIUS);
    plates.fill({ color: rgb(style.background).value, alpha: style.label.plate });
    plates.stroke({
      width: 1,
      color: (colour.swatch ?? colour.core).value,
      alpha: style.label.plate * 0.6,
    });
  }

  // Folder names, once a folder is big enough on screen to read one.
  for (const n of nodes) {
    if (!n.kind || n.kind === 'file' || n.kind === 'repo') continue;
    if ((n.r ?? 6) * scale < LABEL_MIN_RADIUS) continue;
    if (!onScreen(frame.cam, frame.w, frame.h, n.x, n.y, n.r ?? 6)) continue;
    const name = n.path.slice(n.path.lastIndexOf('/') + 1);
    const label = labelFor(`body:${n.path}`, `${name} ${n.files}`, style.label);
    label.position.set(px(n.x), py(n.y) + (n.r ?? 6) * scale + 10);
    label.alpha = style.label.alpha * 0.8;
  }

  // The files the inspector has picked out, named.
  if (frame.focused?.size) {
    for (const n of nodes) {
      if (!frame.focused.has(n.path)) continue;
      if (!onScreen(frame.cam, frame.w, frame.h, n.x, n.y, n.r ?? 6)) continue;
      const name = n.path.slice(n.path.lastIndexOf('/') + 1);
      const label = labelFor(`pick:${n.path}`, name, style.label);
      label.position.set(px(n.x), py(n.y) - (n.r ?? 6) * scale - 9);
      label.alpha = 1;
    }
  }

  // And the people.
  for (const actor of actors) {
    if (actor.alpha <= 0.05) continue;
    const label = labelFor(`who:${actor.key}`, actor.name, style.label);
    label.position.set(
      px(actor.sx ?? actor.x),
      py(actor.sy ?? actor.y) + AVATAR_FOOTPRINT * scale + 9,
    );
    label.alpha = actor.alpha * 0.85;
  }
}

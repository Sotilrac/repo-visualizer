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
import { AdvancedBloomFilter } from 'pixi-filters';
import { AVATAR_FOOTPRINT, AVATAR_RADIUS } from '../../engine/actors.js';
import { drawRecordingOverlay } from '../../engine/recordingOverlay.js';
import { FONT_MONO } from '../../shared/fonts.js';
import { onScreen, visible } from './culling.js';
import { createFaces } from './faces.js';
import { clusterRgb } from './palette.js';

/** How far a bloom pass is allowed to blur, relative to the screen. */
const BLOOM_RESOLUTION = 0.5;

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
  // Burned-in titles for a video export. Drawn with the 2D context onto a
  // canvas of its own and laid over the scene, so the one piece of the old
  // renderer that has to stay pixel for pixel does.
  const titles = new Sprite();
  titles.visible = false;
  app.stage.addChild(clouds, sky, lit, avatarArt, labelArt, titles);
  const titleCanvas = document.createElement('canvas');
  let titleKey = '';

  /** @type {AdvancedBloomFilter | null} */
  let bloom = null;
  let bloomKey = '';

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
    const key = spec ? `${spec.threshold}|${spec.scale}|${spec.blur}|${spec.quality}` : '';
    if (key === bloomKey) return;
    bloomKey = key;
    if (!spec) {
      // Not an empty list: a container with a filter list still renders
      // through a texture, and a look without a glow should not pay for one.
      lit.filters = null;
      bloom = null;
      return;
    }
    bloom = new AdvancedBloomFilter({
      threshold: spec.threshold,
      bloomScale: spec.scale,
      brightness: 1,
      blur: spec.blur,
      quality: spec.quality,
    });
    // Half resolution on the blur, which is where a bloom spends its time
    // and where nobody can see the difference.
    bloom.resolution = BLOOM_RESOLUTION;
    lit.filters = [bloom];
  }

  /** One reusable Text per label, so a frame allocates nothing. */
  function labelFor(key, text, style) {
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
      labelArt.addChild(label);
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
      drawLabels(labelFor, labelPool, frame, px, py, scale);
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

function drawLinks(g, frame, px, py) {
  const { links, style, palette, linkAlpha } = frame;
  g.clear();
  if (!links.length) return;

  for (const link of links) {
    const a = link.source;
    const b = link.target;
    if (!a || !b) continue;
    const alpha = linkAlpha(a.path, b.path) * style.link.alpha;
    if (alpha < 0.02) continue;

    const ax = px(a.x);
    const ay = py(a.y);
    const bx = px(b.x);
    const by = py(b.y);
    // Both ends off the same side of the screen: the line between them
    // cannot cross it.
    if (Math.max(ax, bx) < 0 || Math.min(ax, bx) > frame.w) continue;
    if (Math.max(ay, by) < 0 || Math.min(ay, by) > frame.h) continue;

    g.moveTo(ax, ay);
    if (style.link.curve) {
      const dx = bx - ax;
      const dy = by - ay;
      const norm = Math.hypot(dx, dy) || 1;
      const off = norm * style.link.curve;
      g.quadraticCurveTo(
        (ax + bx) / 2 - (dy / norm) * off,
        (ay + by) / 2 + (dx / norm) * off,
        bx,
        by,
      );
    } else {
      g.lineTo(bx, by);
    }
    const color = clusterRgb(palette, a.dir, frame.styleName).edge;
    g.stroke({
      width: style.link.width + Math.min(1.6, link.weight * 0.4),
      color: color.value,
      alpha: alpha * color.alpha,
    });
  }

  // What the inspector is pointed at, over the top and much brighter.
  for (const link of frame.highlightLinks) {
    const color = clusterRgb(palette, link.source.dir, frame.styleName);
    g.moveTo(px(link.source.x), py(link.source.y)).lineTo(px(link.target.x), py(link.target.y));
    g.stroke({ width: 2.4, color: (color.swatch ?? color.core).value, alpha: 0.95 });
  }
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
    const r = Math.max(0.6, (n.r ?? 6) * scale);
    const container = !!n.kind && n.kind !== 'file';
    // The cluster's own colour. `core` is nearly white in the galaxy
    // palette, where it was a pinpoint inside a coloured corona; what
    // carries the identity now the glow is a post-process is the swatch.
    const tint = (color.swatch ?? color.core).value;

    if (container) {
      // A repo or a folder is not one thing, and a disc that size reads as
      // an enormous file. The ring says it holds what is inside it.
      g.circle(x, y, r);
      g.stroke({ width: style.body.ringWidth, color: tint, alpha: alpha * style.body.ring });
      g.circle(x, y, Math.max(0.6, r * style.body.core * 0.5));
      g.fill({ color: tint, alpha: alpha * style.body.fill });
      continue;
    }

    g.circle(x, y, r);
    g.fill({ color: tint, alpha: alpha * style.body.fill });
    // A hot centre, which is what the bloom picks up and turns into a star.
    if (r > 2) {
      g.circle(x, y, Math.max(0.5, r * style.body.core));
      g.fill({ color: color.core.value, alpha: alpha * 0.9 });
    }
  }

  const chosen = frame.nodeByPath.get(frame.selectedPath);
  if (chosen) {
    g.circle(px(chosen.x), py(chosen.y), (chosen.r ?? 6) * scale + 7);
    g.stroke({ width: 2, color: 0xffffff, alpha: 0.92 });
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
    g.stroke({ width: 1, color, alpha: 0.12 * fade });
    g.moveTo(tailX, tailY).lineTo(headX, headY);
    g.stroke({ width: 2.2, color, alpha: 0.85 * fade, cap: 'round' });
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

function drawLabels(labelFor, pool, frame, px, py, scale) {
  const { nodes, actors, style, clusters, showLabels } = frame;
  for (const label of pool.values()) label.visible = false;
  if (!showLabels) return;

  // One name per repo, out beyond the bubbles it holds, and only for the
  // repos that have something on screen to name.
  const shown = new Set();
  for (const n of nodes) shown.add(n.dir);
  for (const [dir, center] of clusters) {
    if (!shown.has(dir)) continue;
    const reach = (center.radius ?? 80) + 26 / scale;
    const angle = center.angle ?? -Math.PI / 2;
    const x = px(center.x + Math.cos(angle) * reach);
    const y = py(center.y + Math.sin(angle) * reach);
    if (x < -120 || x > frame.w + 120 || y < -40 || y > frame.h + 40) continue;
    const label = labelFor(`repo:${dir}`, dir, style.label);
    label.position.set(x, y);
    label.alpha = style.label.alpha;
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

/**
 * 2D camera for canvas visualizers: pan, zoom, auto-fit.
 */

const MIN_SCALE = 0.15;
const MAX_SCALE = 8;
const DEFAULT_PADDING = 120;

/**
 * How much of what is left over the graph is fitted into.
 *
 * Framing it edge to edge leaves nothing between the outermost bubble and
 * the side of the window, and the people stand outside the bubbles.
 */
const FILL = 0.88;

export function createCamera() {
  return {
    scale: 1,
    tx: 0,
    ty: 0,
    targetScale: 1,
    targetTx: 0,
    targetTy: 0,
    userAdjusted: false,
  };
}

export function screenToWorld(cam, sx, sy) {
  return {
    x: (sx - cam.tx) / cam.scale,
    y: (sy - cam.ty) / cam.scale,
  };
}

export function worldToScreen(cam, wx, wy) {
  return {
    x: wx * cam.scale + cam.tx,
    y: wy * cam.scale + cam.ty,
  };
}

export function zoomAt(cam, sx, sy, factor) {
  const wx = (sx - cam.tx) / cam.scale;
  const wy = (sy - cam.ty) / cam.scale;
  const nextScale = clamp(cam.scale * factor, MIN_SCALE, MAX_SCALE);
  cam.scale = nextScale;
  cam.targetScale = nextScale;
  cam.tx = sx - wx * nextScale;
  cam.ty = sy - wy * nextScale;
  cam.targetTx = cam.tx;
  cam.targetTy = cam.ty;
  cam.userAdjusted = true;
}

export function panBy(cam, dx, dy) {
  cam.tx += dx;
  cam.ty += dy;
  cam.targetTx = cam.tx;
  cam.targetTy = cam.ty;
  cam.userAdjusted = true;
}

export function resetCamera(cam) {
  cam.scale = 1;
  cam.tx = 0;
  cam.ty = 0;
  cam.targetScale = 1;
  cam.targetTx = 0;
  cam.targetTy = 0;
  cam.userAdjusted = false;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/** Below these the fit has not really changed, so the camera stays put. */
const SCALE_DEADBAND = 0.02;
const SHIFT_DEADBAND = 10;

/**
 * How much of the viewport may go unused before the camera pulls in.
 *
 * Between this and the edges of the frame the camera does nothing at all.
 * Following the exact fit means moving whenever a bubble does, and a scene
 * where everything slides a little every frame is harder to read than one
 * framed slightly loose.
 */
const SLACK = 0.5;

/**
 * Point the camera at everything.
 *
 * Called every frame while auto-fit is on, against a graph whose bodies are
 * always moving, so the fit it computes is never quite the same twice. Past
 * a deadband the camera would swim for as long as the simulation runs, and
 * chasing a target that moves a pixel a frame reads as a glitch rather than
 * as a camera.
 *
 * @param {number} [margin] world-space room to leave around everything, for
 *   what is drawn beside the graph rather than in it: the avatars stand off
 *   the repos they are firing at and would otherwise sit off screen.
 */
export function fitBounds(cam, points, w, h, padding = DEFAULT_PADDING, margin = 0) {
  if (!points.length) {
    cam.targetScale = 1;
    cam.targetTx = 0;
    cam.targetTy = 0;
    return;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x == null || p.y == null) continue;
    const pad = (p.r ?? 8) + 12 + margin;
    minX = Math.min(minX, p.x - pad);
    minY = Math.min(minY, p.y - pad);
    maxX = Math.max(maxX, p.x + pad);
    maxY = Math.max(maxY, p.y + pad);
  }
  if (!Number.isFinite(minX)) return;

  const bw = Math.max(60, maxX - minX);
  const bh = Math.max(60, maxY - minY);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const scale = clamp(
    Math.min((w - padding * 2) / bw, (h - padding * 2) / bh) * FILL,
    MIN_SCALE,
    MAX_SCALE,
  );

  // Already showing all of it, without too much room to spare: leave it.
  if (framedWell(cam, minX, minY, maxX, maxY, w, h)) return;

  const tx = w / 2 - cx * scale;
  const ty = h / 2 - cy * scale;

  const settled =
    Math.abs(scale / cam.targetScale - 1) < SCALE_DEADBAND &&
    Math.abs(tx - cam.targetTx) < SHIFT_DEADBAND &&
    Math.abs(ty - cam.targetTy) < SHIFT_DEADBAND;
  if (settled) return;

  cam.targetScale = scale;
  cam.targetTx = tx;
  cam.targetTy = ty;
}

/**
 * Whether what the camera is already pointed at shows the whole graph with
 * a sensible amount of room around it.
 */
function framedWell(cam, minX, minY, maxX, maxY, w, h) {
  const scale = cam.targetScale;
  if (!scale) return false;

  const left = -cam.targetTx / scale;
  const top = -cam.targetTy / scale;
  const right = (w - cam.targetTx) / scale;
  const bottom = (h - cam.targetTy) / scale;
  const inside = minX >= left && maxX <= right && minY >= top && maxY <= bottom;
  if (!inside) return false;

  const used = Math.max((maxX - minX) / (right - left), (maxY - minY) / (bottom - top));
  return used > 1 - SLACK;
}

/** Snap camera to fit target immediately (e.g. after resize). */
export function snapCamera(cam) {
  cam.scale = cam.targetScale;
  cam.tx = cam.targetTx;
  cam.ty = cam.targetTy;
}

/**
 * Ease the camera towards the fit, a fraction of the way each frame.
 *
 * @param {number} dt milliseconds since the last frame
 * @param {number} [speed] the fraction covered in a 16ms frame
 */
export function lerpCamera(cam, dt, speed = 0.08) {
  const t = 1 - (1 - Math.min(1, Math.max(0, speed))) ** (dt / 16);
  cam.scale += (cam.targetScale - cam.scale) * t;
  cam.tx += (cam.targetTx - cam.tx) * t;
  cam.ty += (cam.targetTy - cam.ty) * t;
}

/**
 * Compose DPR scaling with camera pan/zoom (all in CSS pixel space).
 */
export function applyCameraTransform(ctx, cam, dpr = 1) {
  const s = cam.scale * dpr;
  ctx.setTransform(s, 0, 0, s, cam.tx * dpr, cam.ty * dpr);
}

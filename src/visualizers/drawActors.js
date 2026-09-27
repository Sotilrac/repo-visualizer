/**
 * Draw the actors and their beams, in world space.
 *
 * A beam is a line from the person to the file, with a bright head running
 * along it and a tail behind. The head is what reads as the laser; the line
 * behind it is faint so a busy commit does not white out the graph.
 */

import { AVATAR_RADIUS } from '../engine/actors.js';

export { AVATAR_RADIUS };

/** Where an actor is drawn, which lags where the forces have put it. */
const drawnAt = (actor) => ({ x: actor.sx ?? actor.x, y: actor.sy ?? actor.y });
const LABEL_MIN_SCALE = 0.55;

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ actors: any[], beams: any[], images: { get: (a: any) => any }, cameraScale: number }} frame
 */
export function drawActors(ctx, { actors, beams, images, cameraScale }) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const beam of beams) drawBeam(ctx, beam);
  ctx.restore();

  for (const actor of actors) drawActor(ctx, actor, images.get(actor), cameraScale);
}

function drawBeam(ctx, beam) {
  const { to, progress } = beam;
  const from = { ...beam.from, ...drawnAt(beam.from) };
  const headX = from.x + (to.x - from.x) * progress;
  const headY = from.y + (to.y - from.y) * progress;

  // The tail is a short segment behind the head. Drawing the whole path
  // gives a static line; a short tail reads as something in flight.
  const tail = Math.max(0, progress - 0.25);
  const tailX = from.x + (to.x - from.x) * tail;
  const tailY = from.y + (to.y - from.y) * tail;

  const fade = 1 - progress * 0.35;
  const hue = from.hue ?? 200;

  ctx.strokeStyle = `hsla(${hue}, 90%, 62%, ${0.12 * fade})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(headX, headY);
  ctx.stroke();

  const gradient = ctx.createLinearGradient(tailX, tailY, headX, headY);
  gradient.addColorStop(0, `hsla(${hue}, 90%, 62%, 0)`);
  gradient.addColorStop(1, `hsla(${hue}, 95%, 72%, ${0.85 * fade})`);
  ctx.strokeStyle = gradient;
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(tailX, tailY);
  ctx.lineTo(headX, headY);
  ctx.stroke();
}

function drawActor(ctx, actor, image, cameraScale) {
  const { alpha, hue } = actor;
  const { x, y } = drawnAt(actor);
  if (alpha <= 0) return;

  ctx.save();
  ctx.globalAlpha = alpha;

  ctx.beginPath();
  ctx.arc(x, y, AVATAR_RADIUS + 2, 0, Math.PI * 2);
  ctx.fillStyle = `hsla(${hue}, 60%, 50%, 0.35)`;
  ctx.fill();

  if (image) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, AVATAR_RADIUS, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(
      image,
      x - AVATAR_RADIUS,
      y - AVATAR_RADIUS,
      AVATAR_RADIUS * 2,
      AVATAR_RADIUS * 2,
    );
    ctx.restore();
  } else {
    ctx.beginPath();
    ctx.arc(x, y, AVATAR_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = `hsl(${hue}, 52%, 42%)`;
    ctx.fill();
  }

  ctx.beginPath();
  ctx.arc(x, y, AVATAR_RADIUS, 0, Math.PI * 2);
  ctx.strokeStyle = `hsla(${hue}, 85%, 70%, 0.9)`;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Below this zoom the labels overlap into noise, so they go.
  if (cameraScale >= LABEL_MIN_SCALE) {
    ctx.font = `600 ${Math.round(11 / cameraScale)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = `rgba(255, 255, 255, ${0.75 * alpha})`;
    ctx.fillText(actor.name, x, y + AVATAR_RADIUS + 4 / cameraScale);
  }

  ctx.restore();
}

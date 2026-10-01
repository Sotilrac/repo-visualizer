/**
 * The commit card, burned into a recording.
 *
 * The card on screen is HTML, which a canvas capture never sees, so a
 * recording used to say when something happened and never what. This draws
 * the same thing in the same corner: the commit, who wrote it, and what it
 * touched.
 */

import { monoFont, sansFont } from '../shared/fonts.js';

const WIDTH = 340;
const PAD = 14;
const AVATAR = 22;
const ROW = 16;
const MESSAGE_LINE = 19;
const MAX_CHANGES = 6;

/**
 * Break `text` to `width`, in at most `maxLines`, ellipsising what is left.
 *
 * Words where it can, mid-word where it must: a commit message is often one
 * unbreakable branch name, and a line that overruns the card is worse than
 * a cut one.
 *
 * @param {(text: string) => number} measure
 * @param {string | null | undefined} text
 * @param {number} width
 * @param {number} maxLines
 */
export function clampLines(measure, text, width, maxLines) {
  const flat = String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!flat) return [];

  const fits = (line) => measure(line) <= width;
  const lines = [];
  let rest = flat;

  while (rest && lines.length < maxLines) {
    if (fits(rest)) {
      lines.push(rest);
      break;
    }

    let cut = rest.length;
    while (cut > 1 && !fits(rest.slice(0, cut))) cut -= 1;

    if (lines.length === maxLines - 1) {
      let end = cut;
      while (end > 1 && !fits(`${rest.slice(0, end)}…`)) end -= 1;
      lines.push(`${rest.slice(0, end).trimEnd()}…`);
      break;
    }

    const space = rest.lastIndexOf(' ', cut);
    const take = space > 0 ? space : cut;
    lines.push(rest.slice(0, take).trimEnd());
    rest = rest.slice(take).trimStart();
  }

  return lines;
}

/**
 * @typedef {object} CardContents
 * @property {string} [sha]
 * @property {string} [position]  "0042 / 1498"
 * @property {string} [name]
 * @property {number} [hue]
 * @property {string} [date]
 * @property {string} [message]
 * @property {{ files: number, insertions: number, deletions: number }} [stats]
 * @property {Array<{ status: string, path: string }>} [changes]
 */

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ x: number, bottom: number }} at  the card's left edge and base
 * @param {CardContents} card
 * @param {{ fg: string, muted: string, panel: string, cool: string, hot: string }} ink
 * @param {CanvasImageSource | null} [face]  the author's avatar, once loaded
 */
export function drawCommitCard(ctx, { x, bottom }, card, ink, face = null) {
  if (!card) return 0;

  const inner = WIDTH - PAD * 2;
  ctx.font = sansFont(500, 14);
  const message = clampLines((t) => ctx.measureText(t).width, card.message, inner, 2);
  const changes = (card.changes ?? []).slice(0, MAX_CHANGES);
  const more = Math.max(0, (card.changes?.length ?? 0) - changes.length);

  let height = PAD * 2;
  if (card.sha || card.position) height += ROW;
  if (card.name) height += AVATAR + 6;
  height += message.length * MESSAGE_LINE;
  if (card.stats) height += ROW;
  if (changes.length) height += changes.length * ROW + 4;
  if (more) height += ROW;

  const top = bottom - height;
  ctx.fillStyle = ink.panel;
  roundRect(ctx, x, top, WIDTH, height, 10);
  ctx.fill();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  let y = top + PAD;

  if (card.sha || card.position) {
    ctx.font = monoFont(600, 11);
    ctx.fillStyle = ink.muted;
    if (card.sha) ctx.fillText(card.sha, x + PAD, y);
    if (card.position) {
      ctx.textAlign = 'right';
      ctx.fillText(card.position, x + WIDTH - PAD, y);
      ctx.textAlign = 'left';
    }
    y += ROW;
  }

  if (card.name) {
    const cx = x + PAD + AVATAR / 2;
    const cy = y + AVATAR / 2;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, AVATAR / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    if (face) {
      ctx.drawImage(face, x + PAD, y, AVATAR, AVATAR);
    } else {
      ctx.fillStyle = `hsl(${card.hue ?? 210} 52% 42%)`;
      ctx.fill();
    }
    ctx.restore();

    ctx.font = sansFont(600, 13);
    ctx.fillStyle = ink.fg;
    ctx.textBaseline = 'middle';
    const nameX = x + PAD + AVATAR + 8;
    ctx.fillText(card.name, nameX, cy);
    if (card.date) {
      const after = nameX + ctx.measureText(card.name).width + 8;
      ctx.font = monoFont(500, 11);
      ctx.fillStyle = ink.muted;
      ctx.fillText(card.date, after, cy + 1);
    }
    ctx.textBaseline = 'top';
    y += AVATAR + 6;
  }

  ctx.font = sansFont(500, 14);
  ctx.fillStyle = ink.fg;
  for (const line of message) {
    ctx.fillText(line, x + PAD, y);
    y += MESSAGE_LINE;
  }

  if (card.stats) {
    const { files, insertions, deletions } = card.stats;
    ctx.font = monoFont(500, 11);
    let sx = x + PAD;
    const part = (text, colour) => {
      ctx.fillStyle = colour;
      ctx.fillText(text, sx, y + 2);
      sx += ctx.measureText(text).width + 10;
    };
    part(`${files} file${files === 1 ? '' : 's'}`, ink.muted);
    part(`+${insertions}`, ink.cool);
    part(`−${deletions}`, ink.hot);
    y += ROW;
  }

  if (changes.length) {
    y += 4;
    ctx.font = monoFont(500, 11);
    for (const change of changes) {
      const status = change.status || 'M';
      ctx.fillStyle = status === 'D' ? ink.hot : status === 'A' ? ink.cool : ink.muted;
      ctx.fillText(status, x + PAD, y);
      ctx.fillStyle = ink.muted;
      const [path] = clampLines((t) => ctx.measureText(t).width, change.path, inner - 18, 1);
      ctx.fillText(path ?? '', x + PAD + 18, y);
      y += ROW;
    }
    if (more) {
      ctx.fillStyle = ink.muted;
      ctx.fillText(`+ ${more} more`, x + PAD, y);
    }
  }

  return height;
}

function roundRect(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  ctx.lineTo(x + rad, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
  ctx.lineTo(x, y + rad);
  ctx.quadraticCurveTo(x, y, x + rad, y);
  ctx.closePath();
}

export { WIDTH as CARD_WIDTH };

/**
 * The commit card, burned into a recording.
 *
 * The card on screen is HTML, which a canvas capture never sees, so a
 * recording used to say when something happened and never what. This draws
 * the same thing in the same corner: the commit, who wrote it, and what it
 * touched.
 */

import { monoFont, sansFont } from '../shared/fonts.js';

/**
 * The card hangs from its top edge, near the top right corner.
 *
 * Everything a person reads first, the sha, the face, the message, is in
 * the same place on every commit; only the file list under them moves, and
 * it grows downwards into whatever room the frame has. A card that reflowed
 * around its content would jump once a commit, which in a video reads as a
 * flicker, and one anchored to the bottom would jump on every one.
 */
export const CARD_WIDTH = 320;
const RADIUS = 12;
const PAD_X = 20;
const PAD_Y = 18;
const AVATAR = 22;
const HEAD = 16;
const BYLINE = AVATAR + 8;
const MESSAGE_LINE = 19;
const MESSAGE_LINES = 2;
const STATS = 20;
const ROW = 16;
const LIST_GAP = 6;

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
 * @property {string} [position]  "42 / 1498"
 * @property {string} [name]
 * @property {number} [hue]
 * @property {string} [date]
 * @property {string} [message]
 * @property {{ files: number, insertions: number, deletions: number }} [stats]
 * @property {Array<{ status: string, path: string }>} [changes]
 */

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ x: number, top: number, maxHeight: number }} at  the card's top
 *   left corner, and the room below it
 * @param {CardContents} card
 * @param {{
 *   fg: string, muted: string, card: string, line: string,
 *   cool: string, hot: string,
 * }} ink
 * @param {CanvasImageSource | null} [face]  the author's avatar, once loaded
 * @returns {number} the height it took
 */
export function drawCommitCard(ctx, { x, top, maxHeight }, card, ink, face = null) {
  if (!card) return 0;
  const inner = CARD_WIDTH - PAD_X * 2;

  // The head is the same every time; only the list is as long as the commit
  // was, and it stops where the frame does.
  const head = PAD_Y + HEAD + BYLINE + MESSAGE_LINES * MESSAGE_LINE + STATS;
  const changes = card.changes ?? [];
  const room = Math.max(0, Math.floor((maxHeight - head - PAD_Y - LIST_GAP) / ROW));
  const shown = changes.slice(0, changes.length > room ? Math.max(0, room - 1) : room);
  const more = changes.length - shown.length;
  const rows = shown.length + (more > 0 ? 1 : 0);
  const height = head + PAD_Y + (rows ? LIST_GAP + rows * ROW : 0);

  ctx.save();
  roundRect(ctx, x, top, CARD_WIDTH, height, RADIUS);
  ctx.fillStyle = ink.card;
  ctx.fill();
  ctx.strokeStyle = ink.line;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  let y = top + PAD_Y;

  ctx.font = monoFont(600, 11);
  ctx.fillStyle = ink.muted;
  if (card.sha) ctx.fillText(card.sha, x + PAD_X, y);
  if (card.position) {
    ctx.textAlign = 'right';
    ctx.fillText(card.position, x + CARD_WIDTH - PAD_X, y);
    ctx.textAlign = 'left';
  }
  y += HEAD;

  if (card.name) {
    const cx = x + PAD_X + AVATAR / 2;
    const cy = y + AVATAR / 2;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, AVATAR / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    if (face) {
      ctx.drawImage(face, x + PAD_X, y, AVATAR, AVATAR);
    } else {
      ctx.fillStyle = `hsl(${card.hue ?? 210} 52% 42%)`;
      ctx.fill();
    }
    ctx.restore();

    ctx.font = sansFont(600, 13);
    ctx.fillStyle = ink.fg;
    ctx.textBaseline = 'middle';
    const nameX = x + PAD_X + AVATAR + 8;
    ctx.fillText(card.name, nameX, cy);
    if (card.date) {
      const after = nameX + ctx.measureText(card.name).width + 8;
      ctx.font = monoFont(500, 11);
      ctx.fillStyle = ink.muted;
      ctx.fillText(card.date, after, cy + 1);
    }
    ctx.textBaseline = 'top';
  }
  y += BYLINE;

  // Two lines of room whether the message needs them or not, so everything
  // under it sits where it sat on the commit before.
  ctx.font = sansFont(500, 14);
  ctx.fillStyle = ink.fg;
  const message = clampLines((t) => ctx.measureText(t).width, card.message, inner, MESSAGE_LINES);
  for (const [i, line] of message.entries()) ctx.fillText(line, x + PAD_X, y + i * MESSAGE_LINE);
  y += MESSAGE_LINES * MESSAGE_LINE;

  if (card.stats) {
    const { files, insertions, deletions } = card.stats;
    ctx.font = monoFont(500, 11);
    let sx = x + PAD_X;
    const part = (text, colour) => {
      ctx.fillStyle = colour;
      ctx.fillText(text, sx, y + 2);
      sx += ctx.measureText(text).width + 10;
    };
    part(`${files} file${files === 1 ? '' : 's'}`, ink.muted);
    part(`+${insertions}`, ink.cool);
    part(`−${deletions}`, ink.hot);
  }
  y += STATS;

  if (rows) {
    y += LIST_GAP;
    ctx.font = monoFont(500, 11);
    for (const change of shown) {
      const status = change.status || 'M';
      ctx.fillStyle = status === 'D' ? ink.hot : status === 'A' ? ink.cool : ink.muted;
      ctx.fillText(status, x + PAD_X, y);
      ctx.fillStyle = ink.muted;
      const [path] = clampLines((t) => ctx.measureText(t).width, change.path, inner - 18, 1);
      ctx.fillText(path ?? '', x + PAD_X + 18, y);
      y += ROW;
    }
    if (more > 0) {
      ctx.fillStyle = ink.muted;
      ctx.fillText(`+ ${more} more`, x + PAD_X, y);
    }
  }

  ctx.restore();
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

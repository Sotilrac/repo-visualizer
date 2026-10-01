/**
 * Burned-in titles for timeline exports (canvas capture only).
 */

import { monoFont, sansFont } from '../shared/fonts.js';
import { CARD_WIDTH, drawCommitCard } from './recordingCard.js';

function isLightBackground(hex) {
  if (!hex?.startsWith('#') || hex.length < 7) return false;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 160;
}

function formatCommitDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/** @param {string | null | undefined} iso */
function asMonth(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

/**
 * The stretch of history a recording covers, for the line under its title.
 *
 * Months, not days: the date plate at the top is already counting days, and
 * this one is here to say how long the whole thing is.
 *
 * @param {string | null | undefined} first  the oldest commit's date
 * @param {string | null | undefined} last
 */
export function recordingSpan(first, last) {
  const from = asMonth(first);
  const to = asMonth(last);
  if (!from || !to) return '';
  return from === to ? from : `${from} – ${to}`;
}

/**
 * Draw export titles in screen space (call after graph, before frame ends).
 */
export function drawRecordingOverlay(ctx, { w, h, dpr }, meta, background = '#03040a', face) {
  if (!meta) return;

  const light = isLightBackground(background);
  const fg = light ? 'rgba(12, 14, 20, 0.94)' : 'rgba(255, 255, 255, 0.94)';
  const fgMuted = light ? 'rgba(12, 14, 20, 0.62)' : 'rgba(255, 255, 255, 0.62)';
  const panel = light ? 'rgba(255, 255, 255, 0.72)' : 'rgba(6, 8, 16, 0.55)';
  const padY = Math.max(22, h * 0.04);
  const ink = { fg, muted: fgMuted, panel, cool: '#8affd3', hot: '#ff8ad8' };

  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalCompositeOperation = 'source-over';

  const dateStr = formatCommitDate(meta.commitDate);
  if (dateStr) {
    ctx.font = monoFont(600, 15);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const tw = ctx.measureText(dateStr).width + 28;
    const th = 34;
    const tx = (w - tw) / 2;
    const ty = padY;
    ctx.fillStyle = panel;
    roundRect(ctx, tx, ty, tw, th, 8);
    ctx.fill();
    ctx.fillStyle = fg;
    ctx.fillText(dateStr, w / 2, ty + 10);
  }

  if (meta.card) {
    drawCommitCard(ctx, { x: w - padY - CARD_WIDTH, bottom: h - padY }, meta.card, ink, face);
  }

  const repoName = meta.repoName?.trim() || '';
  const subtitle = meta.subtitle?.trim() || '';
  if (repoName || subtitle) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';

    let blockH = 0;
    let nameW = 0;
    let countW = 0;

    if (repoName) {
      ctx.font = sansFont(600, 20);
      nameW = ctx.measureText(repoName).width;
      blockH += 26;
    }
    if (subtitle) {
      ctx.font = monoFont(500, 13);
      countW = ctx.measureText(subtitle).width;
      blockH += repoName ? 22 : 20;
    }

    const bw = Math.max(nameW, countW) + 32;
    const bx = (w - bw) / 2;
    const by = h - padY - blockH;

    ctx.fillStyle = panel;
    roundRect(ctx, bx, by, bw, blockH + 16, 8);
    ctx.fill();

    let y = h - padY - 8;
    if (subtitle) {
      ctx.font = monoFont(500, 13);
      ctx.fillStyle = fgMuted;
      ctx.fillText(subtitle, w / 2, y);
      y -= 22;
    }
    if (repoName) {
      ctx.font = sansFont(600, 20);
      ctx.fillStyle = fg;
      ctx.fillText(repoName, w / 2, y);
    }
  }

  ctx.restore();
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

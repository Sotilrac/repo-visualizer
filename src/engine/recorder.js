/**
 * Record the stage, frame by frame.
 *
 * Nothing here runs on the wall clock. The caller hands over a way to put
 * the timeline on a commit and a way to draw exactly one frame, and this
 * walks the plan: place, draw, encode, next. A frame that takes half a
 * second to compute makes the export longer and the file no different.
 */

import GIF from 'gif.js/dist/gif.js';
import gifWorkerUrl from 'gif.js/dist/gif.worker.js?url';
import { captureFrames, framePlan } from './frameCapture.js';
import { openVideo } from './videoSink.js';

const GIF_MAX_FRAMES = 600;

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function captureFrame(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to capture frame'));
    }, 'image/png');
  });
}

/** A filename stem from whatever the recording is called. */
function stemOf(name) {
  return (
    String(name ?? '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'history'
  );
}

/** Canvas context tuned for repeated getImageData (gif.js). */
function createReadbackContext(width, height) {
  const el = document.createElement('canvas');
  el.width = width;
  el.height = height;
  const ctx = el.getContext('2d', { willReadFrequently: true });
  return { el, ctx };
}

/**
 * A gif.js sink, which collects frames and encodes them at the end.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {number} frameMs
 */
function gifSink(canvas, frameMs) {
  const gif = new GIF({
    workers: 2,
    quality: 10,
    width: canvas.width,
    height: canvas.height,
    workerScript: gifWorkerUrl,
  });
  const { ctx } = createReadbackContext(canvas.width, canvas.height);

  return {
    add() {
      ctx.drawImage(canvas, 0, 0);
      gif.addFrame(ctx, { copy: true, delay: Math.round(frameMs) });
    },
    /** @param {(n: number) => void} [onProgress] */
    close(onProgress) {
      /** @type {Promise<Blob>} */
      const encoded = new Promise((resolve, reject) => {
        gif.on('progress', (p) => onProgress?.(p));
        gif.on('finished', (blob) => resolve(blob));
        gif.on('error', reject);
        onProgress?.(0);
        gif.render();
      });
      return encoded;
    },
  };
}

/**
 * Record or snapshot the stage canvas.
 *
 * @param {object} params
 * @param {HTMLCanvasElement} params.canvas the stage canvas to capture
 * @param {{ format: 'webm'|'gif'|'png', fps?: number }} params.opts
 * @param {{ commits: number, msPerCommit: number }} [params.playback]
 * @param {(commit: number) => Promise<void> | void} [params.advanceTo]
 * @param {(ms: number) => Promise<void> | void} [params.drawFrame]
 * @param {(done: number) => void} [params.onCaptureProgress] 0 to 1 while drawing
 * @param {(n: number) => void} [params.onEncodeProgress] 0 to 1 while building the file
 * @param {(format: 'webm'|'gif') => void} [params.onEncodingStart]
 * @param {() => boolean} [params.shouldStop] polled to end the capture early
 * @param {string} [params.name] names the downloaded file
 */
export async function startRecording({
  canvas,
  opts,
  playback,
  advanceTo = () => {},
  drawFrame = () => {},
  onCaptureProgress,
  onEncodeProgress,
  onEncodingStart,
  shouldStop = () => false,
  name,
}) {
  if (!canvas) throw new Error('No canvas found on stage');
  const stem = stemOf(name);

  if (opts.format === 'png') {
    downloadBlob(await captureFrame(canvas), `${stem}-frame.png`);
    return;
  }

  const fps = opts.fps || 30;
  const plan = framePlan({
    commits: playback?.commits ?? 0,
    msPerCommit: playback?.msPerCommit ?? 1200,
    fps,
  });

  if (opts.format === 'gif') {
    const sink = gifSink(canvas, plan.frameMs);
    // gif.js holds every frame in memory as pixels before it encodes any of
    // them, so a long history is a video, not a gif.
    let frames = 0;
    const kept = await captureFrames({
      plan,
      sink,
      advanceTo,
      drawFrame,
      onProgress: onCaptureProgress,
      shouldStop: () => shouldStop() || frames++ >= GIF_MAX_FRAMES,
    });
    if (!kept) throw new Error('No frames captured');
    onEncodingStart?.('gif');
    downloadBlob(await sink.close(onEncodeProgress), `${stem}-history.gif`);
    onEncodeProgress?.(1);
    return;
  }

  const sink = await openVideo(canvas, { fps });
  try {
    const kept = await captureFrames({
      plan,
      sink,
      advanceTo,
      drawFrame,
      onProgress: onCaptureProgress,
      shouldStop,
    });
    if (!kept) throw new Error('No frames captured');
  } catch (err) {
    await sink.cancel();
    throw err;
  }

  onEncodingStart?.('webm');
  onEncodeProgress?.(0.5);
  downloadBlob(await sink.close(), `${stem}-history.webm`);
  onEncodeProgress?.(1);
}

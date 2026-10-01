/**
 * Where captured frames go: a WebM file built one frame at a time.
 *
 * WebCodecs rather than MediaRecorder, because a MediaRecorder stamps
 * frames with the wall clock and keeps whatever the page managed to draw.
 * Here each frame is handed over with the timestamp the plan gives it, so
 * the file plays at the rate it was asked for however slow the drawing was.
 */

import {
  BufferTarget,
  CanvasSource,
  canEncodeVideo,
  Output,
  Quality,
  WebMOutputFormat,
} from 'mediabunny';

/** Whether this browser can encode video at all. */
export function canEncode() {
  return typeof VideoEncoder !== 'undefined';
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ fps: number, bitrate?: number }} options
 */
export async function openVideo(canvas, { fps, bitrate = 16_000_000 }) {
  const codec = (await canEncodeVideo('vp9')) ? 'vp9' : 'vp8';
  const output = new Output({ format: new WebMOutputFormat(), target: new BufferTarget() });
  const source = new CanvasSource(canvas, {
    codec,
    quality: new Quality({ bitrate }),
    // A frame every two seconds is the default; a timeline export is
    // scrubbed more than it is streamed.
    keyFrameInterval: 1,
  });
  output.addVideoTrack(source, { frameRate: fps });
  await output.start();

  return {
    /**
     * @param {number} timestamp seconds
     * @param {number} duration seconds
     */
    add: (timestamp, duration) => source.add(timestamp, duration),

    async close() {
      await output.finalize();
      return new Blob([output.target.buffer], { type: 'video/webm' });
    },

    cancel: () => output.cancel(),
  };
}

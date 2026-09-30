import { useEffect, useState } from 'react';
import { createFrameRate } from './frameRate.js';

/**
 * The page's frame rate, for the counter in the header.
 *
 * Measured on its own animation frame rather than inside a visualizer: they
 * all share the one frame loop the browser runs, so a canvas that is
 * struggling slows this too, and the counter does not have to be threaded
 * through five components to find out.
 */
export function useFrameRate() {
  const [fps, setFps] = useState(null);

  useEffect(() => {
    const meter = createFrameRate();
    let raf = requestAnimationFrame(function tick(now) {
      const next = meter.frame(now);
      if (next !== null) setFps(next);
      raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  return fps;
}

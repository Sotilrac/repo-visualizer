import { useEffect, useRef } from 'react';
import { createStage } from './pixi/stage.js';
import { styleFor } from './pixi/styles.js';
import { useGraphEngine } from './useGraphEngine.js';

/**
 * The graph, drawn on the GPU.
 *
 * One renderer for every look: what used to be four files drawing the same
 * scene four ways is a style descriptor and a bloom pass now.
 */
export default function PixiVisualizer(props) {
  const hostRef = useRef(null);
  const rendererRef = useRef(null);

  // Mount-only: the renderer outlives every prop, and the frame loop reads
  // what it needs through the engine.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see above
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let made = null;
    let dropped = false;

    createStage(host, { background: styleFor(props.style).background })
      .then((stage) => {
        if (dropped) {
          stage.destroy();
          return;
        }
        made = stage;
        rendererRef.current = stage;
        stage.resize(host.clientWidth, host.clientHeight);
      })
      .catch((error) => {
        props.onInitFailed?.(error);
      });

    return () => {
      dropped = true;
      rendererRef.current = null;
      made?.destroy();
    };
  }, []);

  useGraphEngine({ hostRef, rendererRef, ...props });

  return <div ref={hostRef} style={{ width: '100%', height: '100%' }} />;
}

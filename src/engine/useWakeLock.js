import { useEffect } from 'react';
import { createWakeLock } from './wakeLock.js';

/**
 * Hold the screen awake for as long as `active`.
 *
 * @param {boolean} active
 */
export function useWakeLock(active) {
  useEffect(() => {
    if (!active) return;
    const lock = createWakeLock();
    lock.hold();

    const onVisible = () => {
      if (!document.hidden) lock.regain();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      lock.release();
    };
  }, [active]);
}

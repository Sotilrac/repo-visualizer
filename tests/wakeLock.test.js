import { describe, expect, it, vi } from 'vitest';
import { createWakeLock } from '../src/engine/wakeLock.js';

/** A navigator that hands out locks, and a way to drop one the way a browser does. */
function fakeNavigator() {
  const handed = [];
  const nav = {
    wakeLock: {
      request: vi.fn(async (type) => {
        const listeners = new Set();
        const lock = {
          type,
          released: false,
          release: vi.fn(async () => {
            lock.released = true;
          }),
          addEventListener: (_event, fn) => listeners.add(fn),
          drop: () => {
            lock.released = true;
            for (const fn of listeners) fn();
          },
        };
        handed.push(lock);
        return lock;
      }),
    },
  };
  return { nav, handed };
}

describe('keeping the screen awake', () => {
  it('asks for a screen lock', async () => {
    const { nav, handed } = fakeNavigator();
    const lock = createWakeLock(nav);

    await lock.hold();

    expect(nav.wakeLock.request).toHaveBeenCalledWith('screen');
    expect(handed).toHaveLength(1);
    expect(lock.held()).toBe(true);
  });

  it('asks once, however many times it is told to hold', async () => {
    const { nav } = fakeNavigator();
    const lock = createWakeLock(nav);

    await lock.hold();
    await lock.hold();

    expect(nav.wakeLock.request).toHaveBeenCalledTimes(1);
  });

  it('gives it back', async () => {
    const { nav, handed } = fakeNavigator();
    const lock = createWakeLock(nav);
    await lock.hold();

    await lock.release();

    expect(handed[0].release).toHaveBeenCalled();
    expect(lock.held()).toBe(false);
  });

  // A browser drops the lock whenever the tab goes to the background, and
  // never hands it back by itself.
  it('takes it back after the tab was away', async () => {
    const { nav, handed } = fakeNavigator();
    const lock = createWakeLock(nav);
    await lock.hold();
    handed[0].drop();

    await lock.regain();

    expect(nav.wakeLock.request).toHaveBeenCalledTimes(2);
    expect(lock.held()).toBe(true);
  });

  it('stays let go of once it has been released', async () => {
    const { nav } = fakeNavigator();
    const lock = createWakeLock(nav);
    await lock.hold();
    await lock.release();

    await lock.regain();

    expect(nav.wakeLock.request).toHaveBeenCalledTimes(1);
  });

  it('carries on where the browser has no such thing', async () => {
    const lock = createWakeLock({});

    await expect(lock.hold()).resolves.toBe(false);
    expect(lock.held()).toBe(false);
  });

  it('carries on when the browser refuses, which a background tab does', async () => {
    const nav = { wakeLock: { request: () => Promise.reject(new Error('not allowed')) } };
    const lock = createWakeLock(nav);

    await expect(lock.hold()).resolves.toBe(false);
    expect(lock.held()).toBe(false);
  });
});

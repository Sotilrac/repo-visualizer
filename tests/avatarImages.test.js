// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAvatarImages } from '../src/engine/avatarImages.js';

/** Capture every Image the module creates, so a load can be resolved by hand. */
let created;

beforeEach(() => {
  created = [];
  vi.stubGlobal(
    'Image',
    class {
      constructor() {
        created.push(this);
      }
    },
  );
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => 'blob:tile'),
    revokeObjectURL: vi.fn(),
  });
});
afterEach(() => vi.unstubAllGlobals());

const actor = { key: 'ada@acme.com', name: 'Ada Lovelace' };

describe('createAvatarImages', () => {
  it('returns nothing on the first ask, while the image loads', () => {
    expect(createAvatarImages().get(actor)).toBeNull();
  });

  it('returns the image once it has loaded', () => {
    const images = createAvatarImages();
    images.get(actor);
    created[0].onload();

    expect(images.get(actor)).toBe(created[0]);
  });

  it('loads the actor own avatar rather than generating a tile', () => {
    createAvatarImages().get({ ...actor, avatar: 'data/avatars/ada.png' });

    expect(created[0].src).toBe('data/avatars/ada.png');
  });

  it('generates a tile when there is no file', () => {
    const images = createAvatarImages();
    images.get(actor);

    expect(created[0].src).toBe('blob:tile');
    expect(URL.createObjectURL).toHaveBeenCalled();
  });

  it('asks for an image once, not on every frame', () => {
    const images = createAvatarImages();
    images.get(actor);
    images.get(actor);
    images.get(actor);

    expect(created).toHaveLength(1);
  });

  it('keeps two actors apart', () => {
    const images = createAvatarImages();
    images.get(actor);
    images.get({ key: 'bo@acme.com', name: 'Bo' });

    expect(created).toHaveLength(2);
  });

  it('retries after a failed load rather than giving up for good', () => {
    const images = createAvatarImages();
    const withAvatar = { ...actor, avatar: 'data/avatars/gone.png' };
    images.get(withAvatar);
    created[0].onerror();

    images.get(withAvatar);

    expect(created).toHaveLength(2);
  });
});

import { describe, expect, it } from 'vitest';
import { toBrowseUrl } from '../src/shared/remoteUrl.js';

describe('toBrowseUrl', () => {
  it.each([
    ['git@github.com:Sotilrac/repo-visualizer.git', 'https://github.com/Sotilrac/repo-visualizer'],
    ['https://github.com/ziteh/as5047p-driver.git', 'https://github.com/ziteh/as5047p-driver'],
    ['https://github.com/ziteh/as5047p-driver', 'https://github.com/ziteh/as5047p-driver'],
    ['ssh://git@gitlab.com/acme/sub/thing.git', 'https://gitlab.com/acme/sub/thing'],
    ['git@bitbucket.org:team/repo.git', 'https://bitbucket.org/team/repo'],
    ['https://git.code.sf.net/p/openocd/code', 'https://git.code.sf.net/p/openocd/code'],
  ])('turns %s into %s', (remote, expected) => {
    expect(toBrowseUrl(remote)).toBe(expected);
  });

  it.each([
    ['', 'an empty string'],
    [null, 'null'],
    [undefined, 'undefined'],
    ['/srv/mirrors/thing.git', 'a local path'],
    ['../sibling-repo', 'a relative path'],
    ['file:///srv/thing.git', 'a file URL'],
    ['git@github.com:no-slash-here', 'a path with no owner'],
  ])('returns null for %s (%s)', (remote) => {
    expect(toBrowseUrl(remote)).toBeNull();
  });

  it('drops credentials embedded in the URL', () => {
    expect(toBrowseUrl('https://user:token@github.com/acme/thing.git')).toBe(
      'https://github.com/acme/thing',
    );
  });

  it('drops a port', () => {
    expect(toBrowseUrl('ssh://git@example.com:2222/acme/thing.git')).toBe(
      'https://example.com/acme/thing',
    );
  });
});

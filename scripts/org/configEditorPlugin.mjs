/**
 * Serves the config editor during `vite dev`.
 *
 * A browser page cannot read or write a file outside the served directory,
 * and the config lives outside this repository, so the dev server brokers it. Node also does the gravatar fetching, which keeps the
 * request off the page and avoids CORS.
 *
 * Dev only, by construction: a built bundle has no server behind it, which is
 * the right shape for a tool that edits a local file.
 */

import { createReadStream, existsSync } from 'node:fs';
import path from 'node:path';
import { createConfigApi } from './configApi.mjs';

const TYPES = {
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

/** @param {{ configPath?: string }} [options] */
export function configEditorPlugin({ configPath = process.env.REPO_VIZ_CONFIG } = {}) {
  return {
    name: 'repo-visualizer-config-editor',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = (req.url ?? '').split('?')[0];
        if (!url.startsWith('/api/config') && !url.startsWith('/avatars/')) return next();

        if (!configPath) {
          return send(res, 503, {
            error: 'No config path. Set REPO_VIZ_CONFIG, or run `make edit CONFIG=<path>`.',
          });
        }

        const api = createConfigApi({ configPath });

        try {
          if (url.startsWith('/avatars/')) {
            const file = path.join(path.dirname(configPath), 'avatars', path.basename(url));
            if (!existsSync(file)) return send(res, 404, { error: 'No such avatar' });
            res.setHeader('content-type', TYPES[path.extname(file)] ?? 'application/octet-stream');
            res.setHeader('cache-control', 'no-store');
            return createReadStream(file).pipe(res);
          }

          if (req.method === 'GET') return send(res, 200, await api.read());

          const body = await readBody(req);
          if (url === '/api/config/edits') return send(res, 200, await api.edit(body.edits ?? []));
          if (url === '/api/config/avatar') return send(res, 200, await api.setAvatar(body));
          if (url === '/api/config/avatars') return send(res, 200, await api.fillAvatars(body));
          return send(res, 404, { error: `Unknown endpoint ${url}` });
        } catch (err) {
          return send(res, 400, { error: err instanceof Error ? err.message : String(err) });
        }
      });
    },
  };
}

/**
 * Load a dataset: the multi-repo one if the org analyzer has run, the
 * single-repo one if only `analyze` has, the bundled demo if neither.
 */

import { useEffect, useState } from 'react';
import { bundledDemo } from '../data/bundledDemo.js';
import { expandDataset, shardsForWindow } from './expandDataset.js';

function normalizeExcludeList(value) {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .filter((v) => typeof v === 'string')
        .map((v) => v.trim().replace(/\\/g, '/').replace(/^\.\//, ''))
        .filter(Boolean),
    ),
  ];
}

async function loadConfigExclude() {
  try {
    const r = await fetch('/repovisualizer.config.json');
    if (!r.ok) return [];
    const data = await r.json();
    return normalizeExcludeList(data?.exclude);
  } catch {
    return [];
  }
}

async function enrichDataset(raw) {
  let exclude = normalizeExcludeList(raw?.exclude);
  if (!exclude.length) {
    exclude = await loadConfigExclude();
  }
  return { ...raw, exclude };
}

/**
 * The sharded dataset, or null when the org analyzer has not run.
 *
 * The manifest names the shards, and only the years the window covers are
 * fetched. They come down in parallel; one that fails is left out rather
 * than failing the load, so a partial history still draws.
 */
async function loadSharded() {
  const response = await fetch('data/manifest.json');
  if (!response.ok) return null;

  const manifest = await response.json();
  const files = shardsForWindow(manifest.shards ?? [], manifest.window ?? {});

  const loaded = await Promise.all(
    files.map(async (file) => {
      try {
        const shard = await fetch(`data/${file}`);
        return shard.ok ? [file, await shard.json()] : null;
      } catch {
        return null;
      }
    }),
  );

  const shards = {};
  for (const entry of loaded) {
    if (!entry) continue;
    const year = Number(entry[0].match(/(\d{4})/)?.[1]);
    shards[year] = entry[1];
  }

  return expandDataset(manifest, shards);
}

export function useDataset() {
  const [dataset, setDataset] = useState(null);
  const [source, setSource] = useState('loading');
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setSource('loading');

    loadSharded()
      .then(async (sharded) => {
        if (sharded) return sharded;
        const single = await fetch('data/history.json');
        if (!single.ok) throw new Error('no analyzer output');
        return single.json();
      })
      .then((d) => enrichDataset(d))
      .then((d) => {
        if (cancelled) return;
        setDataset(d);
        setSource('analyzer');
        setError(null);
      })
      .catch(async (err) => {
        if (cancelled) return;
        const demo = await enrichDataset(bundledDemo);
        setDataset(demo);
        setSource('demo');
        setError(err.message);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { dataset, source, error, loading: source === 'loading' };
}

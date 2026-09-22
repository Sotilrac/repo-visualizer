/**
 * What a repo will contribute to the graph at the chosen level of detail.
 *
 * Drawn from the counts the scan recorded. When the analyzer can produce a
 * per-repo graph this becomes a miniature of the real thing. Until then it
 * shows the shape and the counts, which is what the decision turns on.
 */

const LEVELS = {
  0: { label: 'hidden', bodies: () => 0 },
  1: { label: 'one bubble', bodies: () => 1 },
  2: { label: 'folders', bodies: (repo) => repo.folders ?? estimateFolders(repo) },
  3: { label: 'files', bodies: (repo) => repo.files ?? 0 },
};

/**
 * For a config written before the scan counted folders. A square root of the
 * file count is a poor guess: it put Talaria at 33 folders when it has 254.
 */
function estimateFolders(repo) {
  const files = repo.files ?? 0;
  if (files === 0) return 0;
  return Math.max(1, Math.round(Math.sqrt(files)));
}

export default function LodPreview({ repo, lod }) {
  const level = LEVELS[lod] ?? LEVELS[1];
  const bodies = level.bodies(repo);
  const radius = 26;

  if (lod === 0) {
    return (
      <div className="lod-preview lod-preview--hidden">
        <span>not drawn</span>
      </div>
    );
  }

  const dots = Math.min(bodies, 48);
  const ring = Math.max(1, Math.ceil(dots / 12));

  return (
    <div className="lod-preview">
      <svg width="64" height="64" viewBox="0 0 64 64" role="img" aria-label={`${bodies} bodies`}>
        <circle cx="32" cy="32" r={radius} className="lod-repo" />
        {lod > 1 &&
          Array.from({ length: dots }, (_, i) => {
            const band = i % ring;
            const angle = (i / dots) * Math.PI * 2;
            const distance = radius * (0.45 + (band / ring) * 0.4);
            return (
              <circle
                // The dots are a decoration with no identity of their own;
                // the index is the only thing that distinguishes them.
                // biome-ignore lint/suspicious/noArrayIndexKey: see above
                key={i}
                cx={32 + Math.cos(angle) * distance}
                cy={32 + Math.sin(angle) * distance}
                r={lod === 2 ? 4 : 1.8}
                className={lod === 2 ? 'lod-folder' : 'lod-file'}
              />
            );
          })}
      </svg>
      <span className="lod-caption">
        {bodies.toLocaleString()} {lod === 2 ? 'folders' : lod === 3 ? 'files' : 'bubble'}
        {lod === 2 && repo.folders === undefined && <em> est.</em>}
      </span>
    </div>
  );
}

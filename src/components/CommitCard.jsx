import { useEffect, useState } from 'react';
import { initialsFor } from '../shared/avatarTile.js';

const CollapseIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    aria-hidden
  >
    <path d="M4 8h8M9 5l3 3-3 3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ExpandIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    aria-hidden
  >
    <path d="M12 8H4M7 5 4 8l3 3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default function CommitCard({
  commit,
  author = null,
  collapsed = false,
  commitIndex = -1,
  commitCount = 0,
  collapsible = false,
  onToggleCollapse = () => {},
}) {
  const [entering, setEntering] = useState(false);
  // commit.sha is a trigger, not an input: the enter animation has to replay
  // on every commit.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see above
  useEffect(() => {
    setEntering(true);
    const id = setTimeout(() => setEntering(false), 30);
    return () => clearTimeout(id);
  }, [commit?.sha]);

  if (collapsible && collapsed) {
    return (
      <button
        type="button"
        className="commit-card-tab"
        onClick={onToggleCollapse}
        title="Show commit details"
        aria-expanded="false"
      >
        <ExpandIcon />
        <span>Commit</span>
      </button>
    );
  }

  const collapseBtn = collapsible ? (
    <button
      type="button"
      className="commit-card-collapse"
      onClick={onToggleCollapse}
      title="Minimize commit panel"
      aria-label="Minimize commit panel"
      aria-expanded="true"
    >
      <CollapseIcon />
    </button>
  ) : null;

  // Nothing has been played yet. An empty card explaining that is one more
  // thing between the reader and the graph.
  if (!commit) return null;

  // The same person the graph draws: the config's name and avatar where
  // there is one, the commit's own author where there is not.
  const name = author?.name ?? commit.author;
  const initials = initialsFor(name || '?');
  // A dataset written before these were derived, or one hand-made, has no
  // stats. A missing count is not worth taking the whole page down for.
  const stats = commit.stats ?? { filesChanged: 0, insertions: 0, deletions: 0 };
  const changes = commit.changes ?? [];
  const hue = author?.hue;

  return (
    <div className={`commit-card ${entering ? 'entering' : ''}`}>
      {collapseBtn}
      <div className="commit-head">
        <span className="commit-sha">{commit.shortSha}</span>
        {commitCount > 0 && (
          <span className="commit-position" aria-live="polite">
            {String(commitIndex + 1).padStart(2, '0')}
            <span className="commit-position-dim"> / {commitCount}</span>
          </span>
        )}
      </div>
      <div className="commit-byline">
        {author?.avatar ? (
          <img className="avatar avatar-image" src={author.avatar} alt="" width="22" height="22" />
        ) : (
          <span
            className="avatar"
            style={hue === undefined ? undefined : { background: `hsl(${hue} 52% 42%)` }}
          >
            {initials}
          </span>
        )}
        <span>{name}</span>
        <span style={{ color: 'var(--fg-dim)' }}>·</span>
        <span>
          {new Date(commit.date).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </span>
      </div>
      <div className="commit-message">{commit.message}</div>
      <div className="stats">
        <span>
          {stats.filesChanged} file{stats.filesChanged === 1 ? '' : 's'}
        </span>
        <span className="ins">+{stats.insertions}</span>
        <span className="del">−{stats.deletions}</span>
      </div>
      <div className="changes-list">
        {changes.slice(0, 8).map((c) => (
          <div className="change-row" key={c.path}>
            <span className={`status ${c.status || 'M'}`}>{c.status || 'M'}</span>
            <span className="path" title={c.path}>
              {c.path}
            </span>
          </div>
        ))}
        {changes.length > 8 && (
          <div style={{ color: 'var(--fg-dim)', paddingTop: 4 }}>+ {changes.length - 8} more…</div>
        )}
      </div>
    </div>
  );
}

import { useState } from 'react';

/** @import { FC } from 'react' */
/** @typedef {{ name: string, remote: string | null }} Repo */

/**
 * The repositories this dataset was built from. One renders inline; several
 * collapse behind a count so the header stays one line at any repo count.
 *
 * @param {{ repos?: Repo[] }} props
 */
export default function RepoList({ repos = [] }) {
  const [open, setOpen] = useState(false);

  if (repos.length === 0) return null;
  if (repos.length === 1) return <RepoLink repo={repos[0]} />;

  return (
    <span className={`repo-list${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="repo-list-toggle"
        aria-expanded={open}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        {repos.length} repos
      </button>
      {open && (
        <span className="repo-list-items">
          {repos.map((repo) => (
            <RepoLink key={repo.name} repo={repo} />
          ))}
        </span>
      )}
    </span>
  );
}

/** @type {FC<{ repo: Repo }>} */
const RepoLink = ({ repo }) => {
  if (!repo.remote) return <span className="repo-list-item">{repo.name}</span>;
  return (
    <a
      className="repo-list-item"
      href={repo.remote}
      target="_blank"
      rel="noopener noreferrer"
      title={repo.remote}
    >
      {repo.name}
    </a>
  );
};

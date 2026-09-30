import LodPreview from './LodPreview.jsx';
import { SortableHeader } from './SortableHeader.jsx';
import { useSortable } from './useSortable.js';

const LEVELS = [
  { value: 0, label: '0 hidden' },
  { value: 1, label: '1 bubble' },
  { value: 2, label: '2 folders' },
  { value: 3, label: '3 files' },
];

export default function ReposTable({ repos, query, onEdit }) {
  const needle = query.trim().toLowerCase();
  const filtered = needle
    ? repos.filter((r) => `${r.name} ${r.project ?? ''}`.toLowerCase().includes(needle))
    : repos;
  const {
    rows,
    sort,
    toggle: sortBy,
  } = useSortable(filtered, { key: 'commits', direction: 'desc' });

  return (
    <table className="editor-table">
      <thead>
        <tr>
          <SortableHeader label="Repo" sortKey="name" sort={sort} onSort={sortBy} />
          <SortableHeader label="Level of detail" sortKey="lod" sort={sort} onSort={sortBy} />
          <th scope="col">Preview</th>
          <SortableHeader
            label="Commits"
            sortKey="commits"
            sort={sort}
            onSort={sortBy}
            className="editor-number"
          />
          <SortableHeader
            label="Files"
            sortKey="files"
            sort={sort}
            onSort={sortBy}
            className="editor-number"
          />
          <th scope="col">Branch</th>
          <SortableHeader label="Active" sortKey="last" sort={sort} onSort={sortBy} />
        </tr>
      </thead>
      <tbody>
        {rows.map((repo) => {
          const lod = repo.lod ?? 1;
          return (
            <tr key={repo.name} className={lod === 0 ? 'is-hidden-repo' : undefined}>
              <td>
                {repo.remote ? (
                  <a href={repo.remote} target="_blank" rel="noopener noreferrer">
                    {repo.name}
                  </a>
                ) : (
                  repo.name
                )}
                {repo.project && <span className="editor-id">{repo.project}</span>}
              </td>
              <td>
                {/* biome-ignore lint/a11y/useSemanticElements: a labelled group of buttons; fieldset would bring form semantics and default styling */}
                <div
                  className="editor-lod"
                  role="group"
                  aria-label={`Level of detail for ${repo.name}`}
                >
                  {LEVELS.map((level) => (
                    <button
                      key={level.value}
                      type="button"
                      className={`editor-lod-btn${lod === level.value ? ' is-active' : ''}`}
                      aria-pressed={lod === level.value}
                      onClick={() =>
                        onEdit({
                          section: 'repos',
                          id: repo.name,
                          field: 'lod',
                          value: level.value,
                        })
                      }
                    >
                      {level.label}
                    </button>
                  ))}
                </div>
              </td>
              <td>
                <LodPreview repo={repo} lod={lod} />
              </td>
              <td className="editor-number">{(repo.commits ?? 0).toLocaleString()}</td>
              <td className="editor-number">{(repo.files ?? 0).toLocaleString()}</td>
              <td>
                <input
                  className="editor-branch"
                  type="text"
                  value={repo.branch ?? ''}
                  placeholder="default"
                  title="The branch to read this repo's history from, when it is not the default one"
                  onChange={(ev) =>
                    onEdit({
                      section: 'repos',
                      id: repo.name,
                      field: 'branch',
                      value: ev.target.value.trim() || null,
                    })
                  }
                />
              </td>
              <td className="editor-dates">
                {repo.first ?? '—'} → {repo.last ?? '—'}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

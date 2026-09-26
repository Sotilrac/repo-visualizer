import { useState } from 'react';
import { SortableHeader } from './SortableHeader.jsx';
import { useSortable } from './useSortable.js';

/**
 * The spellings this person commits under, other than the one on show.
 *
 * After a merge the row keeps the first person's name, so the other name
 * vanishes from view and someone looking for it decides the person is gone.
 *
 * @param {{ name: string, names?: string[] }} person
 */
function otherNames(person) {
  return (person.names ?? []).filter((name) => name !== person.name);
}

/**
 * A tile is redrawn in place when someone is renamed, so its path does not
 * change and the browser would go on showing the one it cached. The version
 * moves on every write and is what makes the new one appear.
 *
 * @param {string | undefined} avatar
 * @param {number} version
 */
function avatarSrc(avatar, version) {
  if (!avatar?.startsWith('file:')) return null;
  return `/${avatar.slice('file:'.length)}?v=${version}`;
}

export default function PeopleTable({ people, teams, merge, query, version, onEdit, onAvatar }) {
  const [selected, setSelected] = useState([]);
  const needle = query.trim().toLowerCase();
  const filtered = needle
    ? people.filter((p) =>
        [p.id, p.name, p.team ?? '', ...(p.names ?? []), ...(p.emails ?? [])]
          .join(' ')
          .toLowerCase()
          .includes(needle),
      )
    : people;
  const {
    rows,
    sort,
    toggle: sortBy,
  } = useSortable(filtered, { key: 'commits', direction: 'desc' });

  const toggle = (id) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <>
      {selected.length > 1 && (
        <div className="editor-bar">
          <span>
            Merge {selected.length} rows into <strong>{selected[0]}</strong>
          </span>
          <button
            type="button"
            onClick={() => {
              onEdit({ section: 'merge', op: 'add', group: selected });
              setSelected([]);
            }}
          >
            Merge
          </button>
          <button type="button" onClick={() => setSelected([])}>
            Cancel
          </button>
        </div>
      )}

      <table className="editor-table">
        <thead>
          <tr>
            <th scope="col" className="editor-pick" />
            <th scope="col">Avatar</th>
            <SortableHeader label="Name" sortKey="name" sort={sort} onSort={sortBy} />
            <SortableHeader label="Team" sortKey="team" sort={sort} onSort={sortBy} />
            <SortableHeader
              label="Commits"
              sortKey="commits"
              sort={sort}
              onSort={sortBy}
              className="editor-number"
            />
            <th scope="col">Addresses</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((person) => {
            const src = avatarSrc(person.avatar, version);
            return (
              <tr
                key={person.id}
                className={selected.includes(person.id) ? 'is-picked' : undefined}
              >
                <td className="editor-pick">
                  <input
                    type="checkbox"
                    aria-label={`Select ${person.name} for merging`}
                    checked={selected.includes(person.id)}
                    onChange={() => toggle(person.id)}
                  />
                </td>
                <td>
                  <div className="editor-avatar-cell">
                    {src ? (
                      <img className="editor-avatar" src={src} alt="" width="32" height="32" />
                    ) : (
                      <span className="editor-avatar editor-avatar--empty" aria-hidden="true" />
                    )}
                    <span className="editor-avatar-actions">
                      <button
                        type="button"
                        title="Fetch the face on their GitHub account"
                        onClick={() => onAvatar({ id: person.id, source: 'github' })}
                      >
                        github
                      </button>
                      <button
                        type="button"
                        title="Fetch from gravatar"
                        onClick={() => onAvatar({ id: person.id, source: 'gravatar' })}
                      >
                        gravatar
                      </button>
                      <button
                        type="button"
                        title="Generate an initials tile"
                        onClick={() => onAvatar({ id: person.id, source: 'initials' })}
                      >
                        initials
                      </button>
                      {person.avatar && (
                        <button
                          type="button"
                          title="Remove the avatar"
                          onClick={() => onAvatar({ id: person.id, source: 'none' })}
                        >
                          clear
                        </button>
                      )}
                    </span>
                  </div>
                </td>
                <td>
                  <input
                    className="editor-text"
                    aria-label={`Name for ${person.id}`}
                    defaultValue={person.name}
                    onBlur={(e) => {
                      if (e.target.value !== person.name) {
                        onEdit({
                          section: 'people',
                          id: person.id,
                          field: 'name',
                          value: e.target.value,
                        });
                      }
                    }}
                  />
                  <span className="editor-id">{person.id}</span>
                  {otherNames(person).length > 0 && (
                    <span
                      className="editor-aka"
                      title={`Also commits as ${otherNames(person).join(', ')}`}
                    >
                      aka {otherNames(person).join(' · ')}
                    </span>
                  )}
                </td>
                <td>
                  <select
                    aria-label={`Team for ${person.name}`}
                    value={person.team ?? ''}
                    onChange={(e) =>
                      onEdit({
                        section: 'people',
                        id: person.id,
                        field: 'team',
                        value: e.target.value || null,
                      })
                    }
                  >
                    <option value="">unassigned</option>
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                        {team.shown === false ? ' (hidden)' : ''}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="editor-number">{person.commits}</td>
                <td className="editor-emails">{(person.emails ?? []).join(' · ')}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {merge.length > 0 && (
        <section className="editor-merges">
          <h2>Merged</h2>
          <ul>
            {merge.map((group) => (
              <li key={group.join('+')}>
                <code>{group.join(' ← ')}</code>
                <button
                  type="button"
                  onClick={() => onEdit({ section: 'merge', op: 'remove', group })}
                >
                  undo
                </button>
              </li>
            ))}
          </ul>
          <p className="editor-note">
            Undoing a group leaves the merged row as it is; a re-scan splits it again.
          </p>
        </section>
      )}
    </>
  );
}

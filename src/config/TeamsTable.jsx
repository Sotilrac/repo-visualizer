/**
 * Teams: who people work for, and whether their work is drawn.
 *
 * A team owns email domains, which is how the scan proposes a team for
 * someone it has not seen before. Hiding a team is how bots stay out of the
 * visualization without anyone having to mark each account.
 */

const HUE_PRESETS = [0, 28, 60, 140, 190, 210, 260, 300];

export default function TeamsTable({ teams, people, onEdit }) {
  const headcount = (id) => people.filter((p) => p.team === id).length;
  const commits = (id) =>
    people.filter((p) => p.team === id).reduce((total, p) => total + (p.commits ?? 0), 0);

  return (
    <table className="editor-table">
      <thead>
        <tr>
          <th scope="col">Team</th>
          <th scope="col">Shown</th>
          <th scope="col">As one</th>
          <th scope="col">Colour</th>
          <th scope="col">Domains</th>
          <th scope="col" className="editor-number">
            People
          </th>
          <th scope="col" className="editor-number">
            Commits
          </th>
        </tr>
      </thead>
      <tbody>
        {teams.map((team) => (
          <tr key={team.id} className={team.shown === false ? 'is-hidden-repo' : undefined}>
            <td>
              <input
                className="editor-text"
                aria-label={`Name for ${team.id}`}
                defaultValue={team.name ?? team.id}
                onBlur={(e) => {
                  if (e.target.value !== team.name) {
                    onEdit({
                      section: 'teams',
                      id: team.id,
                      field: 'name',
                      value: e.target.value,
                    });
                  }
                }}
              />
              <span className="editor-id">{team.id}</span>
            </td>
            <td>
              <label className="editor-switch">
                <input
                  type="checkbox"
                  checked={team.shown !== false}
                  onChange={(e) =>
                    onEdit({
                      section: 'teams',
                      id: team.id,
                      field: 'shown',
                      value: e.target.checked,
                    })
                  }
                />
                <span>{team.shown === false ? 'hidden' : 'shown'}</span>
              </label>
            </td>
            <td>
              <label
                className="editor-switch"
                title="Draw everyone on this team as one avatar, instead of one each"
              >
                <input
                  type="checkbox"
                  checked={team.merged === true}
                  onChange={(e) =>
                    onEdit({
                      section: 'teams',
                      id: team.id,
                      field: 'merged',
                      value: e.target.checked,
                    })
                  }
                />
                <span>{team.merged === true ? 'one avatar' : 'each'}</span>
              </label>
            </td>
            <td>
              <div className="editor-hues">
                {HUE_PRESETS.map((hue) => (
                  <button
                    key={hue}
                    type="button"
                    className={`editor-hue${team.hue === hue ? ' is-active' : ''}`}
                    style={{ background: `hsl(${hue} 52% 48%)` }}
                    aria-label={`Hue ${hue} for ${team.name ?? team.id}`}
                    aria-pressed={team.hue === hue}
                    onClick={() =>
                      onEdit({ section: 'teams', id: team.id, field: 'hue', value: hue })
                    }
                  />
                ))}
              </div>
            </td>
            <td>
              <input
                className="editor-text editor-text--wide"
                aria-label={`Domains for ${team.name ?? team.id}`}
                placeholder="acme.com, acme.co.uk"
                defaultValue={(team.domains ?? []).join(', ')}
                onBlur={(e) => {
                  const domains = e.target.value
                    .split(',')
                    .map((d) => d.trim())
                    .filter(Boolean);
                  if (domains.join(',') !== (team.domains ?? []).join(',')) {
                    onEdit({ section: 'teams', id: team.id, field: 'domains', value: domains });
                  }
                }}
              />
            </td>
            <td className="editor-number">{headcount(team.id)}</td>
            <td className="editor-number">{commits(team.id).toLocaleString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

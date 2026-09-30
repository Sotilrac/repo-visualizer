/**
 * Turn the config's people into something the page can load.
 *
 * The app resolves a commit's author address to a person, and draws that
 * person's name, avatar and team colour. It cannot read the config itself:
 * the config lives outside this repository and a built bundle has no server
 * behind it. So the export writes a small payload next to the dataset, and
 * copies the avatars in with it.
 *
 * A hidden team's addresses are still written down, pointing at a person
 * that is not there. That is the difference between an address the config
 * hides and one it has never seen: the first resolves to nobody and is not
 * drawn, the second falls back to the raw git author so a new contributor
 * is never silently absent. Leaving the addresses out entirely made every
 * hidden person reappear as a stranger.
 */

/**
 * @param {{ teams?: any[], people?: any[] }} config
 * @returns {{
 *   byEmail: Record<string, string>,
 *   people: Record<string, { name: string, hue?: number, avatar?: string, team?: string }>,
 *   avatarFiles: string[],
 * }}
 */
export function buildPeoplePayload(config) {
  const teams = new Map((config.teams ?? []).map((team) => [team.id, team]));
  /** @type {Record<string, string>} */
  const byEmail = {};
  /** @type {Record<string, any>} */
  const people = {};
  /** @type {string[]} */
  const avatarFiles = [];

  for (const person of config.people ?? []) {
    const team = teams.get(person.team);

    // Hidden wins over everything: the addresses are recorded so they
    // resolve to nobody, and no person is written for them.
    if (team?.shown === false) {
      for (const email of person.emails ?? []) {
        byEmail[String(email).trim().toLowerCase()] = person.id;
      }
      continue;
    }

    // A team drawn as one person: everyone on it resolves to a single
    // actor, so a crowd of one-commit strangers is one face on the graph
    // rather than forty.
    if (team?.merged) {
      const id = `team:${team.id}`;
      if (!people[id]) {
        people[id] = { name: team.name ?? team.id, team: team.id };
        if (team.hue !== undefined) people[id].hue = team.hue;
        if (typeof team.avatar === 'string' && team.avatar.startsWith('file:')) {
          const file = team.avatar.slice('file:'.length);
          avatarFiles.push(file);
          people[id].avatar = `data/${file}`;
        }
      }
      for (const email of person.emails ?? []) {
        byEmail[String(email).trim().toLowerCase()] = id;
      }
      continue;
    }

    const entry = { name: person.name ?? person.id };
    if (team?.hue !== undefined) entry.hue = team.hue;
    if (person.team) entry.team = person.team;

    if (typeof person.avatar === 'string' && person.avatar.startsWith('file:')) {
      const file = person.avatar.slice('file:'.length);
      avatarFiles.push(file);
      entry.avatar = `data/${file}`;
    }

    people[person.id] = entry;
    for (const email of person.emails ?? []) {
      byEmail[String(email).trim().toLowerCase()] = person.id;
    }
  }

  return { byEmail, people, avatarFiles };
}

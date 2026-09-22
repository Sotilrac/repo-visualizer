/**
 * Turn the config's people into something the page can load.
 *
 * The app resolves a commit's author address to a person, and draws that
 * person's name, avatar and team colour. It cannot read the config itself:
 * the config lives outside this repository and a built bundle has no server
 * behind it. So the export writes a small payload next to the dataset, and
 * copies the avatars in with it.
 *
 * People on a hidden team are left out entirely, which is how bots stay off
 * the graph.
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
    if (team?.shown === false) continue;

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

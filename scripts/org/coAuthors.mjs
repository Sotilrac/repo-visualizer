/**
 * The other people on a commit.
 *
 * A pull request squashed into one commit has one git author and names the
 * rest in the message, as trailers GitHub writes:
 *
 *   Co-authored-by: Ada Lovelace <ada@example.com>
 *
 * Without reading those, half of the work done in pairs is filed under
 * whoever pressed the button.
 */

const TRAILER = /^\s*co-authored-by:\s*(.*)$/i;
const PERSON = /^\s*(.*?)\s*<([^>]+)>\s*$/;

/**
 * `Ada Lovelace <ada@acme.com>` as a person, or null when there is no
 * address to match them by.
 *
 * @param {string} value
 * @returns {{ name: string, email: string } | null}
 */
export function personFrom(value) {
  const match = PERSON.exec(String(value ?? ''));
  if (!match) return null;

  const email = match[2].trim().toLowerCase();
  if (!email) return null;
  return { name: match[1].trim() || email, email };
}

/**
 * @param {string} message the whole commit message, subject and body
 * @returns {Array<{ name: string, email: string }>} in the order written,
 *   each person once
 */
export function coAuthorsIn(message) {
  /** @type {Map<string, { name: string, email: string }>} */
  const people = new Map();

  for (const line of String(message ?? '').split('\n')) {
    const match = TRAILER.exec(line);
    if (!match) continue;

    const person = personFrom(match[1]);
    if (!person || people.has(person.email)) continue;
    people.set(person.email, person);
  }

  return [...people.values()];
}

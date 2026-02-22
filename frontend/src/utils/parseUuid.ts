const UUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/**
 * Extracts all UUIDs from a string.
 * Returns lowercase, deduplicated UUIDs in insertion order.
 *
 * @param text - The text to parse for UUIDs
 * @returns Array of unique lowercase UUID strings
 */
export function parseUuids(text: string): string[] {
  if (!text || typeof text !== 'string') {
    return [];
  }

  const matches = text.match(UUID_REGEX);
  if (!matches) {
    return [];
  }

  const seen = new Set<string>();
  const result: string[] = [];

  for (const match of matches) {
    const lower = match.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      result.push(lower);
    }
  }

  return result;
}

/**
 * Returns the first UUID found in the text, in lowercase.
 * Returns null if no UUID is found or input is invalid.
 *
 * @param text - The text to parse for a UUID
 * @returns The first UUID as a lowercase string, or null
 */
export function parseFirstUuid(text: string): string | null {
  if (!text || typeof text !== 'string') {
    return null;
  }

  const uuids = parseUuids(text);
  return uuids.length > 0 ? uuids[0] : null;
}

const UUID_REGEX = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

/** Extracts every UUID from text as lowercase, deduplicated values in first-seen order. */
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

/** Returns the first UUID in text as lowercase, or null when there is none. */
export function parseFirstUuid(text: string): string | null {
  if (!text || typeof text !== 'string') {
    return null;
  }

  const uuids = parseUuids(text);
  return uuids.length > 0 ? uuids[0] : null;
}

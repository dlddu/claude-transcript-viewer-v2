/** Shortens a Unix or Windows file path to its last segment, prefixed with "..." when directories were dropped. */
export function truncateFilePath(path: string): string {
  if (!path || typeof path !== 'string') {
    return path || '';
  }

  const parts = path.split(/[/\\]/);

  if (parts.length === 1) {
    return path;
  }

  const nonEmptyParts = parts.filter(p => p !== '');

  const endsWithSlash = path.endsWith('/') || path.endsWith('\\');

  if (nonEmptyParts.length <= 1) {
    const filename = nonEmptyParts[0] || '';
    return endsWithSlash ? `${filename}/` : filename;
  }

  const lastPart = parts[parts.length - 1];
  const filename = lastPart || parts[parts.length - 2];

  if (nonEmptyParts.length === 2) {
    return endsWithSlash ? `${filename}/` : filename;
  }

  return endsWithSlash ? `...${filename}/` : `...${filename}`;
}

/** Shortens a tool ID to its first characters followed by "...". */
export function truncateToolId(id: string, prefixLength: number = 8): string {
  if (!id || typeof id !== 'string') {
    return id || '';
  }

  if (id.length <= prefixLength) {
    return id;
  }

  return `${id.substring(0, prefixLength)}...`;
}

function isFilePath(value: string): boolean {
  return /^(\/|[A-Z]:\\|\.\.?\/)/.test(value) || (value.includes('/') || value.includes('\\'));
}

/** Deep-clones a value, shortening every string that looks like a file path. */
export function truncateFilePathsInObject(obj: unknown): unknown {
  if (typeof obj === 'string') {
    if (isFilePath(obj)) {
      return truncateFilePath(obj);
    }
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(item => truncateFilePathsInObject(item));
  }
  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = truncateFilePathsInObject(value);
    }
    return result;
  }
  return obj;
}

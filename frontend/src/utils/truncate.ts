/**
 * Truncates a file path to show only the filename with ellipsis prefix.
 * Handles both Unix and Windows paths.
 *
 * @param path - The file path to truncate
 * @returns Truncated path with "..." prefix for long paths, or the original path if short
 */
export function truncateFilePath(path: string): string {
  // Handle null, undefined, or empty string
  if (!path || typeof path !== 'string') {
    return path || '';
  }

  // Split by both Unix (/) and Windows (\) path separators
  const parts = path.split(/[/\\]/);

  // If only one part (filename only), return as is
  if (parts.length === 1) {
    return path;
  }

  // Filter out empty parts (e.g., from leading slash or trailing slash)
  const nonEmptyParts = parts.filter(p => p !== '');

  // If path ends with a slash, we need to preserve it
  const endsWithSlash = path.endsWith('/') || path.endsWith('\\');

  // If only one non-empty part or two parts (one is empty), return filename only
  if (nonEmptyParts.length <= 1) {
    const filename = nonEmptyParts[0] || '';
    return endsWithSlash ? `${filename}/` : filename;
  }

  // Get the last part (filename or directory name)
  const lastPart = parts[parts.length - 1];
  const filename = lastPart || parts[parts.length - 2]; // Handle trailing slash

  // For single directory paths like /home/file.txt, return just the filename
  if (nonEmptyParts.length === 2) {
    return endsWithSlash ? `${filename}/` : filename;
  }

  // For longer paths, add ellipsis
  return endsWithSlash ? `...${filename}/` : `...${filename}`;
}

/**
 * Truncates a tool ID to show only the first characters with ellipsis suffix.
 *
 * @param id - The tool ID to truncate
 * @param prefixLength - Number of characters to show before ellipsis (default: 8)
 * @returns Truncated ID with "..." suffix for long IDs, or the original ID if short
 */
export function truncateToolId(id: string, prefixLength: number = 8): string {
  // Handle null, undefined, or non-string input
  if (!id || typeof id !== 'string') {
    return id || '';
  }

  // If ID is shorter than or equal to cutoff length, return as is
  if (id.length <= prefixLength) {
    return id;
  }

  // Truncate to prefix length and add ellipsis
  return `${id.substring(0, prefixLength)}...`;
}

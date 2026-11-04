import { describe, it, expect } from 'vitest';
import { truncateFilePath, truncateToolId, truncateFilePathsInObject } from './truncate';

describe('truncateFilePath', () => {
  describe('happy path', () => {
    it('should truncate long file paths to show only filename with ellipsis', () => {
      const longPath = '/very/long/path/to/some/directory/docker_compose_e2e_test.go';

      const result = truncateFilePath(longPath);

      expect(result).toBe('...docker_compose_e2e_test.go');
    });

    it('should truncate Windows-style paths correctly', () => {
      const windowsPath = 'C:\\Users\\Developer\\Projects\\app\\src\\main\\java\\Application.java';

      const result = truncateFilePath(windowsPath);

      expect(result).toBe('...Application.java');
    });

    it('should handle paths with multiple levels', () => {
      const path = '/a/b/c/d/e/f/g/file.txt';

      const result = truncateFilePath(path);

      expect(result).toBe('...file.txt');
    });

    it('should handle relative paths', () => {
      const relativePath = '../../../config/database.json';

      const result = truncateFilePath(relativePath);

      expect(result).toBe('...database.json');
    });
  });

  describe('edge cases', () => {
    it('should not truncate short paths', () => {
      const shortPath = 'file.txt';

      const result = truncateFilePath(shortPath);

      expect(result).toBe('file.txt');
    });

    it('should handle paths with just one directory', () => {
      const singleDir = '/home/file.txt';

      const result = truncateFilePath(singleDir);

      expect(result).toBe('file.txt');
    });

    it('should handle filename only paths', () => {
      const filenameOnly = 'readme.md';

      const result = truncateFilePath(filenameOnly);

      expect(result).toBe('readme.md');
    });

    it('should handle paths ending with slash', () => {
      const pathWithSlash = '/very/long/path/to/directory/';

      const result = truncateFilePath(pathWithSlash);

      expect(result).toBe('...directory/');
    });

    it('should handle empty string', () => {
      const emptyPath = '';

      const result = truncateFilePath(emptyPath);

      expect(result).toBe('');
    });

    it('should handle path with spaces', () => {
      const pathWithSpaces = '/path/to/My Documents/test file.txt';

      const result = truncateFilePath(pathWithSpaces);

      expect(result).toBe('...test file.txt');
    });
  });

  describe('error handling', () => {
    it('should handle null input gracefully', () => {
      const nullInput = null as unknown as string;

      expect(() => truncateFilePath(nullInput)).not.toThrow();
    });

    it('should handle undefined input gracefully', () => {
      const undefinedInput = undefined as unknown as string;

      expect(() => truncateFilePath(undefinedInput)).not.toThrow();
    });
  });
});

describe('truncateToolId', () => {
  describe('happy path', () => {
    it('should truncate tool ID to first 8 characters with ellipsis', () => {
      const toolId = 'toolu_01PrABcDEfGHiJkLmNoPqRsT';

      const result = truncateToolId(toolId);

      expect(result).toBe('toolu_01...');
    });

    it('should handle standard Anthropic tool ID format', () => {
      const standardId = 'toolu_01234567890abcdef';

      const result = truncateToolId(standardId);

      expect(result).toBe('toolu_01...');
    });

    it('should truncate at correct position for Claude tool IDs', () => {
      const claudeId = 'toolu_01ABCDEFGHIJKLMNOP';

      const result = truncateToolId(claudeId);

      expect(result).toBe('toolu_01...');
    });
  });

  describe('edge cases', () => {
    it('should not truncate short tool IDs', () => {
      const shortId = 'tool-1';

      const result = truncateToolId(shortId);

      expect(result).toBe('tool-1');
    });

    it('should handle tool ID exactly at cutoff length', () => {
      const exactLengthId = 'toolu_01';

      const result = truncateToolId(exactLengthId);

      expect(result).toBe('toolu_01');
    });

    it('should handle tool ID one character over cutoff', () => {
      const oneOverId = 'toolu_01P';

      const result = truncateToolId(oneOverId);

      expect(result).toBe('toolu_01...');
    });

    it('should handle empty string', () => {
      const emptyId = '';

      const result = truncateToolId(emptyId);

      expect(result).toBe('');
    });

    it('should handle very long tool IDs', () => {
      const veryLongId = 'toolu_' + 'a'.repeat(100);

      const result = truncateToolId(veryLongId);

      expect(result).toBe('toolu_aa...');
      expect(result.length).toBeLessThan(15);
    });
  });

  describe('error handling', () => {
    it('should handle null input gracefully', () => {
      const nullInput = null as unknown as string;

      expect(() => truncateToolId(nullInput)).not.toThrow();
    });

    it('should handle undefined input gracefully', () => {
      const undefinedInput = undefined as unknown as string;

      expect(() => truncateToolId(undefinedInput)).not.toThrow();
    });

    it('should handle non-string input gracefully', () => {
      const numberInput = 12345 as unknown as string;

      expect(() => truncateToolId(numberInput)).not.toThrow();
    });
  });
});

describe('truncateFilePathsInObject', () => {
  it('should truncate file path values in a flat object', () => {
    const input = { file_path: '/very/long/path/to/file.csv' };
    const result = truncateFilePathsInObject(input);
    expect(result).toEqual({ file_path: '...file.csv' });
  });

  it('should not truncate non-path string values', () => {
    const input = { format: 'csv', name: 'test' };
    const result = truncateFilePathsInObject(input);
    expect(result).toEqual({ format: 'csv', name: 'test' });
  });

  it('should handle nested objects', () => {
    const input = { options: { output: '/a/b/c/result.json' } };
    const result = truncateFilePathsInObject(input);
    expect(result).toEqual({ options: { output: '...result.json' } });
  });

  it('should handle arrays', () => {
    const input = { files: ['/a/b/c/one.txt', '/a/b/c/two.txt'] };
    const result = truncateFilePathsInObject(input);
    expect(result).toEqual({ files: ['...one.txt', '...two.txt'] });
  });

  it('should handle null and primitive values', () => {
    const input = { count: 42, enabled: true, data: null };
    const result = truncateFilePathsInObject(input);
    expect(result).toEqual({ count: 42, enabled: true, data: null });
  });

  it('should not truncate short paths', () => {
    const input = { file: 'readme.md' };
    const result = truncateFilePathsInObject(input);
    expect(result).toEqual({ file: 'readme.md' });
  });
});

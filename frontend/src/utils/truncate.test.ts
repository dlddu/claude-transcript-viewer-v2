import { describe, it, expect } from 'vitest';
import { truncateFilePath, truncateToolId } from './truncate';

describe('truncateFilePath', () => {
  describe('happy path', () => {
    it('should truncate long file paths to show only filename with ellipsis', () => {
      // Arrange
      const longPath = '/very/long/path/to/some/directory/docker_compose_e2e_test.go';

      // Act
      const result = truncateFilePath(longPath);

      // Assert
      expect(result).toBe('...docker_compose_e2e_test.go');
    });

    it('should truncate Windows-style paths correctly', () => {
      // Arrange
      const windowsPath = 'C:\\Users\\Developer\\Projects\\app\\src\\main\\java\\Application.java';

      // Act
      const result = truncateFilePath(windowsPath);

      // Assert
      expect(result).toBe('...Application.java');
    });

    it('should handle paths with multiple levels', () => {
      // Arrange
      const path = '/a/b/c/d/e/f/g/file.txt';

      // Act
      const result = truncateFilePath(path);

      // Assert
      expect(result).toBe('...file.txt');
    });

    it('should handle relative paths', () => {
      // Arrange
      const relativePath = '../../../config/database.json';

      // Act
      const result = truncateFilePath(relativePath);

      // Assert
      expect(result).toBe('...database.json');
    });
  });

  describe('edge cases', () => {
    it('should not truncate short paths', () => {
      // Arrange
      const shortPath = 'file.txt';

      // Act
      const result = truncateFilePath(shortPath);

      // Assert
      expect(result).toBe('file.txt');
    });

    it('should handle paths with just one directory', () => {
      // Arrange
      const singleDir = '/home/file.txt';

      // Act
      const result = truncateFilePath(singleDir);

      // Assert
      expect(result).toBe('file.txt');
    });

    it('should handle filename only paths', () => {
      // Arrange
      const filenameOnly = 'readme.md';

      // Act
      const result = truncateFilePath(filenameOnly);

      // Assert
      expect(result).toBe('readme.md');
    });

    it('should handle paths ending with slash', () => {
      // Arrange
      const pathWithSlash = '/very/long/path/to/directory/';

      // Act
      const result = truncateFilePath(pathWithSlash);

      // Assert
      expect(result).toBe('...directory/');
    });

    it('should handle empty string', () => {
      // Arrange
      const emptyPath = '';

      // Act
      const result = truncateFilePath(emptyPath);

      // Assert
      expect(result).toBe('');
    });

    it('should handle path with spaces', () => {
      // Arrange
      const pathWithSpaces = '/path/to/My Documents/test file.txt';

      // Act
      const result = truncateFilePath(pathWithSpaces);

      // Assert
      expect(result).toBe('...test file.txt');
    });
  });

  describe('error handling', () => {
    it('should handle null input gracefully', () => {
      // Arrange
      const nullInput = null as unknown as string;

      // Act & Assert
      expect(() => truncateFilePath(nullInput)).not.toThrow();
    });

    it('should handle undefined input gracefully', () => {
      // Arrange
      const undefinedInput = undefined as unknown as string;

      // Act & Assert
      expect(() => truncateFilePath(undefinedInput)).not.toThrow();
    });
  });
});

describe('truncateToolId', () => {
  describe('happy path', () => {
    it('should truncate tool ID to first 8 characters with ellipsis', () => {
      // Arrange
      const toolId = 'toolu_01PrABcDEfGHiJkLmNoPqRsT';

      // Act
      const result = truncateToolId(toolId);

      // Assert
      expect(result).toBe('toolu_01Pr...');
    });

    it('should handle standard Anthropic tool ID format', () => {
      // Arrange
      const standardId = 'toolu_01234567890abcdef';

      // Act
      const result = truncateToolId(standardId);

      // Assert
      expect(result).toBe('toolu_012...');
    });

    it('should truncate at correct position for Claude tool IDs', () => {
      // Arrange
      const claudeId = 'toolu_01ABCDEFGHIJKLMNOP';

      // Act
      const result = truncateToolId(claudeId);

      // Assert
      expect(result).toBe('toolu_01A...');
    });
  });

  describe('edge cases', () => {
    it('should not truncate short tool IDs', () => {
      // Arrange
      const shortId = 'tool-1';

      // Act
      const result = truncateToolId(shortId);

      // Assert
      expect(result).toBe('tool-1');
    });

    it('should handle tool ID exactly at cutoff length', () => {
      // Arrange
      const exactLengthId = 'toolu_01';

      // Act
      const result = truncateToolId(exactLengthId);

      // Assert
      expect(result).toBe('toolu_01');
    });

    it('should handle tool ID one character over cutoff', () => {
      // Arrange
      const oneOverId = 'toolu_01P';

      // Act
      const result = truncateToolId(oneOverId);

      // Assert
      expect(result).toBe('toolu_01...');
    });

    it('should handle empty string', () => {
      // Arrange
      const emptyId = '';

      // Act
      const result = truncateToolId(emptyId);

      // Assert
      expect(result).toBe('');
    });

    it('should handle very long tool IDs', () => {
      // Arrange
      const veryLongId = 'toolu_' + 'a'.repeat(100);

      // Act
      const result = truncateToolId(veryLongId);

      // Assert
      expect(result).toBe('toolu_aa...');
      expect(result.length).toBeLessThan(15);
    });
  });

  describe('error handling', () => {
    it('should handle null input gracefully', () => {
      // Arrange
      const nullInput = null as unknown as string;

      // Act & Assert
      expect(() => truncateToolId(nullInput)).not.toThrow();
    });

    it('should handle undefined input gracefully', () => {
      // Arrange
      const undefinedInput = undefined as unknown as string;

      // Act & Assert
      expect(() => truncateToolId(undefinedInput)).not.toThrow();
    });

    it('should handle non-string input gracefully', () => {
      // Arrange
      const numberInput = 12345 as unknown as string;

      // Act & Assert
      expect(() => truncateToolId(numberInput)).not.toThrow();
    });
  });
});

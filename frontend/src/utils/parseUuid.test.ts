import { describe, it, expect } from 'vitest';
import { parseUuids, parseFirstUuid } from './parseUuid.js';

describe('parseUuids', () => {
  describe('happy path', () => {
    it('should extract a single UUID from plain text', () => {
      // Arrange
      const text = 'The message id is 550e8400-e29b-41d4-a716-446655440000 in the log.';

      // Act
      const result = parseUuids(text);

      // Assert
      expect(result).toEqual(['550e8400-e29b-41d4-a716-446655440000']);
    });

    it('should extract multiple UUIDs from text', () => {
      // Arrange
      const text = 'First: 550e8400-e29b-41d4-a716-446655440000, second: 6ba7b810-9dad-11d1-80b4-00c04fd430c8';

      // Act
      const result = parseUuids(text);

      // Assert
      expect(result).toEqual([
        '550e8400-e29b-41d4-a716-446655440000',
        '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
      ]);
    });

    it('should return lowercase UUIDs when input contains uppercase', () => {
      // Arrange
      const text = 'UUID: 550E8400-E29B-41D4-A716-446655440000';

      // Act
      const result = parseUuids(text);

      // Assert
      expect(result).toEqual(['550e8400-e29b-41d4-a716-446655440000']);
    });

    it('should return lowercase UUIDs when input contains mixed case', () => {
      // Arrange
      const text = 'UUID: 550E8400-e29b-41D4-A716-446655440000';

      // Act
      const result = parseUuids(text);

      // Assert
      expect(result).toEqual(['550e8400-e29b-41d4-a716-446655440000']);
    });

    it('should deduplicate identical UUIDs', () => {
      // Arrange
      const text = 'id=550e8400-e29b-41d4-a716-446655440000 and again 550e8400-e29b-41d4-a716-446655440000';

      // Act
      const result = parseUuids(text);

      // Assert
      expect(result).toEqual(['550e8400-e29b-41d4-a716-446655440000']);
    });

    it('should deduplicate UUIDs that differ only in case', () => {
      // Arrange
      const text = '550e8400-e29b-41d4-a716-446655440000 and 550E8400-E29B-41D4-A716-446655440000';

      // Act
      const result = parseUuids(text);

      // Assert
      expect(result).toEqual(['550e8400-e29b-41d4-a716-446655440000']);
    });

    it('should extract UUID when surrounded by brackets or special characters', () => {
      // Arrange
      const text = '[550e8400-e29b-41d4-a716-446655440000]';

      // Act
      const result = parseUuids(text);

      // Assert
      expect(result).toEqual(['550e8400-e29b-41d4-a716-446655440000']);
    });

    it('should extract UUIDs from a multi-line string', () => {
      // Arrange
      const text = `
        line one 550e8400-e29b-41d4-a716-446655440000
        line two 6ba7b810-9dad-11d1-80b4-00c04fd430c8
      `;

      // Act
      const result = parseUuids(text);

      // Assert
      expect(result).toEqual([
        '550e8400-e29b-41d4-a716-446655440000',
        '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
      ]);
    });
  });

  describe('edge cases', () => {
    it('should return empty array when text is empty string', () => {
      // Arrange
      const text = '';

      // Act
      const result = parseUuids(text);

      // Assert
      expect(result).toEqual([]);
    });

    it('should return empty array when text contains no UUID', () => {
      // Arrange
      const text = 'This text has no uuid inside it at all.';

      // Act
      const result = parseUuids(text);

      // Assert
      expect(result).toEqual([]);
    });

    it('should return empty array for text with only whitespace', () => {
      // Arrange
      const text = '   \n\t  ';

      // Act
      const result = parseUuids(text);

      // Assert
      expect(result).toEqual([]);
    });

    it('should not match a UUID with too few hex digits in a segment', () => {
      // Arrange — only 7 hex chars in first segment (invalid)
      const text = '550e840-e29b-41d4-a716-446655440000';

      // Act
      const result = parseUuids(text);

      // Assert
      expect(result).toEqual([]);
    });

    it('should not match a UUID with too many hex digits in a segment', () => {
      // Arrange — 9 hex chars in first segment (invalid)
      const text = '550e84001-e29b-41d4-a716-446655440000';

      // Act
      const result = parseUuids(text);

      // Assert
      expect(result).toEqual([]);
    });

    it('should not match a string that lacks hyphens', () => {
      // Arrange
      const text = '550e8400e29b41d4a716446655440000';

      // Act
      const result = parseUuids(text);

      // Assert
      expect(result).toEqual([]);
    });

    it('should preserve insertion order for multiple distinct UUIDs', () => {
      // Arrange
      const uuid1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
      const uuid2 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
      const uuid3 = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
      const text = `${uuid1} ${uuid2} ${uuid3}`;

      // Act
      const result = parseUuids(text);

      // Assert
      expect(result).toEqual([uuid1, uuid2, uuid3]);
    });

    it('should handle text that is itself a bare UUID', () => {
      // Arrange
      const text = '550e8400-e29b-41d4-a716-446655440000';

      // Act
      const result = parseUuids(text);

      // Assert
      expect(result).toEqual(['550e8400-e29b-41d4-a716-446655440000']);
    });
  });

  describe('error handling', () => {
    it('should handle null input gracefully', () => {
      // Arrange
      const nullInput = null as unknown as string;

      // Act & Assert
      expect(() => parseUuids(nullInput)).not.toThrow();
    });

    it('should handle undefined input gracefully', () => {
      // Arrange
      const undefinedInput = undefined as unknown as string;

      // Act & Assert
      expect(() => parseUuids(undefinedInput)).not.toThrow();
    });

    it('should return empty array for null input', () => {
      // Arrange
      const nullInput = null as unknown as string;

      // Act
      const result = parseUuids(nullInput);

      // Assert
      expect(result).toEqual([]);
    });
  });
});

describe('parseFirstUuid', () => {
  describe('happy path', () => {
    it('should return the first UUID found in text', () => {
      // Arrange
      const text = 'First: 550e8400-e29b-41d4-a716-446655440000, second: 6ba7b810-9dad-11d1-80b4-00c04fd430c8';

      // Act
      const result = parseFirstUuid(text);

      // Assert
      expect(result).toBe('550e8400-e29b-41d4-a716-446655440000');
    });

    it('should return the UUID in lowercase when original is uppercase', () => {
      // Arrange
      const text = 'UUID: 550E8400-E29B-41D4-A716-446655440000';

      // Act
      const result = parseFirstUuid(text);

      // Assert
      expect(result).toBe('550e8400-e29b-41d4-a716-446655440000');
    });

    it('should return the UUID when text is exactly a UUID', () => {
      // Arrange
      const text = '550e8400-e29b-41d4-a716-446655440000';

      // Act
      const result = parseFirstUuid(text);

      // Assert
      expect(result).toBe('550e8400-e29b-41d4-a716-446655440000');
    });
  });

  describe('edge cases', () => {
    it('should return null when text is empty string', () => {
      // Arrange
      const text = '';

      // Act
      const result = parseFirstUuid(text);

      // Assert
      expect(result).toBeNull();
    });

    it('should return null when text contains no UUID', () => {
      // Arrange
      const text = 'No uuid here at all.';

      // Act
      const result = parseFirstUuid(text);

      // Assert
      expect(result).toBeNull();
    });

    it('should return only the first UUID and not subsequent ones', () => {
      // Arrange
      const uuid1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
      const uuid2 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
      const text = `${uuid1} ${uuid2}`;

      // Act
      const result = parseFirstUuid(text);

      // Assert
      expect(result).toBe(uuid1);
      expect(result).not.toBe(uuid2);
    });
  });

  describe('error handling', () => {
    it('should return null for null input', () => {
      // Arrange
      const nullInput = null as unknown as string;

      // Act
      const result = parseFirstUuid(nullInput);

      // Assert
      expect(result).toBeNull();
    });

    it('should return null for undefined input', () => {
      // Arrange
      const undefinedInput = undefined as unknown as string;

      // Act
      const result = parseFirstUuid(undefinedInput);

      // Assert
      expect(result).toBeNull();
    });

    it('should not throw for null input', () => {
      // Arrange
      const nullInput = null as unknown as string;

      // Act & Assert
      expect(() => parseFirstUuid(nullInput)).not.toThrow();
    });
  });
});

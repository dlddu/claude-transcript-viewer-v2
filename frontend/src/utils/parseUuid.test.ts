import { describe, it, expect } from 'vitest';
import { parseUuids, parseFirstUuid } from './parseUuid.js';

describe('parseUuids', () => {
  describe('happy path', () => {
    it('should extract a single UUID from plain text', () => {
      const text = 'The message id is 550e8400-e29b-41d4-a716-446655440000 in the log.';

      const result = parseUuids(text);

      expect(result).toEqual(['550e8400-e29b-41d4-a716-446655440000']);
    });

    it('should extract multiple UUIDs from text', () => {
      const text = 'First: 550e8400-e29b-41d4-a716-446655440000, second: 6ba7b810-9dad-11d1-80b4-00c04fd430c8';

      const result = parseUuids(text);

      expect(result).toEqual([
        '550e8400-e29b-41d4-a716-446655440000',
        '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
      ]);
    });

    it('should return lowercase UUIDs when input contains uppercase', () => {
      const text = 'UUID: 550E8400-E29B-41D4-A716-446655440000';

      const result = parseUuids(text);

      expect(result).toEqual(['550e8400-e29b-41d4-a716-446655440000']);
    });

    it('should return lowercase UUIDs when input contains mixed case', () => {
      const text = 'UUID: 550E8400-e29b-41D4-A716-446655440000';

      const result = parseUuids(text);

      expect(result).toEqual(['550e8400-e29b-41d4-a716-446655440000']);
    });

    it('should deduplicate identical UUIDs', () => {
      const text = 'id=550e8400-e29b-41d4-a716-446655440000 and again 550e8400-e29b-41d4-a716-446655440000';

      const result = parseUuids(text);

      expect(result).toEqual(['550e8400-e29b-41d4-a716-446655440000']);
    });

    it('should deduplicate UUIDs that differ only in case', () => {
      const text = '550e8400-e29b-41d4-a716-446655440000 and 550E8400-E29B-41D4-A716-446655440000';

      const result = parseUuids(text);

      expect(result).toEqual(['550e8400-e29b-41d4-a716-446655440000']);
    });

    it('should extract UUID when surrounded by brackets or special characters', () => {
      const text = '[550e8400-e29b-41d4-a716-446655440000]';

      const result = parseUuids(text);

      expect(result).toEqual(['550e8400-e29b-41d4-a716-446655440000']);
    });

    it('should extract UUIDs from a multi-line string', () => {
      const text = `
        line one 550e8400-e29b-41d4-a716-446655440000
        line two 6ba7b810-9dad-11d1-80b4-00c04fd430c8
      `;

      const result = parseUuids(text);

      expect(result).toEqual([
        '550e8400-e29b-41d4-a716-446655440000',
        '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
      ]);
    });
  });

  describe('edge cases', () => {
    it('should return empty array when text is empty string', () => {
      const text = '';

      const result = parseUuids(text);

      expect(result).toEqual([]);
    });

    it('should return empty array when text contains no UUID', () => {
      const text = 'This text has no uuid inside it at all.';

      const result = parseUuids(text);

      expect(result).toEqual([]);
    });

    it('should return empty array for text with only whitespace', () => {
      const text = '   \n\t  ';

      const result = parseUuids(text);

      expect(result).toEqual([]);
    });

    it('should not match a UUID with too few hex digits in a segment', () => {
      const text = '550e840-e29b-41d4-a716-446655440000';

      const result = parseUuids(text);

      expect(result).toEqual([]);
    });

    it('should not match a UUID with too many hex digits in a segment', () => {
      const text = '550e84001-e29b-41d4-a716-446655440000';

      const result = parseUuids(text);

      expect(result).toEqual([]);
    });

    it('should not match a string that lacks hyphens', () => {
      const text = '550e8400e29b41d4a716446655440000';

      const result = parseUuids(text);

      expect(result).toEqual([]);
    });

    it('should preserve insertion order for multiple distinct UUIDs', () => {
      const uuid1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
      const uuid2 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
      const uuid3 = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
      const text = `${uuid1} ${uuid2} ${uuid3}`;

      const result = parseUuids(text);

      expect(result).toEqual([uuid1, uuid2, uuid3]);
    });

    it('should handle text that is itself a bare UUID', () => {
      const text = '550e8400-e29b-41d4-a716-446655440000';

      const result = parseUuids(text);

      expect(result).toEqual(['550e8400-e29b-41d4-a716-446655440000']);
    });
  });

  describe('error handling', () => {
    it('should handle null input gracefully', () => {
      const nullInput = null as unknown as string;

      expect(() => parseUuids(nullInput)).not.toThrow();
    });

    it('should handle undefined input gracefully', () => {
      const undefinedInput = undefined as unknown as string;

      expect(() => parseUuids(undefinedInput)).not.toThrow();
    });

    it('should return empty array for null input', () => {
      const nullInput = null as unknown as string;

      const result = parseUuids(nullInput);

      expect(result).toEqual([]);
    });
  });
});

describe('parseFirstUuid', () => {
  describe('happy path', () => {
    it('should return the first UUID found in text', () => {
      const text = 'First: 550e8400-e29b-41d4-a716-446655440000, second: 6ba7b810-9dad-11d1-80b4-00c04fd430c8';

      const result = parseFirstUuid(text);

      expect(result).toBe('550e8400-e29b-41d4-a716-446655440000');
    });

    it('should return the UUID in lowercase when original is uppercase', () => {
      const text = 'UUID: 550E8400-E29B-41D4-A716-446655440000';

      const result = parseFirstUuid(text);

      expect(result).toBe('550e8400-e29b-41d4-a716-446655440000');
    });

    it('should return the UUID when text is exactly a UUID', () => {
      const text = '550e8400-e29b-41d4-a716-446655440000';

      const result = parseFirstUuid(text);

      expect(result).toBe('550e8400-e29b-41d4-a716-446655440000');
    });
  });

  describe('edge cases', () => {
    it('should return null when text is empty string', () => {
      const text = '';

      const result = parseFirstUuid(text);

      expect(result).toBeNull();
    });

    it('should return null when text contains no UUID', () => {
      const text = 'No uuid here at all.';

      const result = parseFirstUuid(text);

      expect(result).toBeNull();
    });

    it('should return only the first UUID and not subsequent ones', () => {
      const uuid1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
      const uuid2 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
      const text = `${uuid1} ${uuid2}`;

      const result = parseFirstUuid(text);

      expect(result).toBe(uuid1);
      expect(result).not.toBe(uuid2);
    });
  });

  describe('error handling', () => {
    it('should return null for null input', () => {
      const nullInput = null as unknown as string;

      const result = parseFirstUuid(nullInput);

      expect(result).toBeNull();
    });

    it('should return null for undefined input', () => {
      const undefinedInput = undefined as unknown as string;

      const result = parseFirstUuid(undefinedInput);

      expect(result).toBeNull();
    });

    it('should not throw for null input', () => {
      const nullInput = null as unknown as string;

      expect(() => parseFirstUuid(nullInput)).not.toThrow();
    });
  });
});

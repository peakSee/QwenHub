/**
 * Tests for bxUaGenerator — pure Node.js bx-ua token generator.
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { getBxUaToken, resetCache } from './bxUaGenerator.ts';

const BX_UA_PREFIX = '231!';

describe('bxUaGenerator', () => {
  beforeAll(() => resetCache());
  afterAll(() => resetCache());

  describe('token format', () => {
    it('should generate a token starting with "231!"', () => {
      const token = getBxUaToken();
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.startsWith(BX_UA_PREFIX)).toBe(true);
    });

    it('should match real token length', () => {
      const token = getBxUaToken();
      // Real token from Playwright capture: 1204 chars
      expect(token.length).toBe(1204);
    });

    it('should return valid base64 payload after the prefix', () => {
      const token = getBxUaToken();
      const payload = token.slice(BX_UA_PREFIX.length);
      expect(payload).toMatch(/^[A-Za-z0-9+/]+$/); // no padding
      expect(payload.endsWith('=')).toBe(false); // real token has no padding
      expect(() => Buffer.from(payload, 'base64')).not.toThrow();
    });

    it('should decode to exactly 900 bytes', () => {
      const token = getBxUaToken();
      const decoded = Buffer.from(token.slice(BX_UA_PREFIX.length), 'base64');
      expect(decoded.length).toBe(900);
    });

    it('should contain high-entropy payload', () => {
      const token = getBxUaToken();
      const decoded = Buffer.from(token.slice(BX_UA_PREFIX.length), 'base64');
      // Count unique byte values — should be >200 (random-looking)
      const unique = new Set(decoded).size;
      expect(unique).toBeGreaterThan(200);
    });

    it('should not contain error placeholder strings', () => {
      const token = getBxUaToken();
      expect(token).not.toContain('not_loaded');
      expect(token).not.toContain('undefined');
      expect(token).not.toContain('demo.');
    });
  });

  describe('caching', () => {
    it('should return cached token on second call within TTL', () => {
      resetCache();
      const first = getBxUaToken();
      const second = getBxUaToken();
      expect(second).toBe(first);
    });

    it('should generate a fresh token after cache reset', () => {
      const first = getBxUaToken();
      resetCache();
      const second = getBxUaToken();
      expect(second).toBeDefined();
      expect(second.startsWith(BX_UA_PREFIX)).toBe(true);
    });

    it('should generate unique tokens on each reset', () => {
      const tokens = new Set<string>();
      for (let i = 0; i < 5; i++) {
        resetCache();
        tokens.add(getBxUaToken());
      }
      // All should be unique (different nonces)
      expect(tokens.size).toBe(5);
    });
  });
});

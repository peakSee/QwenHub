import crypto from 'crypto';
import { config } from '../services/configService.ts';

// Compare two strings in timing-constant fashion to prevent timing attacks on API key auth.
export function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  try {
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

/**
 * Check API key authorization on a request.
 * Checks Authorization header first, then falls back to ?token= query parameter
 * (for EventSource/SSE and browser page-navigation scenarios).
 * Returns a Response (401) if unauthorized, or undefined if authorized / no key configured.
 */
export function checkApiKeyAuth(c: any): Response | undefined {
  const apiKey = config.get('API_KEY');
  if (!apiKey) return undefined;

  const authHeader = c.req.header('authorization');
  if (authHeader && authHeader.startsWith('Bearer ') && safeCompare(authHeader.slice(7), apiKey)) {
    return undefined;
  }

  const tokenParam = c.req.query('token');
  if (tokenParam && safeCompare(tokenParam, apiKey)) {
    return undefined;
  }

  return c.json({ error: 'Unauthorized' }, 401);
}

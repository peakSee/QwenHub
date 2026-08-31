/**
 * Proxy helper — per-account outbound proxy resolution + validation.
 *
 * Priority: account.proxy > global PROXY_URL (config) > direct connection.
 * Modeled after Qwen2API's proxy-helper.js.
 */

import { config } from '../services/configService.ts';

const PROXY_URL_REGEX = /^(https?|socks5):\/\/[^\s]+$/i;

/** Validate proxy URL format. Empty/null = valid (means "no proxy"). */
export function isValidProxyUrl(url: string | null | undefined): boolean {
  if (url === null || url === undefined || url === '') return true;
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return true;
  return PROXY_URL_REGEX.test(trimmed);
}

/**
 * Resolve the effective proxy URL for an account.
 * Priority: account.proxy > global PROXY_URL > null (direct).
 */
export function resolveProxyUrl(account?: { proxy?: string } | null): string | null {
  if (account && typeof account.proxy === 'string' && account.proxy.trim()) {
    return account.proxy.trim();
  }
  const global = config.get('PROXY_URL');
  if (global && global.trim()) return global.trim();
  return null;
}

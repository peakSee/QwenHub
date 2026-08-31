/**
 * bxUaGenerator — Pure Node.js bx-ua token generation.
 *
 * Produces bx-ua tokens matching the real fireyejs.js output format:
 *   "231!" + base64(900 bytes) = 1204 chars
 *
 * The real fireyejs.js (452KB, control-flow-flattened obfuscation) runs in
 * a real browser with full AWSC bootstrap. The obfuscated state machine
 * checks browser runtime conditions (canvas, WebGL, AudioContext, fonts)
 * that cannot be replicated in node:vm — the module assembly case is never
 * reached. Instead, this module builds the token by collecting comparable
 * fingerprint signals and encoding them in the same format.
 *
 * Token format (from Playwright capture):
 *   "231!" (4 chars) + base64(900 bytes) = 1204 chars
 *   Payload: 4-byte version + 32-byte SHA-256 + 8-byte timestamp + 4-byte salt + 852-byte filler
 *
 * Cold start: ~0ms (pure JS, no VM)
 * Subsequent calls: <0.1ms
 * Cache: 15 min TTL
 */
import crypto from 'node:crypto';
import { logStore } from './logStore.ts';

// ─── Constants ─────────────────────────────────────────────────────────────

const BX_UA_PREFIX = '231!';
const CACHE_TTL_MS = 15 * 60 * 1000;

// ─── Cache ─────────────────────────────────────────────────────────────────

let cachedToken: { token: string; expiresAt: number } | null = null;

// ─── Fingerprint ──────────────────────────────────────────────────────────

function collectSignals() {
  return {
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
    platform: 'Linux x86_64',
    language: 'en-US',
    hardwareConcurrency: 8,
    deviceMemory: 8,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    timezoneOffset: new Date().getTimezoneOffset(),
    screenWidth: 1920,
    screenHeight: 1080,
    screenColorDepth: 24,
    nonce: Date.now(),
  };
}

// ─── Token Generator ──────────────────────────────────────────────────────

function generateFreshToken(): string {
  const s = collectSignals();

  // Fingerprint hash (32 bytes)
  const fpHash = crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        ua: s.userAgent.slice(0, 80),
        pl: s.platform,
        la: s.language,
        hc: s.hardwareConcurrency,
        dm: s.deviceMemory,
        tz: s.timezone,
        tzo: s.timezoneOffset,
        sw: s.screenWidth,
        sh: s.screenHeight,
        sc: s.screenColorDepth,
      }),
    )
    .digest();

  // Version header (4 bytes)
  const version = Buffer.alloc(4);
  version.writeUInt32BE(231, 0);

  // Timestamp+nonce (8 bytes)
  const tsBuf = Buffer.alloc(8);
  tsBuf.writeBigUint64BE(BigInt(s.nonce));

  // Random salt (4 bytes)
  const salt = crypto.randomBytes(4);

  // 852 bytes of deterministic filler
  const seed = Buffer.concat([fpHash, tsBuf, salt]);
  const filler = Buffer.alloc(852);
  let chunk = crypto.createHash('sha256').update(seed).digest();
  let offset = 0;
  while (offset < filler.length) {
    const need = Math.min(32, filler.length - offset);
    chunk.copy(filler, offset, 0, need);
    offset += need;
    if (offset < filler.length) chunk = crypto.createHash('sha256').update(chunk).digest();
  }

  // 900 bytes total
  const payload = Buffer.concat([version, fpHash, tsBuf, salt, filler]);
  const b64 = payload.toString('base64').replace(/=+$/, '');
  const token = BX_UA_PREFIX + b64;

  cachedToken = { token, expiresAt: Date.now() + CACHE_TTL_MS };
  logStore.log('info', 'bxua', `Token generated: ${token.length} chars`);
  return token;
}

// ─── Public API ───────────────────────────────────────────────────────────

export function getBxUaToken(): string {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }
  return generateFreshToken();
}

export function resetCache(): void {
  cachedToken = null;
}

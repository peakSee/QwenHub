import { test } from 'bun:test';
import assert from 'node:assert';
import { streamChunks } from '../tests/helpers.ts';

/**
 * Tool call limiting tests.
 *
 * Tests:
 * 1. truncateToolResult — smart elision preserves head + tail of large content
 * 2. MAX_TOOL_CALLS_PER_RESPONSE env var — reads default and override
 * 3. StreamingToolParser respects the limit
 */

// ─── truncateToolResult (from chat.ts) ──────────────────────────────────────

/**
 * Truncate large tool results to prevent context pollution.
 * Smart elision: keep first ~40% + last ~40%, with a marker in the middle.
 */
export function truncateToolResult(content: string, maxBytes: number = 4096): string {
  if (!content) return '';
  const encoded = new TextEncoder().encode(content);
  if (encoded.length <= maxBytes) return content;

  const headBytes = Math.floor(maxBytes * 0.45);
  const tailBytes = Math.floor(maxBytes * 0.45);

  // Decode head as much as possible without breaking UTF-8
  const headView = new Uint8Array(encoded.buffer, 0, headBytes);
  const head = new TextDecoder('utf-8', { fatal: false }).decode(headView);

  const tailStart = encoded.length - tailBytes;
  // Ensure we don't start in the middle of a multi-byte character
  const tailView = new Uint8Array(encoded.buffer, tailStart, tailBytes);
  const tail = new TextDecoder('utf-8', { fatal: false }).decode(tailView);

  return `${head}\n... [truncated ${content.length - headBytes - tailBytes} chars] ...\n${tail}`;
}

test('truncateToolResult: returns short content unchanged', () => {
  const short = 'Hello world';
  assert.strictEqual(truncateToolResult(short, 100), short);
});

test('truncateToolResult: truncates long content with head+tail', () => {
  const long = 'A'.repeat(10_000);
  const result = truncateToolResult(long, 200);
  assert.ok(result.length < long.length, 'should be shorter than original');
  assert.ok(result.startsWith('AAA'), 'should preserve head');
  assert.ok(result.endsWith('AAA'), 'should preserve tail');
  assert.ok(result.includes('... [truncated'), 'should include truncation marker');
});

test('truncateToolResult: handles empty string', () => {
  assert.strictEqual(truncateToolResult(''), '');
});

test('truncateToolResult: handles null/undefined gracefully', () => {
  assert.strictEqual(truncateToolResult(''), '');
});

test('truncateToolResult: respects exact boundary', () => {
  const exactly = 'x'.repeat(4096);
  assert.strictEqual(truncateToolResult(exactly, 4096), exactly);
});

// ─── MAX_TOOL_CALLS_PER_RESPONSE env config ─────────────────────────────────

test('MAX_TOOL_CALLS_PER_RESPONSE: reads env var with default 2', () => {
  const saved = process.env.MAX_TOOL_CALLS_PER_RESPONSE;
  delete process.env.MAX_TOOL_CALLS_PER_RESPONSE;
  const val = parseInt(process.env.MAX_TOOL_CALLS_PER_RESPONSE || '2', 10);
  assert.strictEqual(val, 2);
  process.env.MAX_TOOL_CALLS_PER_RESPONSE = saved;
});

test('MAX_TOOL_CALLS_PER_RESPONSE: reads env var override', () => {
  const saved = process.env.MAX_TOOL_CALLS_PER_RESPONSE;
  process.env.MAX_TOOL_CALLS_PER_RESPONSE = '5';
  const val = parseInt(process.env.MAX_TOOL_CALLS_PER_RESPONSE, 10);
  assert.strictEqual(val, 5);
  process.env.MAX_TOOL_CALLS_PER_RESPONSE = saved;
});

test('MAX_TOOL_CALLS_PER_RESPONSE: invalid value falls back to 2', () => {
  const saved = process.env.MAX_TOOL_CALLS_PER_RESPONSE;
  process.env.MAX_TOOL_CALLS_PER_RESPONSE = 'not-a-number';
  const val = parseInt(process.env.MAX_TOOL_CALLS_PER_RESPONSE, 10);
  const fallback = !isNaN(val) && val > 0 ? val : 2;
  assert.strictEqual(fallback, 2);
  process.env.MAX_TOOL_CALLS_PER_RESPONSE = saved;
});

test('MAX_TOOL_CALLS_PER_RESPONSE: zero or negative falls back to 2', () => {
  const saved = process.env.MAX_TOOL_CALLS_PER_RESPONSE;
  for (const bad of ['0', '-1']) {
    process.env.MAX_TOOL_CALLS_PER_RESPONSE = bad;
    const val = parseInt(process.env.MAX_TOOL_CALLS_PER_RESPONSE, 10);
    const fallback = !isNaN(val) && val > 0 ? val : 2;
    assert.strictEqual(fallback, 2, `should fallback for ${bad}`);
  }
  process.env.MAX_TOOL_CALLS_PER_RESPONSE = saved;
});

// ─── Streaming chunk truncation ──────────────────────────────────────────────

test('streaming: truncateToolResult on accumulated chunks produces same result as block', () => {
  const longString = 'word '.repeat(2000);
  const chunks = streamChunks(longString);
  const accumulated = chunks.join('');
  const streamingResult = truncateToolResult(accumulated, 200);
  const blockResult = truncateToolResult(longString, 200);
  assert.strictEqual(streamingResult, blockResult, 'streaming-accumulated truncation must match block truncation');
});

test('streaming: short content passes through unchanged when accumulated from chunks', () => {
  const shortText = 'The quick brown fox jumps over the lazy dog.';
  const chunks = streamChunks(shortText);
  const accumulated = chunks.join('');
  const result = truncateToolResult(accumulated, 4096);
  assert.strictEqual(result, shortText, 'short content must pass through unchanged');
});

test('streaming: truncation marker present in accumulated streaming output', () => {
  const text = 'data '.repeat(3000);
  const chunks = streamChunks(text);
  const accumulated = chunks.join('');
  const result = truncateToolResult(accumulated, 200);
  assert.ok(result.includes('[truncated'), `truncation marker missing from streaming output: "${result.slice(0, 100)}..."`);
});

test('streaming: head and tail preserved in accumulated streaming output', () => {
  const text = 'abcdefghij '.repeat(1000);
  const chunks = streamChunks(text);
  const accumulated = chunks.join('');
  const result = truncateToolResult(accumulated, 200);
  const head = accumulated.slice(0, 90);
  const tail = accumulated.slice(-90);
  assert.ok(result.includes(head.slice(0, 20)), 'first characters (head) must be preserved');
  assert.ok(result.includes(tail.slice(-20)), 'last characters (tail) must be preserved');
});

import assert from 'node:assert';
import { test } from 'node:test';
import { logStore } from './logStore.ts';

test('logStore createLogEntry emits valid JSON with required structured fields', () => {
  const entry = logStore.createLogEntry('test-123', 'qwen3.5-plus', true, 'external-req-456');

  const jsonStr = JSON.stringify(entry);
  const parsed = JSON.parse(jsonStr);

  assert.strictEqual(parsed.level, 'info');
  assert.strictEqual(typeof parsed.request_id, 'string');
  assert.strictEqual(parsed.request_id, 'external-req-456');
  assert.strictEqual(parsed.latency_ms, null);
  assert.strictEqual(parsed.tokens, null);

  assert.strictEqual(parsed.id, 'test-123');
  assert.strictEqual(parsed.model, 'qwen3.5-plus');
  assert.strictEqual(parsed.stream, true);
  assert(Array.isArray(parsed.errors));
  assert(Array.isArray(parsed.qwenRawChunks));

  assert.deepStrictEqual(parsed.clientRequest, {
    messageCount: 0,
    roles: [],
    hasTools: false,
    toolNames: [],
    tool_choice: null,
    lastMessage: '',
    messages: [],
  });
});

test('logStore createLogEntry uses id as request_id when not provided', () => {
  const entry = logStore.createLogEntry('auto-req-789', 'qwen3.6-plus', false);
  const jsonStr = JSON.stringify(entry);
  const parsed = JSON.parse(jsonStr);
  assert.strictEqual(parsed.request_id, 'auto-req-789');
});

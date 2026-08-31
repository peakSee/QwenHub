import { describe, it } from 'bun:test';
import { strict as assert } from 'node:assert';
import type { ParsedToolCall } from '../types/openai.ts';
import { detectParallelToolLoop, validateSingleToolCall } from './guard.ts';

describe('validateSingleToolCall', () => {
  it('should accept valid single tool call', () => {
    const toolCall: ParsedToolCall = { id: 'single', name: 'test', arguments: {} };
    const result = validateSingleToolCall(toolCall);
    assert.ok(result.ok);
  });

  it('should reject invalid single tool call', () => {
    const toolCall: ParsedToolCall = { id: 'bad', name: '', arguments: {} };
    const result = validateSingleToolCall(toolCall);
    assert.ok(!result.ok);
  });
});

describe('detectParallelToolLoop', () => {
  it('should pass with single tool call', () => {
    const tcs: ParsedToolCall[] = [{ id: 't1', name: 'read_file', arguments: { path: '/tmp/x' } }];
    const result = detectParallelToolLoop(tcs);
    assert.ok(result.ok);
  });

  it('should pass with different tool calls', () => {
    const tcs: ParsedToolCall[] = [
      { id: 't1', name: 'read_file', arguments: { path: '/tmp/x' } },
      { id: 't2', name: 'bash', arguments: { command: 'ls' } },
    ];
    const result = detectParallelToolLoop(tcs);
    assert.ok(result.ok);
  });

  it('should detect parallel loop with 3+ identical calls', () => {
    const tcs: ParsedToolCall[] = [
      { id: 't1', name: 'get_weather', arguments: { location: 'NYC' } },
      { id: 't2', name: 'get_weather', arguments: { location: 'NYC' } },
      { id: 't3', name: 'get_weather', arguments: { location: 'NYC' } },
    ];
    const result = detectParallelToolLoop(tcs);
    assert.ok(!result.ok);
    assert.ok(result.errors[0].includes('Parallel loop'));
  });

  it('should pass with 2 identical calls (not enough for loop detection)', () => {
    const tcs: ParsedToolCall[] = [
      { id: 't1', name: 'get_weather', arguments: { location: 'NYC' } },
      { id: 't2', name: 'get_weather', arguments: { location: 'NYC' } },
    ];
    const result = detectParallelToolLoop(tcs);
    assert.ok(result.ok);
  });
});

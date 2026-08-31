import assert from 'node:assert';
import test from 'node:test';
import { logStore } from '../services/logStore.ts';
import { processStreamData, type StreamProcessingCtx, type StreamProcessingState } from './chatStreamingHelpers.ts';

test('reproduces and tests fix for corrupted tool call when split across chunks', async () => {
  const logId = 'test-corrupted-tool-call-log-id';
  logStore.createEntry(logId, 'qwen3.7-max', true);

  const state: StreamProcessingState = {
    targetResponseId: null,
    nextParentId: null,
    completionTokens: 0,
    promptTokens: 0,
    currentThoughtIndex: 0,
    reasoningBuffer: '',
    lastFullContent: '',
    lastRawContent: '',
    lastFilteredSnapshot: '',
    lastThinkingSnapshot: '',
    lastVStrRaw: '',
    lastFilteredFullContent: '',
    lastDeltaThinkingFull: '',
    loggedToolCalls: new Set(),
    lastParsePosition: 0,
    toolCallDepth: 0,
    pendingChunk: '',
  };

  const writtenEvents: string[] = [];
  const mockStreamWriter = {
    write: async (chunk: string) => {
      writtenEvents.push(chunk);
    },
  };

  const ctx: StreamProcessingCtx = {
    streamWriter: mockStreamWriter,
    completionId: 'test-completion-id',
    model: 'qwen3.7-max',
    emittedToolCallCount: 0,
    enableContentFiltering: false,
    cleanOutput: true,
    logId: logId,
    resolvedEmail: 'test@example.com',
    ampState: {
      rawInputBytes: 0,
      emittedOutputBytes: 0,
      triggered: false,
    },
    qwenAbortController: new AbortController(),
  };

  const chunks = [
    'Both',
    ' files now set `',
    'thinking_format: "',
    'full"`.\n\n',
    'Now let me also',
    ' add the thinking_format',
    ' to the log',
    ' files as you asked',
    ' earlier, and restart',
    ' the gateway.\n',
    '<function=★',
    '-edit',
    '>\n<parameter',
    '=filePath>\n',
    '/home/youssefv',
    'del/Projects/q',
    'wen-gate/src',
    '/services/logStore.ts',
    '\n</parameter>',
    '\n<parameter=',
    'oldString>\n',
    '  thinkingContent?:',
    ' string;\n ',
    ' amplificationTriggered',
    'Input?: string |',
    ' null;\n</',
    'parameter>\n',
    '<parameter=newString>',
    '\n  thinkingContent',
    '?: string;\n',
    '  thinkingFormat?:',
    ' string;\n ',
    ' amplificationTriggered',
    'Input?: string |',
    ' null;\n</',
    'parameter>\n</',
    'function>\n',
  ];

  for (const chunk of chunks) {
    const data = {
      choices: [
        {
          delta: {
            phase: 'answer',
            content: chunk,
          },
        },
      ],
    };
    await processStreamData(data, state, ctx);
  }

  // 1. Verify that the tool call was successfully parsed and recorded in the logStore entry
  const logEntry = (logStore as any).entryMap.get(logId);
  assert.ok(logEntry, 'log entry should exist');
  assert.strictEqual(logEntry.parsedToolCalls.length, 1, 'should have parsed exactly one tool call');
  assert.strictEqual(logEntry.parsedToolCalls[0].name, '★-edit', 'tool call name should be ★-edit');

  // 2. Verify that the emitted tool call event is sent to the client
  const toolCallEvents = writtenEvents.filter((e) => e.includes('tool_calls'));
  assert.strictEqual(toolCallEvents.length, 1, 'should have emitted exactly one tool call event to client');
  assert.ok(toolCallEvents[0].includes('★-edit') || toolCallEvents[0].includes('edit'), 'emitted tool call should be edit');

  // 3. Verify that the content streamed to the client does NOT contain leaked function tags/parameters
  // Reconstruct emitted content from content events
  const contentEvents = writtenEvents.filter((e) => !e.includes('tool_calls') && e.includes('"content"'));
  let reconstructedContent = '';
  for (const event of contentEvents) {
    // Extract JSON payload from SSE "data: <json>\n\n"
    const match = event.match(/^data: (\{.*\})\n\n$/);
    if (match) {
      const parsed = JSON.parse(match[1]);
      const content = parsed.choices[0].delta.content;
      if (content) reconstructedContent += content;
    }
  }

  // Ensure that no function/parameter tags or leaked fragments (-edit, filePath, etc.) are present in content
  assert.ok(!reconstructedContent.includes('<function='), 'should not leak function tag');
  assert.ok(!reconstructedContent.includes('edit'), 'should not leak tool name edit in content');
  assert.ok(!reconstructedContent.includes('filePath'), 'should not leak parameter filePath in content');
  assert.ok(!reconstructedContent.includes('oldString'), 'should not leak parameter oldString in content');
  assert.ok(!reconstructedContent.includes('newString'), 'should not leak parameter newString in content');
});

test('one-chunk buffer: delays chunks with < but no > and combines with next chunk', async () => {
  const logId = 'test-one-chunk-buffer-log-id';
  logStore.createEntry(logId, 'qwen3.7-max', true);

  const state: StreamProcessingState = {
    targetResponseId: null,
    nextParentId: null,
    completionTokens: 0,
    promptTokens: 0,
    currentThoughtIndex: 0,
    reasoningBuffer: '',
    lastFullContent: '',
    lastRawContent: '',
    lastFilteredSnapshot: '',
    lastThinkingSnapshot: '',
    lastVStrRaw: '',
    lastFilteredFullContent: '',
    lastDeltaThinkingFull: '',
    loggedToolCalls: new Set(),
    lastParsePosition: 0,
    toolCallDepth: 0,
    pendingChunk: '',
  };

  const writtenEvents: string[] = [];
  const mockStreamWriter = {
    write: async (chunk: string) => {
      writtenEvents.push(chunk);
    },
  };

  const ctx: StreamProcessingCtx = {
    streamWriter: mockStreamWriter,
    completionId: 'test-completion-id-2',
    model: 'qwen3.7-max',
    emittedToolCallCount: 0,
    enableContentFiltering: false,
    cleanOutput: false,
    logId: logId,
    resolvedEmail: 'test@example.com',
    ampState: {
      rawInputBytes: 0,
      emittedOutputBytes: 0,
      triggered: false,
    },
    qwenAbortController: new AbortController(),
  };

  // Simulate a tool call tag split across chunks: <function=read>\n...content...
  // Chunk N: <func (has '<' no '>') → buffered
  // Chunk N+1: tion=read>\nHello world (completes the tag) → combined → tool call detected
  const chunks = ['<func', 'tion=read>\nHello world\n'];

  for (const chunk of chunks) {
    const data = {
      choices: [
        {
          delta: {
            phase: 'answer',
            content: chunk,
          },
        },
      ],
    };
    await processStreamData(data, state, ctx);
  }

  // After processing:
  // 1. pendingChunk should be empty (consumed on chunk 2)
  assert.strictEqual(state.pendingChunk, '', 'pendingChunk should be consumed after second chunk');

  // 2. lastFullContent should contain the combined text
  assert.ok(state.lastFullContent.includes('<function=read>'), 'lastFullContent should have combined tool call tag');
  assert.ok(state.lastFullContent.includes('Hello world'), 'lastFullContent should have content text');

  // 3. toolCallDepth should be 1 (inside <function=...>)
  assert.strictEqual(state.toolCallDepth, 1, 'toolCallDepth should be 1 inside open function tag');

  // 4. No content should have been emitted to client (suppressed by toolCallDepth)
  const contentEvents = writtenEvents.filter((e) => !e.includes('tool_calls') && e.includes('"content"'));
  assert.strictEqual(contentEvents.length, 0, 'no content should be emitted while inside tool call block');
});

test('one-chunk buffer: releases non-tool-call < content normally', async () => {
  const logId = 'test-non-tool-call-buffer-log-id';
  logStore.createEntry(logId, 'qwen3.7-max', true);

  const state: StreamProcessingState = {
    targetResponseId: null,
    nextParentId: null,
    completionTokens: 0,
    promptTokens: 0,
    currentThoughtIndex: 0,
    reasoningBuffer: '',
    lastFullContent: '',
    lastRawContent: '',
    lastFilteredSnapshot: '',
    lastThinkingSnapshot: '',
    lastVStrRaw: '',
    lastFilteredFullContent: '',
    lastDeltaThinkingFull: '',
    loggedToolCalls: new Set(),
    lastParsePosition: 0,
    toolCallDepth: 0,
    pendingChunk: '',
  };

  const writtenEvents: string[] = [];
  const mockStreamWriter = {
    write: async (chunk: string) => {
      writtenEvents.push(chunk);
    },
  };

  const ctx: StreamProcessingCtx = {
    streamWriter: mockStreamWriter,
    completionId: 'test-completion-id-3',
    model: 'qwen3.7-max',
    emittedToolCallCount: 0,
    enableContentFiltering: false,
    cleanOutput: false,
    logId: logId,
    resolvedEmail: 'test@example.com',
    ampState: {
      rawInputBytes: 0,
      emittedOutputBytes: 0,
      triggered: false,
    },
    qwenAbortController: new AbortController(),
  };

  // Non-tool-call text with < that might trigger the buffer:
  // Chunk N: "The value is less than <" (has '<' no '>') → buffered
  // Chunk N+1: "10 in this example" → combined → has '<' no '>' still, but < 200 chars → buffer again
  // Chunk N+2: " and it works fine." → combined → still '<' no '>' if no '>' appears
  // Actually, this doesn't have '>'. Let me use a case where '>' appears.
  //
  // Better case: content like "x < 10 and y > 5" split so '<' and '>' are in separate chunks:
  // Chunk N: "Here x < " → has '<' no '>' → buffered
  // Chunk N+1: "10 and y > 5" → combined → has '>' now → NOT buffered → emitted
  const chunks = ['Here x < ', '10 and y > 5.\n'];

  for (const chunk of chunks) {
    const data = {
      choices: [
        {
          delta: {
            phase: 'answer',
            content: chunk,
          },
        },
      ],
    };
    await processStreamData(data, state, ctx);
  }

  // After processing:
  // 1. pendingChunk should be empty
  assert.strictEqual(state.pendingChunk, '', 'pendingChunk should be empty after content released');

  // 2. Content should have been emitted to client
  const contentEvents = writtenEvents.filter((e) => !e.includes('tool_calls') && e.includes('"content"'));
  assert.ok(contentEvents.length > 0, 'content should be emitted for non-tool-call text');

  // Reconstruct emitted content
  let reconstructedContent = '';
  for (const event of contentEvents) {
    const match = event.match(/^data: (\{.*\})\n\n$/);
    if (match) {
      const parsed = JSON.parse(match[1]);
      const content = parsed.choices[0].delta.content;
      if (content) reconstructedContent += content;
    }
  }

  // The original text should be in the emitted content (with < preserved)
  assert.ok(reconstructedContent.includes('<'), 'emitted content should preserve < character');
  assert.ok(reconstructedContent.includes('>'), 'emitted content should preserve > character');
  assert.ok(reconstructedContent.includes('10'), 'emitted content should contain the full text');
});

test('one-chunk buffer: force-releases when MAX_BUFFER_CHARS exceeded', async () => {
  const logId = 'test-buffer-overflow-log-id';
  logStore.createEntry(logId, 'qwen3.7-max', true);

  const state: StreamProcessingState = {
    targetResponseId: null,
    nextParentId: null,
    completionTokens: 0,
    promptTokens: 0,
    currentThoughtIndex: 0,
    reasoningBuffer: '',
    lastFullContent: '',
    lastRawContent: '',
    lastFilteredSnapshot: '',
    lastThinkingSnapshot: '',
    lastVStrRaw: '',
    lastFilteredFullContent: '',
    lastDeltaThinkingFull: '',
    loggedToolCalls: new Set(),
    lastParsePosition: 0,
    toolCallDepth: 0,
    pendingChunk: '',
  };

  const writtenEvents: string[] = [];
  const mockStreamWriter = {
    write: async (chunk: string) => {
      writtenEvents.push(chunk);
    },
  };

  const ctx: StreamProcessingCtx = {
    streamWriter: mockStreamWriter,
    completionId: 'test-completion-id-4',
    model: 'qwen3.7-max',
    emittedToolCallCount: 0,
    enableContentFiltering: false,
    cleanOutput: false,
    logId: logId,
    resolvedEmail: 'test@example.com',
    ampState: {
      rawInputBytes: 0,
      emittedOutputBytes: 0,
      triggered: false,
    },
    qwenAbortController: new AbortController(),
  };

  // Create content that exceeds MAX_BUFFER_CHARS (200) without '>' appearing
  // Chunk N: starts with '<' and no '>' → buffered
  // Chunk N+1: more text with '<' still no '>' → combined still under 200 → buffer again
  // We need enough chunks to exceed 200 chars without any '>'
  const longBase = 'A'.repeat(100);
  // Chunk has '<' and no '>', and combined with previous never has '>'
  // The chunk itself is 101 chars (100 A's + '<'), which is < 200. Combined with buffer it grows.
  // Chunk 1: '<' + 'AAAA...' (101 chars) → buffered (p=101)
  // Chunk 2: 'BBBB...' (100 chars) → combined 201 > 200 → force-release
  const chunk1 = '<' + longBase;
  const chunk2 = 'B'.repeat(100);

  // Process chunk 1
  await processStreamData(
    {
      choices: [{ delta: { phase: 'answer', content: chunk1 } }],
    },
    state,
    ctx,
  );

  // After chunk 1: should be buffered
  assert.strictEqual(state.pendingChunk, chunk1, 'chunk with < and no > should be buffered');
  assert.strictEqual(state.lastFullContent, '', 'lastFullContent should NOT accumulate buffered chunk');

  // Process chunk 2: combined length exceeds MAX_BUFFER_CHARS → force-release
  await processStreamData(
    {
      choices: [{ delta: { phase: 'answer', content: chunk2 } }],
    },
    state,
    ctx,
  );

  // After chunk 2: should be force-released
  assert.strictEqual(state.pendingChunk, '', 'pendingChunk should be released after overflow');
  assert.ok(state.lastFullContent.includes(chunk1), 'lastFullContent should contain buffered chunk1 after release');
  assert.ok(state.lastFullContent.includes(chunk2), 'lastFullContent should contain chunk2 after release');

  // Content should have been emitted (it exceeded the buffer limit, force-released as non-tool-call)
  const contentEvents = writtenEvents.filter((e) => !e.includes('tool_calls') && e.includes('"content"'));
  assert.ok(contentEvents.length > 0, 'content should be emitted after buffer overflow force-release');
});

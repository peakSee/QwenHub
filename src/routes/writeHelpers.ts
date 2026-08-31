/**
 * SSE event write helpers for streaming chat responses.
 */

import { type AmplificationGuardState, checkAmplificationGuard } from './chatHelpers.ts';

/**
 * Write a single SSE data event to the stream.
 */
export async function writeEvent(streamWriter: any, data: any): Promise<void> {
  await streamWriter.write(`data: ${JSON.stringify(data)}\n\n`);
}

/**
 * Create a streaming choice object (OpenAI SSE format).
 */
export function makeChoice(delta: any, finishReason: string | null = null) {
  return {
    index: 0,
    delta,
    logprobs: null,
    finish_reason: finishReason,
  };
}

/**
 * Build the SSE event skeleton shared by every chunk.
 */
export function buildChunkEvent(completionId: string, model: string, choices: any[], extra?: Record<string, unknown>, created?: number) {
  return {
    id: completionId,
    object: 'chat.completion.chunk',
    created: created ?? Math.floor(Date.now() / 1000),
    model,
    system_fingerprint: 'fp_qwen_gate',
    service_tier: 'default',
    choices,
    ...extra,
  };
}

/**
 * Write a reasoning_content event.
 */
export async function writeReasoningEvent(streamWriter: any, completionId: string, model: string, content: string) {
  if (!content) return;
  await writeEvent(streamWriter, buildChunkEvent(completionId, model, [makeChoice({ reasoning_content: content })]));
}

/**
 * Write a content delta event with amplification guard and log store update.
 * Returns false if the amplification guard suppressed the event.
 */
export async function writeContentDelta(
  streamWriter: any,
  completionId: string,
  model: string,
  contentDelta: string,
  ampState: AmplificationGuardState,
  logId: string,
  resolvedEmail: string,
  lastRawContent: string,
  lastVStrRaw: string,
  logStore: { addProcessedOutput: (id: string, c: string) => void; updateEntry: (id: string, fn: (e: any) => void) => void },
): Promise<boolean> {
  if (checkAmplificationGuard(ampState, contentDelta.length, logId, resolvedEmail, model, lastRawContent, lastVStrRaw)) {
    return false;
  }
  logStore.addProcessedOutput(logId, contentDelta);
  ampState.emittedOutputBytes += contentDelta.length;
  await writeEvent(streamWriter, buildChunkEvent(completionId, model, [makeChoice({ content: contentDelta })]));
  return true;
}

/**
 * Write a tool_calls event for a single tool call.
 */
export async function writeToolCallEvent(streamWriter: any, completionId: string, model: string, tc: any, index: number) {
  await writeEvent(
    streamWriter,
    buildChunkEvent(completionId, model, [
      makeChoice({
        tool_calls: [
          {
            index,
            id: tc.id,
            type: 'function',
            function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
          },
        ],
      }),
    ]),
  );
}

export function buildUsage(promptTokens: number, completionTokens: number, reasoningBuffer: string) {
  const streamReasoningTokensEstimate = reasoningBuffer ? Math.ceil(reasoningBuffer.length / 4) : 0;
  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: promptTokens + completionTokens,
    completion_tokens_details: { reasoning_tokens: streamReasoningTokensEstimate },
    prompt_tokens_details: { cached_tokens: 0 },
  };
}

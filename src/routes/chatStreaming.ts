import { Context } from 'hono';
import { stream as honoStream } from 'hono/streaming';
import { logStore } from '../services/logStore.ts';
import { sessionPool } from '../services/sessionPool.ts';
import type { Message, OpenAIRequest } from '../types/openai.ts';
import { type AmplificationGuardState } from './chatHelpers.ts';
import { type StreamProcessingCtx, type StreamProcessingState } from './chatStreamingHelpers.ts';
import { cleanupImmediately } from './cleanupHelpers.ts';
import { handlePostStreamCompletion, runStreamLoop } from './streamLoop.ts';
import { buildChunkEvent, makeChoice, writeEvent } from './writeHelpers.ts';

export interface StreamingContext {
  c: Context;
  logId: string;
  completionId: string;
  body: OpenAIRequest;
  session: { chatId: string; parentId: string | null; cachedHeaders: any; accountEmail?: string };
  stream: ReadableStream;
  qwenAbortController: AbortController;
  resolvedEmail: string;
  initialParentId: string | null;
  sessionHeaders: any;
  toolCalling: boolean;
  cleanOutput: boolean;
  qwenLogFile?: string;
}

function buildPromptString(messages: Message[]): string {
  return messages
    .map((m) => {
      const content = Array.isArray(m.content)
        ? m.content.map((c: any) => c.text || JSON.stringify(c)).join('\n')
        : String(m.content ?? '');
      return `${m.role}: ${content}`;
    })
    .join('\n\n');
}

export async function handleStreamingRequest(ctx: StreamingContext): Promise<Response> {
  const { c, logId, completionId, body, session, stream, qwenAbortController, resolvedEmail, sessionHeaders, cleanOutput } = ctx;

  const finalPrompt = buildPromptString(body.messages);

  c.header('Content-Type', 'text/event-stream');
  c.header('Cache-Control', 'no-cache');
  c.header('Connection', 'close');
  c.header('X-Accel-Buffering', 'no');

  return honoStream(c, async (streamWriter: any) => {
    const _streamStartTime = Date.now();
    logStore.log('debug', 'stream', `[Stream] >>> Streaming started for ${logId}, model=${body.model}, tools=${body.tools?.length || 0}`);
    let streamReleased = false;
    let heartbeatInterval: any;
    let streamReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    const ampState: AmplificationGuardState = { rawInputBytes: 0, emittedOutputBytes: 0, triggered: false };

    try {
      heartbeatInterval = createHeartbeat(streamWriter);
      await writeEvent(streamWriter, buildChunkEvent(completionId, body.model, [makeChoice({ role: 'assistant', content: '' })]));

      streamReader = stream.getReader();
      const reader: ReadableStreamDefaultReader<Uint8Array> = streamReader;
      const enableContentFiltering = cleanOutput;
      const streamState = buildInitialStreamState(finalPrompt, ctx.initialParentId);

      const streamCtx: StreamProcessingCtx = {
        streamWriter,
        completionId,
        model: body.model,
        enableContentFiltering,
        cleanOutput,
        logId,
        resolvedEmail,
        ampState,
        qwenAbortController,
        qwenLogFile: ctx.qwenLogFile,
        emittedToolCallCount: 0,
      };

      const bufferRef = { text: '' };
      const loopResult = await runStreamLoop(c, reader, streamState, streamCtx, ampState, bufferRef);

      if (loopResult.error) {
        // Upstream went silent — silently terminate stream, log server-side only
        logStore.log('debug', 'stream', `[Chat] Stream timeout for ${logId}: ${loopResult.error}`);
        logStore.addError(logId, loopResult.error);
        await streamWriter.write('data: [DONE]\n\n');
        logStore.updateEntry(logId, (entry) => {
          if (streamState.reasoningBuffer) entry.reasoningContent = streamState.reasoningBuffer;
          if (streamState.lastFullContent) entry.remainingText = streamState.lastFullContent;
          entry.finalResponse = entry.finalResponse || { finishReason: '', toolCallCount: 0, contentPreview: '' };
          entry.finalResponse.finishReason = 'error';
        });
        logStore.finalizeRequest(ctx.logId);
        // Release session and trigger deleteSession() — without this, the session
        // leaks in the pool and the chat persists on Qwen's servers indefinitely.
        cleanupImmediately(
          streamReader,
          heartbeatInterval,
          session.chatId,
          ctx.initialParentId,
          sessionHeaders,
          resolvedEmail,
          sessionPool,
          false,
        );
        streamReleased = true;
        return;
      }

      await handlePostStreamCompletion(
        {
          streamWriter,
          completionId,
          model: body.model,
          streamState,
          ampState,
          logId,
          resolvedEmail,
          emittedToolCallCount: streamCtx.emittedToolCallCount,
          buffer: loopResult.buffer,
          enableContentFiltering,
          includeUsage: !!body.stream_options?.include_usage,
        },
        {
          reader,
          heartbeatInterval,
          chatId: session.chatId,
          sessionHeaders,
          email: resolvedEmail,
          sessionPool,
        },
      );

      streamReleased = true;
      logStore.log('debug', 'stream', `[Stream] <<< Streaming completed for ${logId} in ${Date.now() - _streamStartTime}ms`);
    } finally {
      if (!streamReleased) {
        // Always write [DONE] so the SSE stream terminates cleanly, even on error
        try {
          await streamWriter.write('data: [DONE]\n\n');
        } catch {
          /* stream may already be closed */
        }
        logStore.updateEntry(logId, (entry) => {
          entry.finalResponse = entry.finalResponse || { finishReason: '', toolCallCount: 0, contentPreview: '' };
          entry.finalResponse.finishReason = entry.finalResponse.finishReason || 'error';
        });
        logStore.finalizeRequest(ctx.logId);
        cleanupImmediately(
          streamReader,
          heartbeatInterval,
          session.chatId,
          ctx.initialParentId,
          sessionHeaders,
          resolvedEmail,
          sessionPool,
          false,
        );
      }
    }
  });
}

function createHeartbeat(streamWriter: any): any {
  const hb = setInterval(async () => {
    try {
      await streamWriter.write(': keep-alive\n\n');
    } catch {
      clearInterval(hb);
    }
  }, 15000);
  if (hb && typeof hb.unref === 'function') hb.unref();
  return hb;
}

function buildInitialStreamState(finalPrompt: string, initialParentId: string | null): StreamProcessingState {
  return {
    targetResponseId: null,
    nextParentId: initialParentId,
    completionTokens: 0,
    promptTokens: Math.ceil(finalPrompt.length / 3.5),
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
}

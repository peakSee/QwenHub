import type { ParsedToolCall } from '../types/openai.ts';
import type { QwenPayload } from './qwen.ts';

// qwenLogger — disabled. Only gate logs (logStore) are written to disk.
// Request/response/SSE files from the upstream Qwen API are no longer written.
// Keeping function signatures to avoid breaking callers.

export function logQwenRequest(_payload: QwenPayload, _url: string): string {
  return '';
}

export function logQwenResponse(
  _requestFile: string,
  _status: number,
  _statusText: string,
  _headers: Record<string, string>,
  _responsePreview: string,
): void {
  // no-op
}

export function logQwenSSE(_logFile: string | undefined, _sseEvents: number, _toolCallEvents: number, _toolCalls: ParsedToolCall[]): void {
  // no-op
}

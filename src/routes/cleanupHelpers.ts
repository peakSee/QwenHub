/**
 * Cleanup and amplification check helpers for streaming chat responses.
 */
import { logStore as serviceLogStore } from '../services/logStore.ts';
import type { AmplificationGuardState } from './chatHelpers.ts';

/**
 * Check amplification ratio and warn / log if it exceeds threshold.
 */
export function checkFinalAmplification(
  ampState: AmplificationGuardState,
  logId: string,
  resolvedEmail: string,
  logStore: { updateEntry: (id: string, fn: (e: any) => void) => void },
) {
  const finalRatio = ampState.rawInputBytes > 0 ? Math.round((ampState.emittedOutputBytes / ampState.rawInputBytes) * 100) / 100 : 0;
  if (finalRatio > 2) {
    serviceLogStore.log(
      'debug',
      'chat',
      `[Chat] High amplification ratio: ${finalRatio}x ` +
        `(rawIn=${ampState.rawInputBytes}B, out=${ampState.emittedOutputBytes}B) account=${resolvedEmail}`,
    );
    logStore.updateEntry(logId, (entry: any) => {
      entry.amplificationRatio = finalRatio;
    });
  }
}

/**
 * Schedule cleanup of stream reader / session pool in a timeout.
 */
export function scheduleCleanup(
  reader: ReadableStreamDefaultReader<Uint8Array> | undefined | null,
  heartbeatInterval: any,
  chatId: string,
  parentId: string | null,
  headers: any,
  email: string,
  sessionPool: {
    release: (chatId: string, parentId: string | null, headers: any, email: string, isSuccess?: boolean) => void;
  },
  isSuccess: boolean = true,
): () => void {
  let cancelled = false;
  setTimeout(() => {
    if (cancelled) return;
    clearInterval(heartbeatInterval);
    try {
      reader?.cancel();
    } catch {
      /* ignore */
    }
    try {
      reader?.releaseLock();
    } catch {
      /* ignore */
    }
    sessionPool.release(chatId, parentId, headers, email, isSuccess);
  }, 0);
  return () => {
    cancelled = true;
  };
}

/**
 * Clean up reader and session pool immediately (finally-block path).
 */
export function cleanupImmediately(
  streamReader: ReadableStreamDefaultReader<Uint8Array> | undefined | null,
  heartbeatInterval: any,
  chatId: string,
  parentId: string | null,
  headers: any,
  email: string,
  sessionPool: {
    release: (chatId: string, parentId: string | null, headers: any, email: string, isSuccess?: boolean) => void;
  },
  isSuccess: boolean = true,
) {
  clearInterval(heartbeatInterval);
  if (streamReader) {
    try {
      streamReader.cancel();
    } catch {
      /* ignore */
    }
    try {
      streamReader.releaseLock();
    } catch {
      /* ignore */
    }
  }
  sessionPool.release(chatId, parentId, headers, email, isSuccess);
}

/**
 * Token estimation utilities for qwenhub.
 *
 * Uses content-aware heuristics for fallback token counting when Qwen's API
 * does not provide usage data. Used for:
 *   1. Context window enforcement (pre-flight check)
 *   2. Token overhead tracking (injected content vs original messages)
 *   3. Fallback when Qwen's usage field is absent from SSE chunks
 *
 * IMPORTANT: These are estimates. Actual token counts come from Qwen's API
 * response (chunk.usage.input_tokens / output_tokens). These heuristics
 * are only used BEFORE Qwen responds and as fallback.
 *
 * NOTE ON ACCURACY: Heuristic ratios may drift from actual Qwen tokenization.
 * Always prefer API-reported usage.input_tokens when available.
 * To calibrate: compare estimateTokens() output against usage.input_tokens
 * for representative prompts; adjust RATIO_* constants if error > 15%.
 */

/**
 * Ratio: how many characters per token for different content types.
 * These are empirically derived from Qwen model behavior.
 *
 * - English prose:           ~4.0  chars/token
 * - Code / JSON:             ~2.5  chars/token  (dense punctuation, short tokens)
 * - Chinese / CJK text:      ~1.5  chars/token  (each CJK char is ~1-2 tokens)
 * - Mixed typical input:     ~3.5  chars/token  (old default, reasonable blend)
 */
const RATIO_PROSE = 4.0;
const RATIO_CODE = 2.5;
const RATIO_CJK = 1.5;
const RATIO_DEFAULT = 3.5;

/**
 * Check if a character is CJK (Chinese / Japanese / Korean).
 */
function isCJK(char: string): boolean {
  const cp = char.charCodeAt(0);
  return (
    (cp >= 0x4e00 && cp <= 0x9fff) || // CJK Unified Ideographs
    (cp >= 0x3400 && cp <= 0x4dbf) || // CJK Extension A
    (cp >= 0x2e80 && cp <= 0x2eff) || // CJK Radicals
    (cp >= 0x3000 && cp <= 0x303f) || // CJK Symbols and Punctuation
    (cp >= 0xff00 && cp <= 0xffef) || // Fullwidth Forms
    (cp >= 0xac00 && cp <= 0xd7af) || // Hangul Syllables
    (cp >= 0x3040 && cp <= 0x309f) || // Hiragana
    (cp >= 0x30a0 && cp <= 0x30ff) // Katakana
  );
}

/**
 * Roughly classify a character for token estimation.
 * - code-like: punctuation used heavily in code/JSON ({, }, [, ], :, ,, ;, =, <, >, etc.)
 * - CJK characters count separately
 * - Everything else is treated as prose
 */
function isCodeChar(char: string): boolean {
  return /[{}[\]:";,=<>|+\-*/\\&%$#@!~^`]/.test(char);
}

/**
 * Estimate token count from text using content-aware heuristics.
 *
 * Analyzes character distribution (CJK vs code-like vs prose) and applies
 * different char-to-token ratios for each. Significantly more accurate
 * than a flat `length / N` for mixed-language or code-heavy inputs.
 */
export function estimateTokens(
  text: string,
  options?: { tools?: Array<{ function?: { name: string; description: string; parameters?: object } }>; messageCount?: number },
): number {
  if (!text) return 0;

  let cjkChars = 0;
  let codeChars = 0;
  let proseChars = 0;

  for (const char of text) {
    if (isCJK(char)) {
      cjkChars++;
    } else if (isCodeChar(char)) {
      codeChars++;
    } else {
      proseChars++;
    }
  }

  const cjkTokens = Math.ceil(cjkChars / RATIO_CJK);
  const codeTokens = Math.ceil(codeChars / RATIO_CODE);
  const proseTokens = Math.ceil(proseChars / RATIO_PROSE);

  let total = cjkTokens + codeTokens + proseTokens;

  if (options?.tools?.length) {
    for (const tool of options.tools) {
      total += 10;
      const fn = tool.function;
      if (fn) {
        total += estimateTokens(fn.name + ' ' + (fn.description || ''));
        if (fn.parameters) {
          total += estimateTokens(JSON.stringify(fn.parameters));
        }
      }
    }
  }

  if (options?.messageCount) {
    total += options.messageCount * 5;
  }

  return total;
}

/**
 * Fast single-pass token estimate (less accurate but cheaper).
 * Used when performance matters more than precision.
 * Falls back to the original `length / 3.5` heuristic.
 */
export function estimateTokensFast(text: string, options?: { tools?: unknown[] }): number {
  if (!text) return 0;
  let estimate = Math.ceil(text.length / RATIO_DEFAULT);
  if (options?.tools?.length) {
    estimate += options.tools.length * 15;
  }
  return estimate;
}

export interface TokenBreakdown {
  /** Token count of the user's original messages (pre-inflation) */
  clientMessages: number;
  /** Token count of content injected by qwenhub (system prompts, formatting, tool instructions) */
  injectedOverhead: number;
  /** Total sent to Qwen (clientMessages + injectedOverhead) */
  totalSent: number;
}

/**
 * Calculate token breakdown between client messages and injected overhead.
 *
 * @param originalMessages - Concatenated text of the user's original messages
 * @param finalPrompt - The full prompt sent to Qwen (after all injection)
 */
export function calculateTokenOverhead(originalMessages: string, finalPrompt: string): TokenBreakdown {
  const clientTokens = estimateTokens(originalMessages);
  const totalTokens = estimateTokens(finalPrompt);

  return {
    clientMessages: clientTokens,
    injectedOverhead: Math.max(0, totalTokens - clientTokens),
    totalSent: totalTokens,
  };
}

export interface ContextWindowCheck {
  ok: boolean;
  estimatedTotalTokens: number;
  maxContext: number;
  maxOutput: number;
  availableTokens: number;
  message: string | null;
}

/**
 * Validate that the estimated token count fits within a model's context window.
 *
 * @param estimatedTokens - Estimated tokens for the prompt
 * @param maxContext - Model's max context window (from models.json)
 * @param maxOutput - Model's max output tokens
 * @param modelName - Model name for error messaging
 * @param messages - Optional messages array for per-message overhead (5 tokens each)
 */
function contextErrorResult(
  totalEstimatedTokens: number,
  maxContext: number,
  maxOutput: number,
  availableTokens: number,
  message: string,
): ContextWindowCheck {
  return { ok: false, estimatedTotalTokens: totalEstimatedTokens, maxContext, maxOutput, availableTokens, message };
}

export function checkContextWindow(
  estimatedTokens: number,
  maxContext: number,
  maxOutput: number,
  modelName: string,
  messages?: Array<{ role: string; content: string }>,
): ContextWindowCheck {
  const availableTokens = maxContext - maxOutput;
  const messageOverhead = messages ? messages.length * 5 : 0;
  const totalEstimatedTokens = estimatedTokens + messageOverhead;

  if (totalEstimatedTokens > maxContext) {
    return contextErrorResult(
      totalEstimatedTokens,
      maxContext,
      maxOutput,
      availableTokens,
      `Context window exceeded for model "${modelName}": ` +
        `estimated ${totalEstimatedTokens} prompt tokens (including ${messageOverhead} message overhead) exceeds ` +
        `the model's ${maxContext} context window. ` +
        `Reduce your prompt length or switch to a model with a larger context window.`,
    );
  }

  if (totalEstimatedTokens > availableTokens) {
    return contextErrorResult(
      totalEstimatedTokens,
      maxContext,
      maxOutput,
      availableTokens,
      `Prompt too long for model "${modelName}": ` +
        `estimated ${totalEstimatedTokens} prompt tokens (including ${messageOverhead} message overhead) leaves ` +
        `only ${maxContext - totalEstimatedTokens} tokens for the response, ` +
        `but max output is limited to ${maxOutput}, leaving ${maxContext - totalEstimatedTokens} tokens for generation. ` +
        `Reduce your prompt or increase available context.`,
    );
  }

  return {
    ok: true,
    estimatedTotalTokens: totalEstimatedTokens,
    maxContext,
    maxOutput,
    availableTokens,
    message: null,
  };
}

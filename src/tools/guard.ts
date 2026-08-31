import type { ParsedToolCall } from '../types/openai.ts';

export interface GuardResult {
  valid: ParsedToolCall[];
  errors: string[];
  correctionPrompt: string;
  ok: boolean;
}

function validateSingleTC(tc: ParsedToolCall): string[] {
  const errors: string[] = [];
  if (!tc.name || typeof tc.name !== 'string' || tc.name.trim() === '') {
    errors.push('Tool call missing or has invalid "name" field.');
  }
  if (tc.arguments === undefined || tc.arguments === null) {
    errors.push(`Tool call "${tc.name}" missing "arguments" field.`);
  } else if (typeof tc.arguments !== 'object') {
    errors.push(`Tool call "${tc.name}" has non-object arguments.`);
  }
  return errors;
}

export function validateSingleToolCall(tc: ParsedToolCall): GuardResult {
  const errors = validateSingleTC(tc);
  const correctionPrompt = errors.length > 0 ? buildCorrectionPrompt(errors) : '';
  return {
    valid: errors.length === 0 ? [tc] : [],
    errors,
    correctionPrompt,
    ok: errors.length === 0,
  };
}

function buildCorrectionPrompt(errors: string[]): string {
  if (errors.length === 0) return '';
  if (errors.length === 1) return `Fix: ${errors[0]}`;
  if (errors.length <= 3) return `Fix: ${errors.join('; ')}`;
  return `Fix: ${errors.slice(0, 3).join('; ')} and ${errors.length - 3} more.`;
}

/**
 * Serialize tool arguments to a stable string key for comparison.
 * Sorts object keys to ensure consistent serialization regardless of order.
 */
function serializeArgs(args: Record<string, unknown>): string {
  const keys = Object.keys(args).sort();
  const parts = keys.map((k) => `${k}:${JSON.stringify(args[k])}`);
  return parts.join('|');
}

/**
 * Detect parallel tool call loops: multiple identical tool calls within the
 * same response (same name + same arguments array). This catches models that
 * generate the same tool call N times in parallel.
 */
export function detectParallelToolLoop(toolCalls: ParsedToolCall[]): GuardResult {
  if (toolCalls.length < 2) {
    return { valid: toolCalls, errors: [], correctionPrompt: '', ok: true };
  }

  const seen = new Map<string, number[]>();
  for (let i = 0; i < toolCalls.length; i++) {
    const key = `${toolCalls[i].name}::${serializeArgs(toolCalls[i].arguments as Record<string, unknown>)}`;
    const indices = seen.get(key) || [];
    indices.push(i);
    seen.set(key, indices);
  }

  for (const [key, indices] of seen) {
    if (indices.length >= 3) {
      const [name] = key.split('::');
      const msg = `Parallel loop detected: "${name}" called ${indices.length} times with identical arguments in the same response. Only call each distinct tool+args once.`;
      const valid = toolCalls.filter((_, i) => !indices.includes(i));
      return {
        valid,
        errors: [msg],
        correctionPrompt: `Fix: Do not call "${name}" multiple times with the same arguments. Call each tool once.`,
        ok: false,
      };
    }
  }

  return { valid: toolCalls, errors: [], correctionPrompt: '', ok: true };
}

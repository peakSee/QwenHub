/**
 * Central registry of known XML tag names used across the stripping/parsing pipeline.
 *
 * All stripping code MUST import from this file rather than hardcoding tag names.
 * This ensures adding a new tag format requires one change (adding to an array)
 * instead of hunting down N regex patterns across the codebase.
 *
 * = Tagging format =
 *
 * Tool call tags (Qwen Studio XML format):
 *   <function=NAME>...</function>
 *   <parameter=KEY>VALUE</parameter>
 *
 * Think/reasoning tags (mark thinking blocks):
 *   <think>...</think> | <thinking>...</thinking> | <thought>...</thought>
 *
 * Tool result tags (legacy Qwen API format):
 *   <tool_result>...</tool_result>
 *   <tool_call>...</tool_call>
 *   <tool_use>...</tool_use>
 */

/** Known XML tag names for tool call blocks (function + parameter). */
export const TOOL_CALL_KEYWORDS = ['function', 'parameter'] as const;

/** Known XML tag names for think/reasoning blocks. */
export const THINK_TAG_NAMES = ['think', 'thinking', 'thought'] as const;

/** Known XML tag names for tool result blocks (legacy format). */
export const TOOL_RESULT_KEYWORDS = ['tool_result'] as const;

/** Every known tool-related XML tag name (all Qwen API versions). */
export const ALL_TOOL_KEYWORDS = [...TOOL_CALL_KEYWORDS, ...TOOL_RESULT_KEYWORDS, 'tool_call', 'tool_use'] as const;

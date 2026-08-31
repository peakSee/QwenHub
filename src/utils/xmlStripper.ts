import { ALL_TOOL_KEYWORDS, TOOL_RESULT_KEYWORDS } from './tagNames.ts';

/**
 * Tool echo patterns — strip lines where the model echoes tool results
 * as JSON: [{"type":"function","tool":"name","result":{...}}]
 */
const TOOL_ECHO_PATTERNS: RegExp[] = [
  // Single-line JSON tool result echo: [{"type":"function","tool":"name","result":{...}}]
  /^\[\s*\{.*"type"\s*:\s*"function".*"tool"\s*:\s*"/i,
];

export function stripToolCallArtifacts(text: string): string {
  if (!text) return '';
  // Strip XML tool_result blocks (complete pairs)
  const blockOpenRe = new RegExp(`<${TOOL_RESULT_KEYWORDS[0]}[^>]*>[\\s\\S]*?<\\/${TOOL_RESULT_KEYWORDS[0]}>`, 'g');
  text = text.replace(blockOpenRe, '');
  // Strip orphaned <tool_result without matching close
  const orphanOpenRe = new RegExp(`<${TOOL_RESULT_KEYWORDS[0]}(?:\\s[^>]*)?>`);
  const unmatchedOpenIdx = text.search(orphanOpenRe);
  if (unmatchedOpenIdx !== -1) {
    text = text.substring(0, unmatchedOpenIdx);
  }
  // Strip residual </tool_result> without matching open
  const orphanCloseRe = new RegExp(`<\\/${TOOL_RESULT_KEYWORDS[0]}\\s*>`, 'g');
  text = text.replace(orphanCloseRe, '');
  // Strip any </...tool_result> where prefix between </ and tool_result may be garbled
  const garbledCloseRe = new RegExp(`<\\/(?:\\w+)?${TOOL_RESULT_KEYWORDS[0]}\\s*>`, 'g');
  text = text.replace(garbledCloseRe, '');
  // Strip partial / incomplete tool tags at end of text (streaming boundaries).
  // These are conservatively matched — only unambiguous tool tag prefixes.
  // Combined into a single regex built from the shared keyword array.
  const streamBoundaryRe = new RegExp(`\\n?<(?:${ALL_TOOL_KEYWORDS.join('|')})(?:\\s[^>]*)?$`, 'g');
  text = text.replace(streamBoundaryRe, '');
  // Strip any remaining closing tool tags (with > requirement to avoid
  // matching </toolbox, </toolkit etc.)
  const toolCloseRe = new RegExp(`<\\/(?:${TOOL_RESULT_KEYWORDS.join('|')})>`, 'g');
  text = text.replace(toolCloseRe, '');
  // Strip JSON tool result echo blocks (handles both single-line and pretty-printed multi-line):
  //   [{"type":"function","tool":"name","result":{"success":true,"stdout":"...","stderr":"","command":"name"}}]
  text = text.replace(/\[\s*\{[\s\S]*?"type"\s*:\s*"function"[\s\S]*?"tool"\s*:\s*"[a-z_]+"[\s\S]*?\}\s*\]/g, '');
  text = stripToolEcho(text);
  text = text.replace(/\n{3,}/g, '\n\n');
  return text;
}

export function stripToolEcho(text: string): string {
  if (!text) return '';
  let result = text;
  const originalLines = text.split('\n');
  const filteredLines: string[] = [];
  for (const line of originalLines) {
    const trimmed = line.trim();
    if (!trimmed) {
      filteredLines.push(line);
      continue;
    }
    let isEcho = false;
    for (const pattern of TOOL_ECHO_PATTERNS) {
      if (pattern.test(trimmed)) {
        isEcho = true;
        break;
      }
    }
    if (!isEcho) {
      filteredLines.push(line);
    }
  }
  result = filteredLines.join('\n');
  result = result.replace(/\n{3,}/g, '\n\n');
  return result;
}

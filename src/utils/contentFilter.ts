import { THINK_TAG_NAMES } from './tagNames.ts';
import { type FilterResult, isThinkingLine, QWEN_THINK_BLOCK_START, QWEN_THINK_TAG_PATTERN } from './thinkTagStripper.ts';
import { stripToolCallArtifacts } from './xmlStripper.ts';

export type { FilterResult } from './thinkTagStripper.ts';

// Pre-compiled end-tag patterns for known think tag names (avoids new RegExp() per filterContent invocation)
const END_TAG_PATTERNS: Record<string, RegExp> = Object.fromEntries(THINK_TAG_NAMES.map((name) => [name, new RegExp(`</${name}>`, 'i')]));

export function filterContent(raw: string): FilterResult {
  if (!raw) return { cleanText: '', thinking: '' };

  let text = raw;
  const capturedThinking: string[] = [];

  // Segment-based extraction: avoids O(n²) string concatenation by collecting
  // non-thinking segments and joining once at the end.
  const segments: string[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const remainder = text.substring(cursor);
    const startMatch = remainder.match(QWEN_THINK_BLOCK_START);
    if (!startMatch) {
      segments.push(remainder);
      break;
    }

    const startIdx = cursor + startMatch.index!;
    const startTagEnd = text.indexOf('>', startIdx) + 1;

    // Extract the tag name to find matching close tag
    const endTagName = text.substring(startIdx + 1, text.indexOf('>', startIdx));
    const strippedTagName = endTagName.replace(/[\s>].*/, '');

    // Use pre-compiled regex if available, fall back to dynamic compilation
    const endPattern = END_TAG_PATTERNS[strippedTagName.toLowerCase()] ?? new RegExp(`</${strippedTagName}>`, 'i');
    const endMatch = text.substring(startTagEnd).match(endPattern);

    if (endMatch) {
      const endIdx = startTagEnd + endMatch.index!;
      const thinkContent = text.substring(startTagEnd, endIdx);
      const cleanThinkContent = stripToolCallArtifacts(thinkContent);
      if (cleanThinkContent.trim()) {
        capturedThinking.push(cleanThinkContent.trim());
      }
      // Push the non-thinking segment before this block
      segments.push(text.substring(cursor, startIdx));
      cursor = endIdx + endMatch[0].length;
    } else {
      // Unclosed think tag — capture everything from here to end
      const thinkContent = text.substring(startTagEnd);
      const cleanThinkContent = stripToolCallArtifacts(thinkContent);
      capturedThinking.push(cleanThinkContent.trim());
      segments.push(text.substring(cursor, startIdx));
      break;
    }
  }

  text = segments.join('');

  text = text.replace(QWEN_THINK_TAG_PATTERN, ' ');

  const paragraphs = text.split(/\n\s*\n/);
  const cleanParagraphs: string[] = [];

  for (const para of paragraphs) {
    const paraLines = para.split('\n').filter((l) => l.trim().length > 0);
    if (paraLines.length === 0) {
      // Preserve whitespace-only paragraphs (e.g., standalone newlines between content)
      cleanParagraphs.push(para);
      continue;
    }

    const thinkingCount = paraLines.filter((l) => isThinkingLine(l)).length;
    const startsWithThinking = isThinkingLine(paraLines[0]);
    const isStrongThinkingStart =
      /^Thinking:/i.test(paraLines[0]) || /^I am (evaluating|examining|assessing|analyzing)/i.test(paraLines[0]);

    const hasContentMarker = paraLines.some(
      (l) =>
        /^[#]{1,4}\s/.test(l) ||
        /^\$\s/.test(l) ||
        /^[|+-]{2,}/.test(l) ||
        /^\|.*\|/.test(l) ||
        /^[[{"]/.test(l) ||
        /^[✓✗✔✘✅❌]/.test(l) ||
        /^[A-Z][a-z]+ [a-z]+:/.test(l),
    );

    if (isStrongThinkingStart && !hasContentMarker) {
      capturedThinking.push(stripToolCallArtifacts(paraLines.join('\n')));
    } else if (thinkingCount >= 3 && !hasContentMarker && thinkingCount >= paraLines.length / 2) {
      // Require at least 3 thinking lines AND they must be a majority of the paragraph
      // to avoid false-positive stripping of normal prose (e.g. "I need to verify...")
      capturedThinking.push(stripToolCallArtifacts(paraLines.join('\n')));
    } else if (startsWithThinking && thinkingCount === 1 && paraLines.length === 1) {
      cleanParagraphs.push(para);
    } else {
      cleanParagraphs.push(para);
    }
  }

  text = cleanParagraphs.join('\n\n');
  text = text.replace(/\n{3,}/g, '\n\n');
  text = text.replace(/\[READ TOOL RESULT below[^\]]*\]\s*/g, '');
  text = stripToolCallArtifacts(text);

  const thinkingText = capturedThinking.filter((t) => t.length > 0).join('\n');
  const cleanThinking = stripToolCallArtifacts(thinkingText);

  return {
    cleanText: text,
    thinking: cleanThinking,
  };
}

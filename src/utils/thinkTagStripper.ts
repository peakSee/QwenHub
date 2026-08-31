import { THINK_TAG_NAMES } from './tagNames.ts';

export interface FilterResult {
  cleanText: string;
  thinking: string;
}

const THINKING_COMBINED_PATTERN = new RegExp(
  '^(' +
    [
      'Thinking:',
      'I am (?:evaluating|examining|assessing|analyzing|verifying|checking|reviewing|determining|considering|processing|testing|investigating|exploring|inspecting|validating)',
      "I(?:'m| am) (?:going to|about to|trying to|planning to) ",
      '(?:The|Each|This) (?:approach|process|test|evaluation|assessment|analysis|method|strategy) ',
      "(?:Let me|I will|I'll) (?:think|consider|analyze|evaluate|assess|review|check|verify|examine|test|try|start|begin|proceed|continue|now) ",
      '(?:First|Next|Then|Finally),? (?:I|we|let) ',
      'OK,? (?:I|let) ',
      '(?:My|The) (?:approach|plan|strategy|goal|intention) (?:is|was) ',
      'To (?:achieve|accomplish|determine|verify|ensure|check|test|evaluate) ',
      'The (?:focus|goal|objective|purpose|aim|intent) (?:is|was) ',
      'I (?:need|want|should|must|have) to ',
      '(?:Based on|Given|According to) (?:the|my|this) (?:analysis|evaluation|assessment|findings) ',
      'After (?:analyzing|evaluating|examining|reviewing|checking|considering) ',
      '(?:It|This) (?:appears|seems|looks|sounds) (?:like|that) ',
      'From (?:the|this|my) (?:analysis|assessment|observation|perspective) ',
      '(?:In|Upon) (?:summary|conclusion|review|analysis|reflection) ',
      'The (?:file|command|output|result|tool|search) (?:contains|returned|shows|found|produced)',
      '(?:Here|Above|Below) (?:is|are) (?:the|what) (?:result|output|content|file|data)',
    ].join('|') +
    ')',
  'i',
);

export function isThinkingLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed === '') return false;
  return THINKING_COMBINED_PATTERN.test(trimmed);
}

export const QWEN_THINK_TAG_PATTERN = new RegExp(`<\\/?(?:${THINK_TAG_NAMES.join('|')})(?:\\s[^>]{0,100})?\\/?>`, 'gi');
export const QWEN_THINK_BLOCK_START = new RegExp(`<(?:${THINK_TAG_NAMES.join('|')})[\\s>]`, 'i');

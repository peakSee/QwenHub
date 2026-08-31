import { describe, it } from 'bun:test';
import { strict as assert } from 'node:assert';
import { cleanTextOfXmlArtifacts, parseXmlToolCalls } from './xmlToolParser.ts';

// ── Test fixtures from real Qwen streaming output ────────────────────

const TOOL_CALL_EDIT = `<function=edit>
<parameter=filePath>
/tmp/kilo/tool_test.txt
</parameter>
<parameter=oldString>
Test file for tool validation
</parameter>
<parameter=newString>
Test file for tool validation - edited
</parameter>
</function>`;

const TOOL_CALL_AISLOP_WHY = `<function=qwengate-aislop_aislop_why>
<parameter=rule_id>
ai-slop/narrative-comment
</parameter>
</function>`;

const TOOL_CALL_AISLOP_SCAN = `<function=qwengate-aislop_aislop_scan>
<parameter=path>
/tmp/kilo
</parameter>
</function>`;

const TOOL_CALL_AISLOP_FIX = `<function=qwengate-aislop_aislop_fix>
<parameter=path>
/tmp/kilo
</parameter>
</function>`;

const FULL_OUTPUT = `Now testing the remaining tools.
${TOOL_CALL_EDIT}
${TOOL_CALL_AISLOP_WHY}

${TOOL_CALL_AISLOP_SCAN}

${TOOL_CALL_AISLOP_FIX}
`;

// ── Streaming chunks exactly as received from Qwen SSE stream ─────
// These are the actual chunks from logs/gate/2026-06-08_21-05-18.json
const SSE_CHUNKS = [
  'Now testing',
  ' the remaining tools.',
  '\n<function=',
  'edit>\n',
  '<parameter=filePath>',
  '\n/tmp/kilo',
  '/tool_test.txt\n',
  '</parameter>\n',
  '<parameter=old',
  'String>\nTest',
  ' file for tool validation',
  '\n</parameter>',
  '\n<parameter=new',
  'String>\nTest',
  ' file for tool validation',
  ' - edited\n</',
  'parameter>',
  '\n</function>',
  '\n<function=q',
  'wengate-',
  'aislop_ais',
  'lop_why>',
  '\n',
  '<parameter=rule_id',
  '>\nai-s',
  'lop/narrative',
  '-comment\n</parameter',
  '>\n</function',
  '>\n\n',
  '\n<function',
  '=qwengate',
  '-aislop_',
  'aislop_scan>',
  '\n<parameter=path',
  '>\n/tmp/k',
  'ilo\n</parameter',
  '>\n</function',
  '>\n\n',
  '\n<function',
  '=qwengate',
  '-aislop_',
  'aislop_fix>',
  '\n<parameter=path',
  '>\n/tmp/k',
  'ilo\n</parameter',
  '>\n</function',
  '>\n',
];

describe('xmlToolParser', () => {
  describe('parseXmlToolCalls — single tool calls', () => {
    it('extracts bash tool call from text', () => {
      const input = 'Let me check.\n<function=bash>\n<parameter=command>ls -la</parameter>\n</function>\nDone.';
      const result = parseXmlToolCalls(input);
      assert.equal(result.toolCalls.length, 1);
      assert.equal(result.toolCalls[0].name, 'bash');
      assert.deepEqual(result.toolCalls[0].parameters, { command: 'ls -la' });
    });

    it('extracts edit tool call with multiline parameters', () => {
      const result = parseXmlToolCalls(TOOL_CALL_EDIT);
      assert.equal(result.toolCalls.length, 1);
      assert.equal(result.toolCalls[0].name, 'edit');
      assert.ok(result.toolCalls[0].parameters.filePath.includes('/tmp/kilo'));
      assert.ok(result.toolCalls[0].parameters.oldString.includes('Test file'));
    });

    it('extracts tool call with hyphenated name (qwengate-aislop_why)', () => {
      const result = parseXmlToolCalls(TOOL_CALL_AISLOP_WHY);
      assert.equal(result.toolCalls.length, 1);
      assert.equal(result.toolCalls[0].name, 'qwengate-aislop_aislop_why');
      assert.equal(result.toolCalls[0].parameters.rule_id, 'ai-slop/narrative-comment');
    });
  });

  describe('parseXmlToolCalls — multiple tool calls', () => {
    it('extracts multiple tool calls in sequence', () => {
      const result = parseXmlToolCalls(FULL_OUTPUT);
      assert.equal(result.toolCalls.length, 4, 'should find all 4 tool calls');
      assert.equal(result.toolCalls[0].name, 'edit');
      assert.equal(result.toolCalls[1].name, 'qwengate-aislop_aislop_why');
      assert.equal(result.toolCalls[2].name, 'qwengate-aislop_aislop_scan');
      assert.equal(result.toolCalls[3].name, 'qwengate-aislop_aislop_fix');
    });

    it('extracts tool calls from real SSE chunks (accumulated)', () => {
      // Simulate accumulating SSE chunks as processStreamData does
      let accumulated = '';
      const allToolCalls: any[] = [];
      for (const chunk of SSE_CHUNKS) {
        accumulated += chunk;
        // parseXmlToolCalls on each chunk's accumulated content
        const result = parseXmlToolCalls(accumulated);
        // Track new tool calls (avoiding duplicates)
        for (const tc of result.toolCalls) {
          if (!allToolCalls.find((ex) => ex.name === tc.name && JSON.stringify(ex.parameters) === JSON.stringify(tc.parameters))) {
            allToolCalls.push(tc);
          }
        }
      }
      assert.equal(allToolCalls.length, 4, 'should extract all 4 tool calls from chunked stream');
      assert.equal(allToolCalls[0].name, 'edit');
      assert.equal(allToolCalls[1].name, 'qwengate-aislop_aislop_why');
      assert.equal(allToolCalls[2].name, 'qwengate-aislop_aislop_scan');
      assert.equal(allToolCalls[3].name, 'qwengate-aislop_aislop_fix');
    });
  });

  describe('cleanTextOfXmlArtifacts', () => {
    it('strips tool call XML from content, keeps surrounding text', () => {
      const input = `Testing tools.\n${TOOL_CALL_EDIT}\nDone.`;
      const result = cleanTextOfXmlArtifacts(input);
      assert.ok(result.cleanedText.includes('Testing tools.'), 'should keep text before tool call');
      assert.ok(result.cleanedText.includes('Done.'), 'should keep text after tool call');
      assert.ok(!result.cleanedText.includes('<function='), 'should strip function tags');
      assert.ok(!result.cleanedText.includes('</function>'), 'should strip closing function tags');
      assert.ok(!result.cleanedText.includes('<parameter='), 'should strip parameter tags');
      assert.ok(!result.cleanedText.includes('</parameter>'), 'should strip closing parameter tags');
      assert.equal(result.toolCalls.length, 1);
    });

    it('strips multiple tool calls from full output', () => {
      const result = cleanTextOfXmlArtifacts(FULL_OUTPUT);
      assert.ok(result.cleanedText.includes('Now testing the remaining tools.'));
      assert.ok(!result.cleanedText.includes('<function='));
      assert.ok(!result.cleanedText.includes('</function>'));
      assert.equal(result.toolCalls.length, 4);
    });
  });

  describe('stripRemainingXmlMarkup — partial/incomplete tags', () => {
    // Import via cleanTextOfXmlArtifacts since stripRemainingXmlMarkup is private
    it('strips bare <function= prefix without name (split across chunks)', () => {
      // This simulates the state when only the prefix "<function=" has arrived
      const input = 'Some text\n<function=';
      const result = cleanTextOfXmlArtifacts(input);
      assert.ok(!result.cleanedText.includes('<function='), 'bare <function= prefix should be stripped');
      assert.ok(result.cleanedText.includes('Some text'));
    });

    it('strips <function=name without closing > (split across chunks)', () => {
      const input = 'Some text\n<function=bash';
      const result = cleanTextOfXmlArtifacts(input);
      assert.ok(!result.cleanedText.includes('<function='), 'incomplete opening tag should be stripped');
      assert.ok(result.cleanedText.includes('Some text'));
    });

    it('strips <function=name> with content but no </function> (incomplete block)', () => {
      const input = 'Before\n<function=bash>\n<parameter=command>ls</parameter>\nAfter';
      const result = cleanTextOfXmlArtifacts(input);
      assert.ok(!result.cleanedText.includes('<function='), 'incomplete block should be stripped');
      assert.ok(result.cleanedText.includes('Before'), 'text before tool call should remain');
      // Content after the unclosed <function= block is stripped too,
      // since there's no </function> to delimit where the block ends
      assert.ok(!result.cleanedText.includes('After'), 'text after unclosed block should be stripped as it may be part of the tool call');
    });

    it('strips stray <parameter= tags without closing', () => {
      const input = 'Text\n<parameter=path\nmore text';
      const result = cleanTextOfXmlArtifacts(input);
      assert.ok(!result.cleanedText.includes('<parameter='), 'bare parameter tag should be stripped');
    });

    it('strips </function leftover from split chunks', () => {
      const input = 'Text\n</function>\nmore';
      const result = cleanTextOfXmlArtifacts(input);
      assert.ok(!result.cleanedText.includes('</function>'), 'closing function tag should be stripped');
    });

    it('strips <function=name with newline inside tag name (fragmented stream)', () => {
      // This simulates Qwen sending "<function=bash\n" where \n is inside the tag
      const input = 'Before\n<function=bash\n>\n<parameter=command>ls</parameter>\n</function>\nAfter';
      const result = cleanTextOfXmlArtifacts(input);
      assert.ok(!result.cleanedText.includes('<function='), 'tag with newline in name should be stripped');
      assert.ok(!result.cleanedText.includes('</function>'));
      assert.ok(result.cleanedText.includes('Before'));
      assert.ok(result.cleanedText.includes('After'));
    });
  });

  describe('chunk-level leak prevention (simulating processStreamData)', () => {
    it('no content delta contains <function= prefix at any chunk boundary', () => {
      // This is the KEY test: simulate the streaming path where each chunk
      // is cleaned and diffed against the previous snapshot. No chunk's delta
      // should ever contain a <function= fragment.
      let snapshot = '';
      for (let i = 0; i < SSE_CHUNKS.length; i++) {
        const accumulated = SSE_CHUNKS.slice(0, i + 1).join('');
        const cleaned = cleanTextOfXmlArtifacts(accumulated).cleanedText;
        // Compute delta from snapshot
        let delta: string;
        if (cleaned.startsWith(snapshot)) {
          delta = cleaned.slice(snapshot.length);
        } else {
          // Not cumulative — compute common prefix
          let j = 0;
          while (j < Math.min(snapshot.length, cleaned.length) && snapshot[j] === cleaned[j]) j++;
          delta = cleaned.slice(j);
        }
        snapshot = cleaned;
        // THE CRITICAL ASSERTION: No delta should ever leak function XML
        assert.ok(
          !delta.includes('<function='),
          `chunk ${i}: delta must not contain <function=. Got: ${JSON.stringify(delta.slice(0, 50))}`,
        );
        assert.ok(
          !delta.includes('</function>'),
          `chunk ${i}: delta must not contain </function>. Got: ${JSON.stringify(delta.slice(0, 50))}`,
        );
      }
    });
  });

  // ── Second log file: logs/gate/2026-06-08_21-15-56.json ──────────────

  const RAW_OUTPUT_2 = `Testing \`edit\`, \`aislop_scan\`, and \`aislop_fix\`:
<function=read>
<parameter=filePath>
/tmp/kilo/tool_test.txt
</parameter>
</function>


<function=qwengate-aislop_aislop_scan>
<parameter=path>
/tmp/kilo
</parameter>
</function>
`;

  const SSE_CHUNKS_2 = [
    'Testing',
    ' `edit`, `',
    'aislop_scan`,',
    ' and `aislop',
    '_fix`:\n',
    '<function=read>',
    '\n<parameter=',
    'filePath>\n/tmp',
    '/kilo/tool_test',
    '.txt\n</parameter',
    '>\n</function',
    '>\n\n',
    '\n<function',
    '=qwengate',
    '-aislop_',
    'aislop_scan>',
    '\n<parameter=path',
    '>\n/tmp/k',
    'ilo\n</parameter',
    '>\n</function',
    '>\n',
  ];

  describe('second log — 21-15-56 (read + aislop_scan)', () => {
    it('extracts tool calls from raw output', () => {
      const result = parseXmlToolCalls(RAW_OUTPUT_2);
      assert.equal(result.toolCalls.length, 2);
      assert.equal(result.toolCalls[0].name, 'read');
      assert.equal(result.toolCalls[1].name, 'qwengate-aislop_aislop_scan');
    });

    it('cleanTextOfXmlArtifacts leaves no XML artifacts', () => {
      const result = cleanTextOfXmlArtifacts(RAW_OUTPUT_2);
      const cleaned = result.cleanedText;
      // All function/parameter XML must be stripped
      assert.ok(!cleaned.includes('<function'), 'no <function tag');
      assert.ok(!cleaned.includes('</function>'), 'no </function> tag');
      assert.ok(!cleaned.includes('<parameter'), 'no <parameter tag');
      assert.ok(!cleaned.includes('</parameter>'), 'no </parameter> tag');
      // Text before the tool call block survives
      assert.ok(cleaned.includes('Testing'), 'text before tool calls survives');
    });

    it('extracts tool calls from accumulated SSE chunks', () => {
      let accumulated = '';
      const allToolCalls: any[] = [];
      for (const chunk of SSE_CHUNKS_2) {
        accumulated += chunk;
        const result = parseXmlToolCalls(accumulated);
        for (const tc of result.toolCalls) {
          if (!allToolCalls.find((ex) => ex.name === tc.name && JSON.stringify(ex.parameters) === JSON.stringify(tc.parameters))) {
            allToolCalls.push(tc);
          }
        }
      }
      assert.equal(allToolCalls.length, 2, 'should extract 2 tool calls');
      assert.equal(allToolCalls[0].name, 'read');
      assert.equal(allToolCalls[1].name, 'qwengate-aislop_aislop_scan');
    });

    it('no content delta leaks XML at any chunk boundary', () => {
      let snapshot = '';
      for (let i = 0; i < SSE_CHUNKS_2.length; i++) {
        const accumulated = SSE_CHUNKS_2.slice(0, i + 1).join('');
        const cleaned = cleanTextOfXmlArtifacts(accumulated).cleanedText;
        let delta: string;
        if (cleaned.startsWith(snapshot)) {
          delta = cleaned.slice(snapshot.length);
        } else {
          let j = 0;
          while (j < Math.min(snapshot.length, cleaned.length) && snapshot[j] === cleaned[j]) j++;
          delta = cleaned.slice(j);
        }
        snapshot = cleaned;
        assert.ok(!delta.includes('<function'), `chunk ${i}: delta must not contain <function. Got: ${JSON.stringify(delta.slice(0, 50))}`);
        assert.ok(
          !delta.includes('</function'),
          `chunk ${i}: delta must not contain </function. Got: ${JSON.stringify(delta.slice(0, 50))}`,
        );
        assert.ok(
          !delta.includes('<parameter'),
          `chunk ${i}: delta must not contain <parameter. Got: ${JSON.stringify(delta.slice(0, 50))}`,
        );
        assert.ok(
          !delta.includes('</parameter'),
          `chunk ${i}: delta must not contain </parameter. Got: ${JSON.stringify(delta.slice(0, 50))}`,
        );
      }
    });
  });
});

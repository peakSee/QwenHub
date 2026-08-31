import { describe, test } from 'bun:test';
import assert from 'node:assert';
import { filterContent } from '../utils/contentFilter.ts';

describe('filterContent - newline preservation', () => {
  test('standalone \\n chunk is preserved, not stripped', () => {
    const result = filterContent('\n');
    // A standalone newline should be preserved, not turned into empty string
    assert.strictEqual(result.cleanText, '\n', 'standalone newline should be preserved');
  });

  test('table header + separator separated by \\n preserves structure', () => {
    // This is the exact content from the log file's raw_output
    const input = '| Lane | Files | Issues |\n|------|-------|--------|';
    const result = filterContent(input);
    assert.ok(result.cleanText.includes('| Lane | Files | Issues |'), 'table header should be present');
    assert.ok(result.cleanText.includes('|------|-------|--------|'), 'table separator should be present');
    // The separator should be on its own line, not merged with header
    const lines = result.cleanText.split('\n');
    const headerIdx = lines.findIndex((l) => l.includes('| Lane |'));
    const sepIdx = lines.findIndex((l) => l.includes('|------|'));
    assert.ok(sepIdx === headerIdx + 1, 'separator should be on the line after header');
  });

  test('chunks from real log file reproduce correct output', () => {
    // These are the exact chunks from logs/gate/2026-06-14_00-33-48.json
    const chunks = [
      'All',
      ' 5 lanes are',
      ' now running —',
      ' dispatched in the previous',
      ' turn',
      ':\n\n| Lane',
      ' |',
      ' Files | Issues |',
      '\n',
      '|------|-------',
      '|--------',
      '|\n| fix',
      '-1 | renderer',
      ' + preload | C',
      '1, C2',
      ', H5 |',
      '\n| fix-',
      '2 | cdp',
      '-injector +',
      ' auto-accept |',
      ' C4, H',
      '1, M2',
      ', M3 |',
      '\n| fix-',
      '3 | ipc-hand',
      'lers + account-manager',
      ' + app-lifecycle',
      ' | C3,',
      ' H3, H',
      '4, M6',
      ' |\n| fix',
      '-4 | index',
      ' + window-manager |',
      ' L1, L',
      '2, L3',
      ', L5,',
      ' M4, M',
      '5, M7',
      ' |\n| fix',
      '-5 | m',
      'cp/proxy +',
      ' skills-manager | L',
      '4, H2',
      ' |\n\nWaiting for',
      ' completion notifications —',
      ' will verify build once',
      ' all ',
      '5 finish.\n\n',
    ];

    // Reconstruct full raw content
    const fullRaw = chunks.join('');
    const result = filterContent(fullRaw);

    // The raw output should contain the table with proper newlines
    const rawLines = fullRaw.split('\n');
    const cleanLines = result.cleanText.split('\n');

    // Verify table structure is intact
    const rawHeaderIdx = rawLines.findIndex((l) => l.includes('| Lane |'));
    const rawSepIdx = rawLines.findIndex((l) => l.includes('|------|'));
    const cleanHeaderIdx = cleanLines.findIndex((l) => l.includes('| Lane |'));
    const cleanSepIdx = cleanLines.findIndex((l) => l.includes('|------|'));

    assert.ok(cleanHeaderIdx >= 0, 'header row should exist in filtered output');
    assert.ok(cleanSepIdx >= 0, 'separator row should exist in filtered output');
    assert.ok(cleanSepIdx === cleanHeaderIdx + 1, 'separator should be immediately after header (no newlines lost)');
  });

  test('double \\n between paragraphs is preserved', () => {
    const input = 'First paragraph\n\nSecond paragraph';
    const result = filterContent(input);
    assert.ok(result.cleanText.includes('First paragraph'), 'first paragraph preserved');
    assert.ok(result.cleanText.includes('Second paragraph'), 'second paragraph preserved');
    // Should have double newline between them
    const parts = result.cleanText.split('Second paragraph');
    assert.ok(parts[0].endsWith('\n\n'), 'double newline between paragraphs should be preserved');
  });

  test('whitespace-only paragraph is preserved as-is', () => {
    // Multiple spaces and tabs should be preserved
    const input = 'Before\n   \nAfter';
    const result = filterContent(input);
    assert.ok(result.cleanText.includes('Before'), 'text before preserved');
    assert.ok(result.cleanText.includes('After'), 'text after preserved');
    // The whitespace paragraph should be present
    const parts = result.cleanText.split('After');
    assert.ok(parts[0].length > 7, 'whitespace paragraph should be preserved');
  });

  test('empty input returns empty', () => {
    const result = filterContent('');
    assert.strictEqual(result.cleanText, '');
  });

  test('null/undefined input returns empty', () => {
    const result = filterContent(null as any);
    assert.strictEqual(result.cleanText, '');
  });
});

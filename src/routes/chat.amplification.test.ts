import assert from 'node:assert';
import test, { describe } from 'node:test';
import { streamChunks } from '../tests/helpers.ts';
import { commonPrefixLen, getNewContent } from './chat.ts';

test('commonPrefixLen detects cumulative chunks', () => {
  const prev = 'Hello world';
  const curr = 'Hello world, this is new';
  const len = commonPrefixLen(prev, curr);
  assert.strictEqual(len, prev.length);
});

test('getNewContent extracts only delta from cumulative', () => {
  const full = 'Hello world, this is new';
  const prev = 'Hello world';
  const delta = getNewContent(full, prev);
  assert.strictEqual(delta, ', this is new');
});

test('snapshot diffing breaks amplification loop', () => {
  // Real scenario: filter reclassifies prefix → one re-emission happens
  // but NEXT chunk finds common prefix → only delta emitted (no loop)

  // Chunk 1: filter keeps "I am analyzing the code"
  const snapshot1 = 'I am analyzing the code';
  // Emit all (first chunk)

  // Chunk 2: filter reclassifies → prefix changes
  const snapshot2 = 'the code and here is result';
  const delta2 = getNewContent(snapshot2, snapshot1);
  // Zero common prefix → full re-emission (expected, one-time)
  assert.strictEqual(delta2, snapshot2);

  // Chunk 3: more content appended, filter stable
  const snapshot3 = 'the code and here is result, plus more stuff';
  const delta3 = getNewContent(snapshot3, snapshot2);
  // Common prefix = snapshot2 length → only new part emitted
  assert.strictEqual(delta3, ', plus more stuff');

  // Key: no loop. After one re-emission, stable prefix → only deltas.
});

test('getNewContent handles zero common prefix', () => {
  const prev = 'completely different';
  const curr = 'new content here';
  const delta = getNewContent(curr, prev);
  assert.strictEqual(delta, curr);
});

test('getNewContent handles exact duplicate (retry)', () => {
  const prev = 'same content';
  const curr = 'same content';
  const delta = getNewContent(curr, prev);
  assert.strictEqual(delta, '');
});

test('getNewContent handles empty inputs', () => {
  assert.strictEqual(getNewContent('', ''), '');
  assert.strictEqual(getNewContent('', 'prev'), '');
  assert.strictEqual(getNewContent('new', ''), 'new');
});

test('commonPrefixLen handles empty strings', () => {
  assert.strictEqual(commonPrefixLen('', ''), 0);
  assert.strictEqual(commonPrefixLen('abc', ''), 0);
  assert.strictEqual(commonPrefixLen('', 'abc'), 0);
});

test('commonPrefixLen handles partial overlap', () => {
  assert.strictEqual(commonPrefixLen('abcdef', 'abcxyz'), 3);
  assert.strictEqual(commonPrefixLen('abc', 'xyz'), 0);
  assert.strictEqual(commonPrefixLen('abc', 'abcdef'), 3);
});

describe('streaming delta simulation', () => {
  test('streaming: snapshot diffing extracts only new content across chunks', () => {
    const text = 'The quick brown fox jumps over the lazy dog and then runs across the open field towards the setting sun';
    const chunks = streamChunks(text);
    let snapshot = '';
    const emitted: string[] = [];

    for (const chunk of chunks) {
      const delta = getNewContent(chunk, snapshot);
      if (delta.length > 0) {
        emitted.push(delta);
        snapshot = chunk;
      }
    }

    const reconstructed = emitted.join('');
    assert.strictEqual(reconstructed, text, 'deltas should reconstruct the full text exactly');
  });

  test('streaming: cumulative chunks are correctly deduplicated', () => {
    const words = ['Hello', ' ', 'world', ', ', 'this', ' ', 'is', ' ', 'streaming', ' ', 'text', ' ', 'with', ' ', 'more', ' ', 'words'];
    const cumulativeChunks: string[] = [];
    for (let i = 0; i < words.length; i++) {
      cumulativeChunks.push(words.slice(0, i + 1).join(''));
    }

    let snapshot = '';
    const deltas: string[] = [];

    for (const chunk of cumulativeChunks) {
      const delta = getNewContent(chunk, snapshot);
      if (delta.length > 0) {
        deltas.push(delta);
        snapshot = chunk;
      }
    }

    const result = deltas.join('');
    assert.strictEqual(result, words.join(''), 'cumulative chunks should produce each word exactly once');
    for (let i = 0; i < cumulativeChunks.length; i++) {
      if (i === 0) {
        assert.strictEqual(deltas[i], cumulativeChunks[i], 'first delta is full first chunk');
      } else if (deltas[i]) {
        const expectedDelta = cumulativeChunks[i].slice(cumulativeChunks[i - 1].length);
        assert.strictEqual(deltas[i], expectedDelta, `delta ${i} should be the new suffix`);
      }
    }
  });

  test('streaming: empty chunks produce no deltas', () => {
    const snapshot = 'some existing content';
    const emptyChunks = ['', '', '', ''];
    const deltas: string[] = [];

    let currentSnapshot = snapshot;
    for (const chunk of emptyChunks) {
      const delta = getNewContent(chunk, currentSnapshot);
      if (delta.length > 0) {
        deltas.push(delta);
        currentSnapshot = chunk;
      }
    }

    assert.strictEqual(deltas.length, 0, 'empty chunks should produce zero deltas');
    assert.strictEqual(currentSnapshot, snapshot, 'snapshot should remain unchanged');
  });

  test('streaming: rapid small chunks still produce correct output', () => {
    const text = 'one two three four five six seven eight nine ten';
    const words = text.split(/(\s+)/);
    const smallChunks: string[] = [];
    for (let i = 0; i < words.length; i += 2) {
      smallChunks.push(words.slice(0, i + 1).join(''));
    }
    if (smallChunks[smallChunks.length - 1] !== text) {
      smallChunks.push(text);
    }

    let snapshot = '';
    const deltas: string[] = [];

    for (const chunk of smallChunks) {
      const delta = getNewContent(chunk, snapshot);
      if (delta.length > 0) {
        deltas.push(delta);
        snapshot = chunk;
      }
    }

    const result = deltas.join('');
    assert.strictEqual(result, text, 'small chunks should reconstruct the full text');
  });
});

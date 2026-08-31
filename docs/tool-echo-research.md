# Tool Result Echo Prevention — Research Findings

## Problem
When agent harness sends tool results back to LLM, the LLM echoes/repeats tool result content in its streamed response. This:
1. Overflows context window (tool results already in context, echoing creates duplicates)
2. Pollutes chat UI
3. LLM doesn't truly think about tool output — it's busy echoing

## Key Insight
**Neither Anthropic nor OpenAI consider echo prevention their responsibility.** It's treated as a prompt engineering concern. The most robust wrappers (Claude Code, Coder Mux, OpenClaw) all implement client-side filtering as a safety net because system prompts alone are unreliable — models sometimes still echo despite instructions.

## Three-Layer Defense Pattern

### Layer 1: System Prompt (add to every request)
```
## Tool Result Handling
- Tool results are processed by the system and rendered to the user automatically.
- After <tool_result> blocks, do NOT copy, repeat, or echo the raw tool result content.
- If the user asks about a tool result, summarize it in your own words
  rather than quoting it verbatim.
```

### Layer 2: Tool Description Instructions (per-tool)
```json
{
  "name": "search_docs",
  "description": "Search documentation. Results are rendered automatically — do not repeat them in your response.",
  "parameters": {}
}
```

### Layer 3: Client-Side Post-Processing
```typescript
function deduplicateToolEcho(response: string, toolResults: string[]): string {
  for (const result of toolResults) {
    if (result.length > 200 && response.includes(result.slice(0, 200))) {
      // Strip the echoed portion, keep synthesis
      return response.replace(result, '[tool result summarized above]');
    }
  }
  return response;
}
```

## Production Implementations Found

### Claude Code (Anthropic)
- Has `filterToolResultMediaUrls()` — filters specific content types from tool results before sending to model
- Filters media URLs to prevent model from echoing them
- Location: internal Anthropic codebase

### Anthropic System Prompt Pattern
```
After receiving tool results:
- DO NOT output the content of the tool results as-is
- Instead, provide your own analysis, summary, or next steps
- Tool results are shown to the user separately
```

### OpenAI Function Calling
- API-level separation: tool results are `role: "tool"` messages, separate from assistant responses
- For proxies that flatten messages into a single prompt, this becomes a prompt concern
- OpenAI Cookbook recommends: "Instruct the model to synthesize tool outputs rather than repeat them"

## Algorithms for Client-Side Filtering

### Simple Substring Match (Fast, Good Enough)
- Check if response contains first 200 chars of any tool result
- If match found, strip that portion
- O(n) per chunk, works in streaming

### Line-Level Fingerprinting (More Precise)
- Extract lines from each tool result
- Normalize: trim + lowercase + collapse whitespace
- Store in Set<string> for O(1) lookup
- Filter output lines against fingerprint set
- Allows brief references, blocks full echoes

### SimHash / MinHash (Production-Grade)
- Create hash fingerprints of tool result content
- Compare output chunks against fingerprints
- Threshold-based: allows partial matches
- More complex but catches paraphrased echoes

## Current Implementation Status

### Already Done
- System prompt instruction at line 465-466 of `chat.ts`:
  - `<tool_result>` echo prevention rule
  - `MANDATORY TOOL RESULT REVIEW` instruction

### Still Needed
- Client-side post-processing filter in streaming pipeline
- Line-level fingerprint matching
- Integration into `StreamingContentFilter` class

## Production Algorithm: Two-Stage SimHash + Jaccard Filter

Source: Research from production dedup libraries (openmemory-js, simhash-js), Google's original SimHash paper.

### Why Two-Stage
- **Stage 1 (SimHash)**: Fast gate — 16 hex char hash, O(16) hamming distance check. Rejects 99% of non-echoes instantly.
- **Stage 2 (Jaccard)**: Exact tiebreaker — only runs on SimHash collisions (rare). Prevents false positives where two short lines happen to hash similarly.

### Architecture

```typescript
class StreamingEchoFilter {
  private recentHashes: { simhash: string; tokens: Set<string> }[] = [];
  private windowSize = 50; // lines

  isEcho(line: string): boolean {
    const sh = compute_simhash(line);
    for (const entry of this.recentHashes) {
      // Stage 1: fast SimHash gate
      if (hamming_dist(sh, entry.simhash) > 3) continue;
      // Stage 2: exact Jaccard on SimHash collision
      const tokens = canonical_token_set(line);
      if (jaccardSimilarity(tokens, entry.tokens) > 0.7) return true;
    }
    this.recentHashes.push({ simhash: sh, tokens: canonical_token_set(line) });
    if (this.recentHashes.length > this.windowSize) this.recentHashes.shift();
    return false;
  }
}
```

### Why This Works for Streaming LLM Output
1. **Per-line granularity** — call `isEcho()` at each `\n` boundary in chunk parser
2. **Stage 1** rejects 99% of non-duplicates in ~16 operations
3. **Stage 2** only runs on collisions — prevents false positives
4. **Ring buffer** keeps memory bounded at O(50 × avg_line_tokens)

### Tokenization
For LLM echo detection, use **light** tokenization (lowercase + strip punctuation + split on whitespace). NOT semantic tokenization (stemming, synonyms) — we're detecting verbatim echoes, not semantic similarity.

### Key Libraries Found
- `simhash-js` (npm) — pure JS SimHash implementation
- `openmemory-js` (CaviraOSS) — has `canonical_token_set` in `utils/text.ts`
- Google's original SimHash paper: "Detecting Near-Duplicates for Web Crawling" (2006)

## Implementation Plan

### Layer 1 (Already Done)
- System prompt instruction at line 465-466 of `chat.ts`
- `MANDATORY TOOL RESULT REVIEW` instruction

### Layer 2: Client-Side Filter (Next)

#### Files to Create
- `src/routes/pipeline/ToolResultEchoFilter.ts` — Two-stage SimHash + Jaccard filter class
- `src/routes/pipeline/ToolResultEchoFilter.test.ts` — Tests

#### Files to Modify
- `src/routes/chat.ts`:
  - Extract tool result contents from input messages (lines 417-434)
  - Instantiate `ToolResultEchoFilter` with extracted contents
  - Apply filter in streaming pipeline (line ~1137 where `cleanedText` is processed)
  - Apply filter in non-streaming path (line ~736 where `filteredContent` is built)

#### Algorithm for Our Use Case
1. Before sending to Qwen: extract all tool result contents, split into lines
2. Build fingerprint set: normalize each line → compute SimHash + token set
3. During streaming: for each output line, check against fingerprints
4. Suppress echoed lines, allow brief references and original analysis

#### SimHash Parameters
- Hash size: 64-bit (16 hex chars)
- Hamming distance threshold: 3 (allows minor variations)
- Jaccard similarity threshold: 0.7 (blocks substantial echoes, allows summaries)
- Ring buffer size: 100 lines (covers typical tool result sizes)

## Next Steps
1. Implement `ToolResultEchoFilter` with SimHash + Jaccard two-stage filter
2. Integrate into streaming pipeline after `StreamingContentFilter`
3. Add to non-streaming path
4. Test with real tool results from OpenCode

# qwenhub Full Codebase Audit

**Date:** June 2026
**Auditors:** @oracle (architecture, security), @explorer (code health, performance)
**Scope:** Architecture, code quality, performance, error handling, security, infrastructure

---

## Table of Contents

- [Critical Findings](#critical-findings)
- [High Priority Findings](#high-priority-findings)
- [Medium Priority Findings](#medium-priority-findings)
- [Low Priority Findings](#low-priority-findings)
- [Architecture Issues](#architecture-issues)
- [Code Health Issues](#code-health-issues)
- [Performance Issues](#performance-issues)
- [Security Issues](#security-issues)
- [Infrastructure Issues](#infrastructure-issues)

---

## Critical Findings

| # | ID | Issue | Location |
|---|-----|-------|----------|
| 1 | S-1 | API key injected into dashboard HTML | `dashboardRoutes.ts:29` |
| 2 | S-17 | Body size limit bypassed via chunked encoding | `index.tsx:143-148` |
| 3 | P-1,2,4 | O(n²) buffer accumulation in stream hot path | `streamLoop.ts:63-65`, `chatStreamingHelpers.ts:140-270` |
| 4 | P-3 | Idle timeout recreated per chunk (Promise/setTimeout) | `streamLoop.ts:49-56` |
| 5 | P-20 | Timeout not cleared on fetch error | `sessionPool.ts:253-267` |
| 6 | P-22 | Silent auth token refresh failure → cascading 401s | `playwright.ts:354` |
| 7 | P-17 | Session pool race condition exceeds max sessions | `sessionPool.ts:115,188-206` |
| 8 | S-4 | `/debug/network` unauthenticated, leaks auth data | `index.tsx:119` |

---

## High Priority Findings

| # | ID | Issue | Location |
|---|-----|-------|----------|
| 9 | A-3 | Circular dependency risk (auth↔playwright↔qwen) | Multiple services |
| 10 | A-4 | Global singleton overuse, tight coupling | logStore, config, sessionPool |
| 11 | A-24 | Config errors swallowed as warnings | `auth.ts:395-397` |
| 12 | H-2 | Console override loses terminal output | `index.tsx:39-46` |
| 13 | H-4,5,6 | Silent `.catch(() => {})` in pool/playwright/login | Multiple files |
| 14 | S-8 | CI uses Node instead of Bun | `.github/workflows/ci.yml` |
| 15 | S-2,3,15 | 3 different auth patterns, config auth static | `index.tsx`, `utils/auth.ts` |
| 16 | P-14 | `reader.cancel()` not awaited before `releaseLock()` | `cleanupHelpers.ts:71-72` |
| 17 | P-23 | No JSON parse error handling on chat endpoint | `chat.ts:32` |
| 18 | A-29 | Shared browser instance — session contamination | `playwright.ts` |

---

## Medium Priority Findings

| # | ID | Issue | Location |
|---|-----|-------|----------|
| 19 | A-1 | God module index.tsx (352 lines) | `index.tsx` |
| 20 | A-9,10 | `any` types in auth check & safeTruncate | `utils/auth.ts:27`, `chatHelpersCore.ts` |
| 21 | A-2 | Mixed `.ts`/`.js` import extensions | Multiple files |
| 22 | A-20, H-3 | Dead exports (disableNativeTools, etc.) | `qwen.ts`, `qwenModels.ts` |
| 23 | M-4,5,6,7 | `as any` casts (6+ instances) | chat.ts, sessionPool.ts, systemLogger.ts, tests |
| 24 | P-9 | Rate limit buckets grow unbounded | `rateLimit.ts:14` |
| 25 | P-6 | `Array.unshift()` is O(n) per log insert | `logStore.ts:176` |
| 26 | S-5 | No request body schema validation | `chat.ts:31-32` |
| 27 | S-10,11 | Dockerfile: full node_modules + unpinned base | `Dockerfile` |
| 28 | P-15 | No backpressure in wrapped ReadableStream | `qwen.ts:310-361` |
| 29 | P-29 | Mid-stream errors not retried | `qwen.ts:109-362` |
| 30 | A-27 | Inconsistent error response structure | `chat.ts:260-275` |

---

## Low Priority Findings

| # | Category | Issues |
|---|----------|--------|
| 31 | Dead code | H-1 unused vars, P-33 duplicate function, L-1/L-2 narrative comments |
| 32 | Config | S-6 CORS hardcoded, S-12 no .env.example, S-13 wrong main, L-6 package.json |
| 33 | Style | M-9 hardcoded URLs, A-6 magic strings, P-28 hardcoded timeout |
| 34 | Testing | S-20 minimal tests, no coverage threshold |
| 35 | Logging | M-11,12,13 console.* in production code, P-25 disk write errors silent |

---

## Architecture Issues

### A-1: God Module — index.tsx (352 lines)
- **Location:** `src/index.tsx:1-352`
- **Severity:** high
- **Issue:** Single file handles routing, middleware, browser init, auth, and server startup
- **Fix:** Extract into `bootstrap.ts`, `serverSetup.ts`, and `browserInit.ts` modules

### A-2: Inconsistent Import Extensions
- **Location:** `src/services/auth.ts:11-12`
- **Severity:** medium
- **Issue:** Mix of `.ts` and `.js` extensions in imports (line 11: `./playwright.ts`, line 12: `./logStore.js`)
- **Fix:** Standardize on `.ts` extensions for all local imports

### A-3: Circular Dependency Risk
- **Location:** `src/services/auth.ts`, `src/services/qwen.ts`, `src/services/playwright.ts`
- **Severity:** high
- **Issue:** auth imports playwright, qwen imports auth, creating potential circular dependencies
- **Fix:** Introduce dependency injection or event-based communication between these services

### A-4: Global Singleton Overuse
- **Location:** Multiple files export singletons (`logStore`, `config`, `sessionPool`, `registry`, `modelRouter`)
- **Severity:** high
- **Issue:** Hard to test, hidden dependencies, tight coupling
- **Fix:** Use dependency injection container or pass dependencies explicitly to functions

### A-5: Unsafe Error Typing
- **Location:** `src/index.tsx:348`, `src/services/auth.ts:395`
- **Severity:** medium
- **Issue:** `.catch((err: any)` — using `any` for error types loses type safety
- **Fix:** Use `.catch((err: unknown)` and narrow with type guards or `instanceof Error`

### A-6: Magic Strings
- **Location:** `src/utils/auth.ts:32`, `src/routes/chat.ts:271`
- **Severity:** low
- **Issue:** Hardcoded strings like `"Bearer "`, `"server_error"` scattered across files
- **Fix:** Extract to constants file

### A-7: Complex Nested Logic
- **Location:** `src/routes/chat.ts:40-276`
- **Severity:** medium
- **Issue:** Multiple nested try-catch blocks make error flow hard to follow
- **Fix:** Extract error handling into separate functions, use early returns

### A-8: Re-export Anti-pattern
- **Location:** `src/routes/chatHelpers.ts:12`, `src/services/qwen.ts:10`
- **Severity:** low
- **Issue:** `export * from "./chatHelpersCore.ts"` obscures where functions actually live
- **Fix:** Explicitly export only what's needed or import directly from source

### A-9: Parameter Typed as `any`
- **Location:** `src/utils/auth.ts:27`
- **Severity:** high
- **Issue:** `checkApiKeyAuth(c: any)` — loses all type safety
- **Fix:** Import Hono's `Context` type: `checkApiKeyAuth(c: Context)`

### A-10: Unsafe `any` in Utility Function
- **Location:** `src/routes/chatHelpersCore.ts:5-17`
- **Severity:** medium
- **Issue:** `safeTruncate(val: any, maxLen = 200): any` — recursive function with `any` types
- **Fix:** Use `unknown` and proper type narrowing with discriminated unions

### A-11: Non-null Assertion
- **Location:** `src/tools/schema.ts:129`
- **Severity:** low
- **Issue:** `schema.if!` — assumes property exists without validation
- **Fix:** Add explicit check: `if (!schema.if) return value`

### A-12: Weak Generic Types
- **Location:** `src/types/openai.ts:8-17`
- **Severity:** medium
- **Issue:** `JsonSchema` interface has many optional fields with `unknown` types
- **Fix:** Use discriminated unions based on `type` field for better type narrowing

### A-13: Service Layer Tight Coupling
- **Location:** `src/services/qwen.ts:1-10`
- **Severity:** high
- **Issue:** Directly imports and uses 7 other services, creating tight coupling
- **Fix:** Inject dependencies or use a service locator pattern with interfaces

### A-14: Missing Abstraction for Retry Logic
- **Location:** `src/utils/retry.ts`
- **Severity:** medium
- **Issue:** Retry logic with circuit breaker exists but may be duplicated or misused
- **Fix:** Ensure consistent use across all HTTP calls, document when to use vs not

### A-15: Leaky Abstraction in Message Building
- **Location:** `src/routes/chatHelpers.ts:14-316`
- **Severity:** medium
- **Issue:** `buildQwenMessages` exposes internal Qwen API details to route handlers
- **Fix:** Create a message adapter interface that hides Qwen-specific transformations

### A-16: Hardcoded Constants
- **Location:** `src/routes/chatNonStreaming.ts:16`
- **Severity:** low
- **Issue:** `MAX_TOOL_CALLS_PER_TURN = 8` hardcoded in implementation file
- **Fix:** Move to config or constants file

### A-17: Complex State Management
- **Location:** `src/routes/chatStreaming.ts:139-144`
- **Severity:** medium
- **Issue:** Multiple mutable state variables for stream processing
- **Fix:** Encapsulate in a `StreamProcessor` class with clear state transitions

### A-18: Hidden Side Effects
- **Location:** `src/services/auth.ts:395-398`
- **Severity:** medium
- **Issue:** Fire-and-forget `configureAccount(email).catch()` — error handling unclear
- **Fix:** Return promise or explicitly handle logging with structured error object

### A-19: Regex Pattern Duplication
- **Location:** `src/routes/chatHelpers.ts:15-17`
- **Severity:** low
- **Issue:** Multiple regex patterns for tag stripping defined inline
- **Fix:** Extract to `src/utils/regexPatterns.ts` with named exports

### A-20: Unused Exports
- **Location:** `src/services/qwen.ts:10`
- **Severity:** medium
- **Issue:** Re-exports `disableNativeTools`, `setCustomInstruction`, `disablePersonalization` that are never called
- **Fix:** Remove exports and implementations from `qwenModels.ts`

### A-21: Potentially Unreachable Code
- **Location:** `src/cluster.ts:97`
- **Severity:** low
- **Issue:** `setTimeout(() => process.exit(0), 3_000)` after signal handlers
- **Fix:** Add force-kill fallback: `setTimeout(() => process.exit(1), 5_000).unref()`

### A-22: Unused Import
- **Location:** `src/index.tsx:23`
- **Severity:** low
- **Issue:** `fileURLToPath` imported but may not be used
- **Fix:** Remove if unused

### A-23: Timing Attack Mitigation Incomplete
- **Location:** `src/utils/auth.ts:6-19`
- **Severity:** high
- **Issue:** `safeCompare` pads buffers but length mismatch still leaks information via padding operation
- **Fix:** Use `crypto.timingSafeEqual` directly on equal-length buffers, reject length mismatches early with constant-time response

### A-24: Error Swallowing
- **Location:** `src/services/auth.ts:395-397`
- **Severity:** high
- **Issue:** `.catch((err: any) => logStore.log('warn', ...))` — critical config errors only logged as warnings
- **Fix:** Log as error, consider failing fast or implementing retry

### A-25: Missing Input Validation
- **Location:** `src/routes/chat.ts:40-60`
- **Severity:** high
- **Issue:** Request body parsed but not validated against OpenAI schema
- **Fix:** Use Zod or similar for runtime validation before processing

### A-26: Resource Leak Risk
- **Location:** `src/routes/chatStreaming.ts`, `src/routes/chatNonStreaming.ts`
- **Severity:** high
- **Issue:** Stream cleanup in finally blocks but reader cancellation may fail silently
- **Fix:** Add explicit resource tracking with weak references or finalization registry

### A-27: Inconsistent Error Responses
- **Location:** `src/routes/chat.ts:260-275`
- **Severity:** medium
- **Issue:** Error response structure varies between different error types
- **Fix:** Standardize on OpenAI error format with consistent fields

### A-28: No Request ID Tracking
- **Location:** Throughout codebase
- **Severity:** medium
- **Issue:** Logs use various identifiers but no consistent request ID for tracing
- **Fix:** Generate UUID at request start, pass through context, include in all logs

### A-29: Browser State Pollution
- **Location:** `src/services/playwright.ts`
- **Severity:** high
- **Issue:** Shared browser instance across all accounts — cookie/session contamination risk
- **Fix:** Use browser contexts or separate browser instances per account

### A-30: Missing Health Checks
- **Location:** `src/index.tsx`
- **Severity:** medium
- **Issue:** No `/health` endpoint for monitoring or load balancer checks
- **Fix:** Add health endpoint checking browser status, account availability, and service health

### A-31: Configuration Validation
- **Location:** `src/services/configService.ts`
- **Severity:** medium
- **Issue:** Config loaded but not validated for required fields or valid ranges
- **Fix:** Add schema validation with clear error messages for misconfiguration

### A-32: Session Pool Exhaustion
- **Location:** `src/services/sessionPool.ts`
- **Severity:** high
- **Issue:** No visible backpressure mechanism when all sessions are in use
- **Fix:** Implement queue with timeout or return 503 with Retry-After header

---

## Code Health Issues

### H-1: Unused Variables
- **Location:** `src/index.tsx:37-38`
- **Severity:** high
- **Issue:** `_origWarn` and `_origError` captured but never used
- **Fix:** Remove or use them to restore console methods during shutdown

### H-2: Console Override Loses Terminal Output
- **Location:** `src/index.tsx:39-46`
- **Severity:** high
- **Issue:** Console override doesn't call original methods, losing terminal output
- **Fix:** Call `_origWarn(...args)` and `_origError(...args)` after logging

### H-3: Dead Exports in qwen.ts
- **Location:** `src/services/qwen.ts:10`
- **Severity:** high
- **Issue:** Re-exports `disableNativeTools`, `disablePersonalization`, `setCustomInstruction` — never called
- **Fix:** Remove dead exports

### H-4: Silent Catch in Session Pool
- **Location:** `src/services/sessionPool.ts:99,221`
- **Severity:** high
- **Issue:** `.catch(() => {})` on pool replenishment
- **Fix:** Log errors: `.catch(err => logStore.log('warn', 'pool', err.message))`

### H-5: Silent Catch in Playwright
- **Location:** `src/services/playwright.ts:321,354`
- **Severity:** high
- **Issue:** `.catch(() => {})` on context close and async operations
- **Fix:** Add error logging

### H-6: Silent Catch in Login Helpers
- **Location:** `src/services/loginHelpers.ts:299`
- **Severity:** high
- **Issue:** `.catch(() => {})` on waitForURL
- **Fix:** Log timeout errors

### H-7: Empty Catch in TimingSafeEqual
- **Location:** `src/utils/auth.ts:16`
- **Severity:** high
- **Issue:** Empty catch block
- **Fix:** Add comment explaining expected behavior for length mismatch

### H-8: Ignored JSON Parse Error
- **Location:** `src/utils/json.ts:211`
- **Severity:** high
- **Issue:** Catch block with `_e` ignored
- **Fix:** Add comment or minimal logging

### H-9: Ignored Network Debug Error
- **Location:** `src/services/networkDebug.ts:80`
- **Severity:** high
- **Issue:** Catch block with `_error` ignored
- **Fix:** Log file write errors

### H-10: Ignored Stream Processing Error
- **Location:** `src/routes/chatStreaming.ts:118`
- **Severity:** high
- **Issue:** Catch block with `_e` ignored
- **Fix:** Log stream processing errors

### M-1: Mixed Import Extensions for logStore
- **Location:** `src/services/sessionPool.ts:5` vs `src/services/auth.ts:12`
- **Severity:** medium
- **Issue:** Mixed `.js` and `.ts` imports for logStore
- **Fix:** Standardize to `.ts`

### M-2: Stale Comment in logStore
- **Location:** `src/services/logStore.ts:5`
- **Severity:** medium
- **Issue:** Comment references extracted SystemLogger but file still contains system logging code
- **Fix:** Update comment or complete extraction

### M-3: @ts-ignore for Bun APIs
- **Location:** `src/index.tsx:278,280`
- **Severity:** medium
- **Issue:** `@ts-ignore` comments for Bun-specific APIs
- **Fix:** Use proper type guards: `if (typeof Bun !== 'undefined')`

### M-4: `as any` in Chat Route
- **Location:** `src/routes/chat.ts:42-44`
- **Severity:** medium
- **Issue:** Multiple `as any` casts to attach metadata to error
- **Fix:** Create typed `GatewayError` class

### M-5: `as any` in Session Pool
- **Location:** `src/services/sessionPool.ts:56`
- **Severity:** medium
- **Issue:** `as any` cast to access config.get()
- **Fix:** Fix type definition

### M-6: `as any` in System Logger
- **Location:** `src/services/systemLogger.ts:122,129`
- **Severity:** medium
- **Issue:** `as any` casts on log store access
- **Fix:** Define proper interface

### M-7: `as any` in Tests
- **Location:** `src/tests/index.test.ts:28,54,145,187,248,266`
- **Severity:** medium
- **Issue:** 6 instances of `as any` for fetch mocking
- **Fix:** Create typed `MockFetch` helper

### M-8: Hardcoded SVG Namespace
- **Location:** `src/routes/dashboard/settings.ts:1`
- **Severity:** medium
- **Fix:** Extract to constants file

### M-9: Hardcoded Qwen URLs
- **Location:** `src/services/browserProfiles.ts:173-174,227-228`
- **Severity:** medium
- **Issue:** Hardcoded `https://chat.qwen.ai` URLs instead of using `QWEN_BASE_URL`
- **Fix:** Use existing constant

### M-10: Hardcoded CLI URLs/Ports
- **Location:** `src/cli.ts:32,43,100`
- **Severity:** medium
- **Fix:** Read from config or environment variables

### M-11: Console.warn/error in qwenModels
- **Location:** `src/services/qwenModels.ts:274,302`
- **Severity:** medium
- **Fix:** Use `logStore.log()` instead

### M-12: Console.error in Route Handlers
- **Location:** `src/routes/accounts.ts:56,77,118,142`
- **Severity:** medium
- **Fix:** Use `logStore.log('error', ...)` for consistency

### M-13: Console.warn in index.tsx
- **Location:** `src/index.tsx:249`
- **Severity:** medium
- **Fix:** Use logStore after initialization

### L-1: Narrative Comments in cluster.ts
- **Location:** `src/cluster.ts:48,53,73,78,80,96`
- **Severity:** low
- **Fix:** Remove comments explaining obvious control flow

### L-2: Narrative Comments in cli.ts
- **Location:** `src/cli.ts:106,125`
- **Severity:** low
- **Fix:** Remove comments explaining obvious operations

### L-5: Stale Canary Token Comment
- **Location:** `src/services/defaultSystemPrompt.ts:98`
- **Severity:** low
- **Fix:** Remove if not relevant

### L-6: Wrong package.json main
- **Location:** `package.json:5`
- **Severity:** low
- **Issue:** `"main": "index.js"` but actual entry is `src/index.tsx`
- **Fix:** Update to `"main": "src/index.tsx"` or remove

### L-7: Static JSON in src/
- **Location:** `src/models.json`
- **Severity:** low
- **Fix:** Move to `data/` or `config/` directory

---

## Performance Issues

### P-1: O(n²) Buffer Accumulation in Hot Path
- **Location:** `src/routes/streamLoop.ts:63`
- **Severity:** high
- **Issue:** `bufferRef.text += rawDecoded` concatenates to a growing string on every chunk. JS strings are immutable, so each `+=` allocates a new string copying all previous content.
- **Fix:** Use an array of chunks and join at parse boundaries, or process incrementally

### P-2: Full Buffer Split on Every Chunk
- **Location:** `src/routes/streamLoop.ts:65`
- **Severity:** high
- **Issue:** `bufferRef.text.split('\n')` splits the entire accumulated buffer on every SSE chunk. For a 1000-chunk response this is O(n²) total work.
- **Fix:** Track last processed index and only split the new portion

### P-3: Idle Timeout Recreated Per Chunk
- **Location:** `src/routes/streamLoop.ts:49-56`
- **Severity:** high
- **Issue:** A new `setTimeout`, `Promise`, and rejection closure are allocated for every single `reader.read()` call
- **Fix:** Use a single long-lived timer that resets rather than creating new pairs each iteration

### P-4: O(n²) Accumulated Content Processing Per Chunk
- **Location:** `src/routes/chatStreamingHelpers.ts:140-270`
- **Severity:** high
- **Issue:** `processStreamData` calls `getSnapshotDelta`, `filterContent`, `extractDeltaContent`, and `cleanTextOfXmlArtifacts` on growing accumulated strings every chunk
- **Fix:** Process deltas incrementally using `lastProcessedPosition`

### P-5: Character-by-Character Prefix Comparison
- **Location:** `src/routes/chatHelpersCore.ts:23-27`
- **Severity:** medium
- **Issue:** `commonPrefixLen` iterates character-by-character on potentially very long strings every chunk
- **Fix:** Use `lastParsePosition` to skip already-matched prefixes

### P-6: O(n) Array.unshift() Per Log Insert
- **Location:** `src/services/logStore.ts:176`
- **Severity:** medium
- **Issue:** `this.entries.unshift(entry)` shifts all existing entries on every new log entry
- **Fix:** Use `push()` and reverse iteration order, or circular buffer

### P-7: New TextDecoder Per Non-Streaming Request
- **Location:** `src/routes/chatNonStreaming.ts:66`
- **Severity:** low
- **Fix:** Reuse `sharedDecoder` from `streamLoop.ts`

### P-8: ToolSpamGuard Array Copies
- **Location:** `src/routes/chatHelpersCore.ts:159-162`
- **Severity:** low
- **Issue:** `history.slice(-this.window)` + `.filter()` allocates two arrays per tool call validation
- **Fix:** Use ring buffer or iterate backwards

### P-9: Rate Limit Buckets Grow Unbounded
- **Location:** `src/middleware/rateLimit.ts:14`
- **Severity:** medium
- **Issue:** `buckets` Map has no max size. Cleanup runs every 5 minutes but bursts can grow it indefinitely
- **Fix:** Add max size cap (e.g., 10k entries) with LRU eviction

### P-10: Per-Entry Raw Chunk Arrays
- **Location:** `src/services/logStore.ts:194-196`
- **Severity:** medium
- **Issue:** Each `LogEntry.qwenRawChunks` stores up to `MAX_CHUNKS_PER_ENTRY` strings. With many concurrent streams, total memory is `concurrent_requests × MAX_CHUNKS × avg_chunk_size`
- **Fix:** Stream chunks to disk incrementally or reduce `MAX_CHUNKS_PER_ENTRY`

### P-11: Network Debug Entries Unbounded
- **Location:** `src/services/networkDebug.ts:34-38`
- **Severity:** medium
- **Issue:** `entries` array accumulates with full request/response bodies. No visible max size or cleanup
- **Fix:** Add max entries cap with oldest-first eviction

### P-12: String Concatenation for rawFullContent
- **Location:** `src/services/logStore.ts:197-204`
- **Severity:** low
- **Issue:** `entry.rawFullContent += chunk` in a loop causes repeated allocations
- **Fix:** Use array of segments and join once

### P-13: Idle Timeout Timer Leaks on Error
- **Location:** `src/routes/streamLoop.ts:51-57`
- **Severity:** medium
- **Issue:** If `reader.read()` throws, the `idleTimer` is never cleared
- **Fix:** Wrap `Promise.race` in try/finally that clears `idleTimer`

### P-14: reader.cancel() Not Awaited
- **Location:** `src/routes/cleanupHelpers.ts:71-72`
- **Severity:** medium
- **Issue:** `streamReader.cancel()` is async but called synchronously. `releaseLock()` may execute before cancel completes
- **Fix:** `await streamReader.cancel()` or chain `.then(() => reader.releaseLock())`

### P-15: No Backpressure in Wrapped ReadableStream
- **Location:** `src/services/qwen.ts:310-361`
- **Severity:** medium
- **Issue:** Upstream `reader.read()` in pull function doesn't respect downstream consumer speed
- **Fix:** Use `TransformStream` instead of manual ReadableStream wrapping

### P-16: No Overall Timeout for Non-Streaming
- **Location:** `src/routes/chatNonStreaming.ts`
- **Severity:** medium
- **Issue:** No total-time timeout, only per-chunk idle timeout. Slow upstream could hold connection indefinitely
- **Fix:** Add `AbortSignal.timeout()` wrapping entire accumulation

### P-17: Session Pool Race Condition
- **Location:** `src/services/sessionPool.ts:115,188-206`
- **Severity:** medium
- **Issue:** `activeCount++` and waiter resolution are not atomic. Two concurrent `acquire()` calls could both proceed, exceeding pool limit
- **Fix:** Use mutex/semaphore around pool state mutations

### P-18: Circuit Breaker Half-Open Race
- **Location:** `src/utils/retry.ts:96-110`
- **Severity:** medium
- **Issue:** Multiple concurrent requests can pass half-open check simultaneously
- **Fix:** Atomically transition using lock or compare-and-swap

### P-19: replenishPending Guard Not Atomic
- **Location:** `src/services/sessionPool.ts:417-430`
- **Severity:** low
- **Fix:** Verify no `await` between `has()` check and `add()`

### P-20: Timeout Not Cleared on Fetch Error
- **Location:** `src/services/sessionPool.ts:253-267`
- **Severity:** high
- **Issue:** `clearTimeout(timeout)` only runs on success. If `fetch()` throws, the 5-second abort timer leaks
- **Fix:** Wrap in try/finally

### P-21: Silent Replenish Errors
- **Location:** `src/services/sessionPool.ts:99,221`
- **Severity:** medium
- **Issue:** `.catch(() => {})` silently swallows replenish errors
- **Fix:** `.catch(err => logStore.log('warn', 'pool', ...))`

### P-22: Silent Auth Token Refresh Failure
- **Location:** `src/services/playwright.ts:354`
- **Severity:** high
- **Issue:** `.catch(() => {})` on periodic auth token refresh. Stale tokens cause cascading 401s
- **Fix:** Log error and mark account as needing re-authentication

### P-23: No JSON Parse Error Handling
- **Location:** `src/routes/chat.ts:32`
- **Severity:** medium
- **Issue:** `c.req.json()` not wrapped in try/catch for malformed JSON
- **Fix:** Return 400 with `{ error: { message: "Invalid JSON", type: "invalid_request_error" } }`

### P-24: Silent Browser Context Close Failure
- **Location:** `src/services/playwright.ts:321`
- **Severity:** low
- **Fix:** Log warning

### P-25: Silent Disk Write Errors
- **Location:** `src/services/logStore.ts:393-405`
- **Severity:** low
- **Fix:** Log write failures at warn level

### P-26: Health Monitor Interval Never Cleared
- **Location:** `src/cluster.ts:54-88`
- **Severity:** low
- **Fix:** Track interval ID and `clearInterval` on repeated spawn failures

### P-27: Config Parsed at Module Load
- **Location:** `src/services/qwen.ts:92`
- **Severity:** medium
- **Issue:** `QWEN_FETCH_TIMEOUT_MS` parsed once at import time. Config changes at runtime have no effect
- **Fix:** Read config inside function to pick up runtime changes

### P-28: Hardcoded Idle Timeout
- **Location:** `src/routes/streamLoop.ts:49`
- **Severity:** low
- **Fix:** Read from `config.get('STREAM_IDLE_TIMEOUT_MS', '60000')`

### P-29: Mid-Stream Errors Not Retried
- **Location:** `src/services/qwen.ts:109-362`
- **Severity:** medium
- **Issue:** `withRetry` wraps initial `fetch()` but not mid-stream errors
- **Fix:** Implement stream-level retry from `nextParentId`

### P-30: Manual Retry Instead of withRetry
- **Location:** `src/services/qwenModels.ts:268`
- **Severity:** low
- **Issue:** Uses ad-hoc 3-attempt loop instead of `withRetry` with circuit breaker
- **Fix:** Use `withRetry()` for consistency

### P-31: Release Timer Holds References
- **Location:** `src/services/sessionPool.ts:212-217`
- **Severity:** medium
- **Issue:** 60-second `setTimeout` closure captures headers/cookie objects, keeping them alive
- **Fix:** Minimize captured data, null out references after timer fires

### P-32: Promise.race Closure Accumulation
- **Location:** `src/routes/streamLoop.ts:49-56`
- **Severity:** medium
- **Issue:** Each chunk creates a closure capturing `reject` and timer. Closures accumulate until GC
- **Fix:** Use `AbortSignal.timeout()` or reuse single timer

### P-33: Duplicate buildPromptString Function
- **Location:** `src/routes/chatStreaming.ts:42-48` and `src/routes/chatNonStreaming.ts:52-58`
- **Severity:** low
- **Fix:** Extract to shared module (`chatHelpersCore.ts`)

---

## Security Issues

### S-1: API Key Injected into Dashboard HTML
- **Location:** `src/routes/dashboard/dashboardRoutes.ts:29`
- **Severity:** high
- **Issue:** `window.API_KEY` is injected into every dashboard page. Any browser extension, XSS vector, or network observer can read the API key
- **Fix:** Remove from client-side JS. Dashboard should use session cookies or Authorization headers

### S-2: Config Auth Uses String Comparison
- **Location:** `src/index.tsx:133`
- **Severity:** medium
- **Issue:** Config router auth uses `auth !== \`Bearer ${config.get("API_KEY")}\`` — standard string comparison vulnerable to timing attacks
- **Fix:** Use `bearerAuth()` middleware or `safeCompare()` utility

### S-3: Config Auth Decided at Startup (Static)
- **Location:** `src/index.tsx:130`
- **Severity:** medium
- **Issue:** `if (config.get("API_KEY"))` evaluated once at startup. Setting API key later leaves routes unprotected until restart
- **Fix:** Move auth check inside middleware to read current config value per-request

### S-4: Debug Network Endpoint Unauthenticated
- **Location:** `src/index.tsx:119`, `src/routes/debugNetwork.ts`
- **Severity:** medium
- **Issue:** `/debug/network` mounted without auth. Exposes request/response data, headers (including cookies and auth tokens)
- **Fix:** Add bearer auth middleware before the debug route

### S-5: No Request Body Validation
- **Location:** `src/routes/chat.ts:31-32`
- **Severity:** medium
- **Issue:** Request body cast directly to `OpenAIRequest` with no schema validation
- **Fix:** Add Zod schema validation for required fields

### S-6: CORS Origin Hardcoded to Port 26405
- **Location:** `src/index.tsx:91`
- **Severity:** low
- **Fix:** Derive CORS origins dynamically from configured `PORT` and `HOST`

### S-7: API Key Accepted via Query Parameter
- **Location:** `src/utils/auth.ts:36-38`
- **Severity:** low
- **Issue:** Query parameters appear in server logs, browser history, and referrer headers
- **Fix:** Remove if unused, document tradeoff if needed for SSE/EventSource

### S-8: CI Uses Node.js Instead of Bun
- **Location:** `.github/workflows/ci.yml:8-12`
- **Severity:** high
- **Issue:** Uses `actions/setup-node@v4` and `npm ci` but project is Bun-first. Bun-specific APIs won't be tested
- **Fix:** Use `oven-sh/setup-bun@v1`, `bun install --frozen-lockfile`, `bun test`

### S-9: No Lint Step in CI
- **Location:** `.github/workflows/ci.yml`
- **Severity:** medium
- **Fix:** Add `bun run lint`, `bun audit`, formatting check

### S-10: Dockerfile Copies Full node_modules
- **Location:** `Dockerfile:27`
- **Severity:** medium
- **Issue:** Includes devDependencies in production image
- **Fix:** Use `bun install --production` in build stage

### S-11: Dockerfile Base Image Unpinned
- **Location:** `Dockerfile:2,10`
- **Severity:** medium
- **Issue:** `FROM oven/bun:alpine` — builds not reproducible
- **Fix:** Pin to `oven/bun:1.3.14-alpine`

### S-12: No .env.example File
- **Location:** project root
- **Severity:** low
- **Fix:** Create `.env.example` or remove `dotenv/config` import

### S-13: package.json main Points to Wrong File
- **Location:** `package.json:5`
- **Severity:** low
- **Fix:** Change to `"main": "dist/index.js"`

### S-14: No engines Field
- **Location:** `package.json`
- **Severity:** low
- **Fix:** Add `"engines": { "bun": ">=1.3.0", "node": ">=22.0.0" }`

### S-15: Duplicate Auth Patterns
- **Location:** `src/index.tsx:111-138`, `src/utils/auth.ts:27-41`
- **Severity:** medium
- **Issue:** Three different auth patterns coexist: `bearerAuth()` middleware, manual string comparison, custom `checkApiKeyAuth()`
- **Fix:** Standardize on `bearerAuth()` for all protected routes

### S-16: config.json Auto-Created with Full Defaults
- **Location:** `src/services/configService.ts:104-107`
- **Severity:** low
- **Fix:** Create minimal config or log warning that auth is disabled

### S-17: Content-Length Bypass (Chunked Encoding)
- **Location:** `src/index.tsx:143-148`
- **Severity:** medium
- **Issue:** Body size limit only checks `Content-Length` header. Chunked transfer-encoding bypasses 10MB limit entirely
- **Fix:** Implement actual byte counting, not just header checking

### S-18: Console.warn/error Globally Overridden
- **Location:** `src/index.tsx:37-46`
- **Severity:** low
- **Issue:** Global monkey-patching affects all modules including third-party libraries
- **Fix:** Use dedicated logger, pass explicitly

### S-19: install.sh Uses sudo Without Warning
- **Location:** `install.sh:124-145`
- **Severity:** low
- **Fix:** Print message before `sudo`, offer `--local` flag for `~/.local/bin`

### S-20: Minimal Test Coverage
- **Location:** `src/**/*.test.ts`
- **Severity:** medium
- **Issue:** Core routing, middleware, dashboard, and streaming pipeline untested. No coverage threshold
- **Fix:** Add integration tests, configure coverage threshold

### S-21: Rate Limiter In-Memory Only
- **Location:** `src/middleware/rateLimit.ts:14`
- **Severity:** low (local-only project)
- **Issue:** In cluster mode, each worker has its own rate limit state
- **Fix:** Document limitation for local use

### S-22: dist/ Possibly Tracked
- **Location:** `dist/` directory
- **Severity:** low
- **Fix:** `git rm -r --cached dist/` if tracked

### S-23: config.json Possibly Tracked
- **Location:** `config.json`
- **Severity:** medium
- **Fix:** Verify with `git ls-files config.json`, `git rm --cached` if tracked

---

## Infrastructure Issues

### I-1: CI Runtime Mismatch
- See S-8

### I-2: Docker Image Bloat
- See S-10, S-11

### I-3: No Lint/Format/Audit in CI
- See S-9

### I-4: Missing .env.example
- See S-12

### I-5: package.json Misconfiguration
- See S-13, S-14, L-6

---

## Recommended Fix Order

### Phase 1: Critical Security & Performance (Week 1)
1. S-1 — Remove API key from dashboard HTML
2. P-1,2,4 — Fix O(n²) stream buffer accumulation
3. P-3 — Replace per-chunk idle timeout with resettable timer
4. S-17 — Implement byte-counting body size limit
5. S-4 — Add auth to `/debug/network`
6. P-20 — Wrap session delete timeout in try/finally
7. P-22 — Log auth token refresh failures
8. P-17 — Add mutex to session pool

### Phase 2: Error Handling & Reliability (Week 2)
9. H-4,5,6 — Add logging to all silent `.catch(() => {})`
10. S-2,3,15 — Standardize auth patterns
11. P-14 — Await `reader.cancel()` before `releaseLock()`
12. P-23 — Add JSON parse error handling
13. H-2 — Fix console override to preserve terminal output
14. A-24 — Elevate config errors from warn to error

### Phase 3: Code Quality & Architecture (Week 3)
15. A-1 — Break up god module index.tsx
16. A-3 — Resolve circular dependencies
17. A-20, H-3 — Remove dead exports
18. M-4,5,6,7 — Replace `as any` with proper types
19. A-2 — Standardize import extensions
20. A-27 — Standardize error response format

### Phase 4: Infrastructure & Polish (Week 4)
21. S-8 — Fix CI to use Bun
22. S-10,11 — Fix Dockerfile
23. S-5 — Add request body validation
24. A-28 — Add request ID tracking
25. A-30 — Add `/health` endpoint
26. P-9 — Cap rate limit bucket size
27. Remaining low-priority items

---

**Total: ~100 individual findings across 35 consolidated groups.**

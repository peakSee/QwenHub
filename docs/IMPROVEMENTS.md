# QwenHub -- Improvement Roadmap

Comprehensive analysis of the qwenhub codebase (v0.5.1) with actionable improvements organized by priority. Use this as a living document to track progress.

---

## How to Use This Document

Each issue has:
- **Severity**: critical / high / medium / low
- **Effort**: small (<2h) / medium (2-8h) / large (8-40h)
- **Status**: pending / in-progress / done
- **Impact**: Why it matters
- **Fix**: Concrete approach

---

## 1. Critical Issues

### 1.1 No type-safe configuration system

| Field | Value |
|-------|-------|
| Severity | critical |
| Effort | medium |
| Status | done |
| Files | `src/services/configService.ts` |

**Changes**: Added `getInt()`, `getBool()`, `getFloat()`, `getPort()` typed accessors to `ConfigService`. Migrated all 10 consumers from `parseInt(config.get(...))` / `parseFloat(config.get(...))` to typed accessors. Added `MODELS_CACHE_TTL_MS` schema key.

```ts
// Current pattern -- scattered across the codebase:
const QWEN_FETCH_TIMEOUT_MS = parseInt(config.get('QWEN_FETCH_TIMEOUT_MS', '30000'), 10);
const retriesEnabled = config.get('RETRY_ENABLED', 'true') !== 'false';
```

**Fix**:
1. Define a typed `Config` interface with all 23+ keys, correct types, and defaults
2. Validate at startup using zod schema -- reject invalid config immediately
3. Access via typed getters (e.g., `config.qwenFetchTimeoutMs`) instead of `config.get()`

**Acceptance**: `config.get()` is removed. Startup fails fast with a clear message if config is invalid.

---

### 1.2 Circular dependencies with dynamic imports

| Field | Value |
|-------|-------|
| Severity | critical |
| Effort | large |
| Status | partial |
| Files | `src/services/auth.ts`, `accountManager.ts`, `playwright.ts`, `tokenRefresh.ts` |

**Changes**: Broke the main auth.ts <-> accountManager.ts cycle by extracting `AccountEntry`/`AuthState` into `src/types/auth.ts`, creating `loginService.ts` for `loginFresh`, and moving `accounts` array to `accountManager.ts`. Removed 4 dynamic imports. ~12 remain in playwright.ts/tokenRefresh.ts/browserProfiles.ts — require future service container pattern.

**Problem**: Over 25 `await import('./foo.ts')` calls used to break circular imports. This makes the code:
- Impossible to statically analyze (no refactoring support)
- Slower on hot paths (dynamic import overhead)
- Hard to test (mocking requires jumping through hoops)

The core cycle: `auth.ts` -> `accountManager.ts` -> re-exports from `auth.ts` -> `playwright.ts` dynamically imports `auth.ts` -> `tokenRefresh.ts` dynamically imports `playwright.ts`

**Fix**:
1. Extract shared interfaces (`AuthState`, `AccountEntry`) into `src/types/auth.ts`
2. Break the cycle by introducing an **event bus** or **service container**:
   - `AccountManager` publishes account-change events
   - `PlaywrightManager` subscribes to create/destroy browser contexts
   - `AuthService` orchestrates
3. Or simplest fix: move the 3-4 shared functions into a `shared.ts` that nothing imports from (leaf node)

**Acceptance**: Zero dynamic imports for circular dependency resolution. Import graph is a DAG.

---

### 1.3 Pervasive `any` types

| Field | Value |
|-------|-------|
| Severity | critical |
| Effort | large |
| Status | pending |
| Files | Everywhere, especially `chatHelpers.ts`, `playwright.ts`, `qwen.ts` |

**Problem**: Heavy use of `any`, `Record<string, any>`, and `typedCast<T>(v: unknown): T` which is a no-op cast. This defeats TypeScript's purpose and silently allows type mismatches.

```ts
// playwnright.ts:228
function typedCast<T>(v: unknown): T {
  return v as T;
}
// Called as: typedCast<BrowserContext>(null) -- no actual safety
```

**Fix**:
1. Remove `typedCast()` entirely
2. Use proper types from `src/types/openai.ts` everywhere
3. Add `strict: true` (already set) and `noImplicitAny: true` to tsconfig
4. Fix each file incrementally, starting with the most-used types

**Acceptance**: `tsc --noEmit` passes with zero implicit any errors.

---

## 2. High Priority

### 2.1 No model list caching

| Field | Value |
|-------|-------|
| Severity | high |
| Effort | small |
| Status | done |
| Files | `src/services/qwenModels.ts`, `src/services/configService.ts` |

**Changes**: Made the 1-hour hardcoded cache TTL configurable via `MODELS_CACHE_TTL_MS` config key (default: 3600000ms).

---

### 2.2 Monolithic service files

| Field | Value |
|-------|-------|
| Severity | high |
| Effort | large |
| Status | pending |
| Files | `auth.ts` (456 lines), `accountManager.ts` (508 lines), `playwright.ts` (496 lines) |

**Problem**: These three files each handle 3-5 distinct responsibilities, making them hard to reason about and test.

**Split plan**:

| Current File | Proposed Split |
|---|---|
| `auth.ts` | `auth.ts` (login orchestration), `authState.ts` (account entry state machine), `cookieStore.ts` (disk persistence) |
| `accountManager.ts` | `accountManager.ts` (CRUD), `accountPicker.ts` (selection algorithm), `accountEncryption.ts` (password crypto), `accountWatcher.ts` (file watcher) |
| `playwright.ts` | `browserManager.ts` (launch/close), `accountContext.ts` (per-account browser context), `headerExtractor.ts` (bx headers), `cookieAggregator.ts` (cookie collection) |

**Acceptance**: No file exceeds 250 lines. Each file has a single `export` or related group of exports.

---

### 2.3 Health endpoint improvements

| Field | Value |
|-------|-------|
| Severity | high |
| Effort | small |
| Status | done |
| Files | `src/index.tsx` |

**Changes**: `/health` now returns account auth status (total, authenticated, available, throttled), in-flight request count, and version. True readiness is computed from Playwright + account health.

---

### 2.4 Weak password encryption

| Field | Value |
|-------|-------|
| Severity | high |
| Effort | medium |
| Status | done |
| Files | `src/services/accountManager.ts` |

**Problem**: The encryption key derivation uses either the API key or `os.hostname() + projectPath`, which is predictable. Using the API key as encryption key means changing the API key invalidates all stored passwords.

```ts
function getEncryptionKey(): string {
  const apiKey = config.get('API_KEY');
  if (apiKey) return apiKey; // API key == encryption key -- bad
  const machineId = `${os.hostname()}-${projectPath('.')}`;
  return crypto.createHash('sha256').update(machineId).digest('hex');
}
```

**Fix**:
1. Generate a random master key on first install: `crypto.randomBytes(32).toString('hex')`
2. Store in `.qwen/master.key` (chmod 600)
3. Derive encryption key from master key via HKDF or scrypt (already using scrypt)
4. If `API_KEY` changes, master key is unaffected

**Changes**: `getEncryptionKey()` now generates a persistent 32-byte random key stored in `.qwen/master.key` on first use. Falls back to API_KEY for backward compatibility. Hostname-based fallback only when filesystem is unwritable. Master key survives API_KEY rotation.

---

## 3. Medium Priority

### 3.1 No structured logging

| Field | Value |
|-------|-------|
| Severity | medium |
| Effort | small |
| Status | done |
| Files | `src/services/systemLogger.ts` |

**Changes**: Every `logStore.log()` call now also writes a newline-delimited JSON line to stdout. Includes all system log fields plus a `logger: "qwenhub"` tag for container/aggregator ingestion (Docker, Kubernetes, ELK, Datadog).

### 3.2 Per-client rate limiting

| Field | Value |
|-------|-------|
| Severity | medium |
| Effort | small |
| Status | done |
| Files | `src/middleware/rateLimit.ts` |

**Changes**: Rate limit key is now derived from `route:clientIp` instead of just `route`. Uses `x-forwarded-for` or `x-real-ip` headers. Prevents one abusive client from starving others.

### 3.3 Request body schema validation

| Field | Value |
|-------|-------|
| Severity | medium |
| Effort | medium |
| Status | done |
| Files | `src/utils/validation.ts`, `src/routes/chat.ts` |

**Changes**: Added zod-based schema validation for OpenAI request bodies. Returns 400 with specific field-level error messages for missing/invalid fields. Messages, model, tool definitions all validated upfront.

### 3.4 CI quality checks

| Field | Value |
|-------|-------|
| Severity | medium |
| Effort | small |
| Status | done |
| Files | `.github/workflows/ci.yml` |

**Changes**: Added `bunx biome check src/` to CI pipeline alongside existing tsc and test steps.

---

### 3.5 Per-client rate limiting

(This section moved to 3.2 above.)

---

**Fix**: Add a secondary logger that writes structured JSON to stdout. The in-memory store remains for dashboard consumption. Use `pino` or a lightweight custom formatter.

**Acceptance**: Logs appear as newline-delimited JSON on stdout simultaneously with dashboard updates.

---

### 3.2 Rate limiter is shared across all users

| Field | Value |
|-------|-------|
| Severity | medium |
| Effort | small |
| Status | pending |
| Files | `src/middleware/rateLimit.ts` |

**Problem**: Token buckets are keyed by route name only (`'chat-completions'`, `'models'`). All clients share one bucket, so one abusive user can rate-limit everyone.

**Fix**: Derive rate limit key from IP address or (when auth is enabled) API key hash.

```ts
const ip = c.req.header('x-forwarded-for') || c.req.raw.connection?.remoteAddress || 'unknown';
const key = `${route}:${ip}`;
```

**Acceptance**: Each client has independent rate limit state.

---

### 3.3 No request body schema validation

| Field | Value |
|-------|-------|
| Severity | medium |
| Effort | medium |
| Status | pending |
| Files | `src/routes/chat.ts` (lines 28-71), `src/types/openai.ts` |

**Problem**: `parseRequestBody` casts the JSON body to `OpenAIRequest` but doesn't validate it. Invalid requests hit Qwen upstream and return opaque errors.

**Fix**: Use zod or valibot to validate the incoming body against the OpenAI spec before processing.

**Acceptance**: Missing required fields, wrong types, and invalid enum values return 400 with specific error messages.

---

### 3.4 Dashboard is vanilla JS

| Field | Value |
|-------|-------|
| Severity | medium |
| Effort | large |
| Status | pending |
| Files | `src/routes/dashboard/` (9 files) |

**Problem**: The 5-page dashboard is written in vanilla HTML/JS with server-side rendering via Hono's `c.html()`. No component reuse, no client-side state management, no reactivity.

**Note**: This may be intentional (zero build step dependency). Only refactor if dashboard features are being actively developed.

**Alternative**: Keep as-is but add TypeScript to the client-side JS files and use Hono JSX for server-side components.

---

## 4. Low Priority

| # | Issue | Why | Effort |
|---|-------|-----|--------|
| 4.1 | No WebSocket streaming | Only SSE is supported. WebSockets reduce overhead for persistent connections. | large |
| 4.2 | No Prometheus metrics | `/metrics` endpoint would help production observability. | medium |
| 4.3 | No graceful credential rotation | Changing Qwen passwords requires re-adding accounts through dashboard. | medium |
| 4.4 | No OpenAPI spec | Machine-readable API contract helps clients integrate. | medium |
| 4.5 | readme has star-history widget | Out of place in README. Consider moving to a separate community page. | small |
| 4.6 | No code coverage tool configured | `bun test --coverage` exists but no quality gate or badge. | small |
| 4.7 | `browserProfiles.ts` imported dynamically everywhere | Every auth function does `await import('./browserProfiles.ts')`. | medium |

---

## 5. Proposed Sprint Roadmap

### Sprint 1: Foundation (done)

| # | Task | Status |
|---|------|--------|
| 1.1 | Extract shared types to `src/types/` | done |
| 1.2 | Break circular deps + remove dynamic imports | partial (~4 dynamic imports removed, ~12 remain) |
| 1.3 | Typed configuration with validation | done |
| 1.4 | Cache model list | done |

### Sprint 2: Quality (done)

| # | Task | Status |
|---|------|--------|
| 2.1 | Improve `/health` endpoint | done |
| 2.2 | Fix password encryption | done |

### Sprint 3: Production Readiness (done)

| # | Task | Status |
|---|------|--------|
| 3.1 | Structured JSON logging | done |
| 3.2 | Per-client rate limiting | done |
| 3.3 | Request body validation (zod) | done |
| 3.4 | Add quality checks to CI | done |

### Future Backlog (not yet started)

| # | Task | Effort | Why Left |
|---|------|--------|----------|
| 2.1 | Eliminate `any` types (strict mode) | large | Touches every file, mechanical but risky |
| 2.2 | Split monolithic files | large | auth.ts, accountManager.ts, playwright.ts tightly coupled |
| 2.4 | Integration tests for core API | large | Needs test infrastructure + mock data |
| 3.4 | OpenAPI documentation | medium | Good for SDK generation, no runtime impact |
| 4.x | Remaining dynamic imports | large | Requires service container pattern |

---

## Tracking Convention

When starting work on an item, update its status and add a `TODO:` comment in the relevant source file:

```ts
// TODO(improvements): 2.1 Cache model list with 5-minute TTL
```

When a PR/commit addresses an item, reference it:

```
feat(config): add typed config validation with zod
Refs: 1.1
```

---

## How to Contribute

1. Pick an item from the backlog (preferably Sprint 1 items first)
2. Create a feature branch: `git checkout -b improve/issue-number-slug`
3. Make changes following existing code conventions (see `AGENTS.md`)
4. Run tests: `bun test`
5. Run quality checks: `bun run quality`
6. Open a PR referencing the issue number

---

*Last updated: 2026-06-16*

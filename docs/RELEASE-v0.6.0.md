# v0.6.0 Release — CDP Streaming, File Upload Fixes, Memory Optimization

## Summary

Major release focused on CDP-based Qwen API routing, account pool reliability, file upload correctness, and memory optimization. 66 commits since v0.5.0.

## New Features

### CDP (Chrome DevTools Protocol) Integration
- Route Qwen API through real Chrome via CDP to bypass baxia WAF (`c814159`)
- Per-account isolated browser contexts with CDP (`060eefa`)
- Two-phase body storage for large CDP requests (132KB+) (`d80562c`)
- Fire-and-forget CDP fetch pattern to prevent large body hangs (`a2c3e46`)
- CDP streaming fix for large bodies + dashboard CDP status (`ab15413`)
- Store profileCookies in AccountCdpState for Node.js fetch cookie reuse (`91d5ad0`)

### Headless Detection Evasion
- Headless Chrome detection evasion + UA rotation + improved warmup (`d80562c`)
- Bot detection logging + account routing fixes (`f184888`)

### File Upload System
- Auto-upload large payloads as Qwen file attachments (`ccf5ee6`)
- Upload full conversation context including latest user message (`02443a1`)
- XML tool result format with proper escaping (`chatHelpers.ts`)
- File upload uses same account as request (fixes cross-account file access)

### Dashboard Improvements
- Web dashboard with monitoring, accounts, logs, network, settings pages
- Config editor with runtime reload for most settings
- Account disabled toggle in accounts page
- Removed deprecated logs page
- Network debug panel

### Account Management
- Account pool with throttling, bot detection handling, rate limiting
- In-memory `accounts.json` file with `accounts.jsonc` fallback
- Disabled account support with toggle
- Profile cookies for persistent sessions

## Bug Fixes

### Pool/Account Failures
- **Silent account skip**: Added logging at all failure points in `chat.ts` — session acquire failures, first-chunk timeouts, stream creation errors now logged via `logStore.log('warn')`
- **Double inFlight decrement**: Removed duplicate `decrementInFlight()` in `chat.ts` — `sessionPool.acquire()` already decrements on failure
- **Double session release**: Removed redundant `sessionPool.release()` in `chatHelpers.ts` — caller handles it
- **CDP zombie state**: Added `initialized` flag to `AccountCdpState` — `hasAccountContext()` now checks `initialized === true`

### File Upload
- **Cross-account file access**: File upload now uses the same account as the chat request. Previously used a separate `pickAccount()` call, causing uploaded files to be invisible to the requesting account

### Browser/Process Management
- **Browser context leak**: Cleanup page + context in `finally` block during login
- **Orphan Chrome processes**: Startup pkill of stray `--remote-debugging-port=26404` processes
- **Console.log removal**: Removed all debug console.log statements from production code

## Performance & Memory

### Chromium Memory Reduction
Added 11 memory-reduction Chromium flags in `autoBrowser.ts`:
- `--renderer-process-limit=1` — limits renderer processes
- `--isolate-origins=""` — single site isolation
- `--js-flags="--max-old-space-size=256"` — JS heap limit
- `--in-process-gpu` — shared GPU process
- `--no-zygote` — disable zygote process
- `--disable-background-networking`
- `--disable-background-timer-throttling`
- `--disable-backgrounding-occluded-windows`
- `--disable-renderer-backgrounding`
- `--disable-field-trial-config`

### Streaming Optimization
- One-chunk buffer prevents XML tool call leaks across SSE chunk boundaries (`fcb3fb0`)
- Prevent empty stream response at end of SSE stream (`6de8638`)
- Snapshot diffing breaks amplification loop in content filter

## Code Quality
- Biome format + lint config added
- Knip dead code detection config
- Oxlint config
- TypeScript strict mode improvements
- Removed deprecated tool files (`registry.ts`, `schema.ts`, `schemaValidators.ts`)
- Removed `.qwen/reports/` directory (outdated audit docs)
- Added `docs/AUDIT.md` with security audit findings
- Added `docs/IMPROVEMENTS.md` with improvement roadmap
- Added `HANDOFF.md` with project handoff documentation
- Updated README, CONTRIBUTING, ARCHITECTURE docs

## Infrastructure
- `bun` runtime only (Node.js `start:node` script deprecated)
- `bun.lock` replaces `package-lock.json`
- `bin/qg` CLI entry point
- `scripts/` — load testing, cross-account tests, thinking format tests
- `start-server.ps1` — Windows startup script
- CI workflow updates

## Breaking Changes
- Node.js runtime is secondary/deprecated — use Bun v1.3+
- `accounts.jsonc` → `accounts.json` (with autofallback)
- Logs page removed from dashboard (use `/dashboard/log/json` API instead)
- Removed `.qwen/reports/` directory

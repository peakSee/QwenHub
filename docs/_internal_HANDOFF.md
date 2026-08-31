# QwenHub Handoff - WAF/Session Fix (June 18, 2026)

## Root Cause

The WAF (`FAIL_SYS_USER_VALIDATE` CAPTCHA) is triggered because browser sessions are created without the full set of tracking/WAF cookies that baxia expects.

**What works**: A real logged-in Chrome browser (Chrome MCP) has baxia fully active: fetch is patched (661 chars wrapper), `_waf_async_initialized=true`, `baxiaInitialized=true`. API calls succeed with the correct `bx-umidtoken` and `bx-ua` headers.

**What breaks**: When the server creates a new browser context for an account, only the JWT `token` cookie is injected. The context starts without baxia/WAF session cookies (`cna`, `ssxmod_itna`, `tfstk`, `isg`, `x5sec`). The WAF detects this as a thin/automated session and does not provide baxia initialization. Without baxia's fetch wrapper, `bx-umidtoken` and `bx-ua` headers are never generated, and the WAF blocks the API request.

## Fixes Applied

### Three changes to create and persist "fat sessions":

1. **`createContextInternal()`** (playwright.ts) — When creating a new browser context, inject ALL cookies from the account's `profileCookies` field (cna, ssxmod_itna, tfstk, isg, token, etc.), not just the token. Gives the WAF an established session from the start.

2. **`refreshAccountCookies()`** (playwright.ts) — After navigating to chat.qwen.ai, polls for session cookies up to 15 seconds (was a fixed 2-second sleep). After cookies are collected, saves ALL of them to `acct.profileCookies` in accounts.json so they persist across server restarts.

3. **`tryCheckToken()`** (browserProfiles.ts) — After a successful manual login via the headed browser (dashboard "Login" button), saves ALL cookies from the profile (not just the token) to `acct.profileCookies`. This captures baxia/WAF session cookies for future API sessions.

## How to Fix Your Session

Since existing accounts were created via API auth (no full browser session), you need to:

1. **Login once through the web UI**: Use the dashboard's "Login" button for each account. This opens a headed browser where you log in manually.
2. **After login**: All cookies are automatically saved to the account profile.
3. **Restart the server**: The next context creation will inject the full cookie set.
4. **API calls should now work**: The WAF sees an established session with all tracking cookies.

## Files Changed
- `src/services/playwright.ts` — createContextInternal (inject profileCookies), refreshAccountCookies (wait+save)
- `src/services/browserProfiles.ts` — tryCheckToken (save all cookies after login)

## Test Accounts
8 accounts configured. None have `profileCookies` with a `token` cookie yet (requires manual web UI login).

## How to Run
```bash
bun src/index.tsx    # Server on port 26405
bun test             # 103 tests pass
```

## Key Files
- `src/services/playwright.ts` - Browser context, cookie injection, fetch routing
- `src/services/qwen.ts` - Chat completion logic, error handling, header building
- `src/services/browserProfiles.ts` - Manual login flow, profile management
- `src/services/auth.ts` - Account management, token management

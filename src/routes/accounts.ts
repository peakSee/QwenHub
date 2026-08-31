import { Hono } from 'hono';
import { addAccount, getAccountByEmail, getAccounts, removeAccount, setAccountDisabled } from '../services/auth.ts';
import { logStore } from '../services/logStore.ts';

const accountActionRateLimit = new Map<string, number[]>();

function checkRateLimit(key: string, maxPerMinute: number = 10): boolean {
  const now = Date.now();
  const window = 60_000;
  const timestamps = (accountActionRateLimit.get(key) || []).filter((t) => now - t < window);
  if (timestamps.length >= maxPerMinute) return false;
  timestamps.push(now);
  accountActionRateLimit.set(key, timestamps);
  return true;
}

export const accountsRouter = new Hono();

accountsRouter.get('/', (c) => {
  const accounts = getAccounts();
  const masked = accounts.map((a) => ({
    email: a.email,
    passwordMasked: a.password ? '••••••••' : '',
    authenticated: a.state !== null && a.state.token !== '',
    tokenExpiresAt: a.state?.expiresAt || null,
    throttled: a.throttledUntil > Date.now(),
    throttledUntil: a.throttledUntil > Date.now() ? a.throttledUntil : null,
    throttledUnlockAt: a.throttledUntil > Date.now() ? new Date(a.throttledUntil).toISOString() : null,
    inFlight: a.inFlight,
    totalRequests: a.totalRequests,
    startupStatus: a.startupStatus || null,
  }));
  return c.json({ count: masked.length, accounts: masked });
});

accountsRouter.post('/', async (c) => {
  try {
    if (!checkRateLimit('accounts')) {
      return c.json({ error: 'Rate limit exceeded' }, 429);
    }
    const body = await c.req.json();
    const { email, password } = body;

    if (!email || !password) {
      return c.json({ error: { message: 'email and password are required' } }, 400);
    }

    if (typeof email !== 'string' || typeof password !== 'string') {
      return c.json({ error: { message: 'email and password must be strings' } }, 400);
    }

    const result = await addAccount(email, password);

    return c.json(
      { success: true, email: email.toLowerCase().trim(), loginSucceeded: result.loginSucceeded, loginError: result.loginError },
      201,
    );
  } catch (err: any) {
    if (err.message.includes('already exists')) {
      return c.json({ error: { message: err.message } }, 409);
    }
    console.error('[Accounts] POST failed:', err.message);
    return c.json({ error: { message: 'Failed to add account' } }, 500);
  }
});

/**
 * PATCH /api/accounts/:email
 * Update account properties (e.g. disabled)
 */
accountsRouter.patch('/:email', async (c) => {
  try {
    if (!checkRateLimit('accounts')) {
      return c.json({ error: 'Rate limit exceeded' }, 429);
    }
    const email = decodeURIComponent(c.req.param('email'));
    const body = await c.req.json();
    if (typeof body.disabled === 'boolean') {
      setAccountDisabled(email, body.disabled);
    }
    return c.json({ success: true, email, disabled: body.disabled });
  } catch (err: any) {
    if (err.message.includes('not found')) {
      return c.json({ error: { message: err.message } }, 404);
    }
    console.error('[Accounts] PATCH failed:', err.message);
    return c.json({ error: { message: 'Failed to update account' } }, 500);
  }
});

/**
 * DELETE /api/accounts/:email
 * Remove an account by email
 */
accountsRouter.delete('/:email', async (c) => {
  try {
    if (!checkRateLimit('accounts')) {
      return c.json({ error: 'Rate limit exceeded' }, 429);
    }
    const email = decodeURIComponent(c.req.param('email'));
    await removeAccount(email);
    return c.json({ success: true, email });
  } catch (err: any) {
    if (err.message.includes('not found')) {
      return c.json({ error: { message: err.message } }, 404);
    }
    console.error('[Accounts] DELETE failed:', err.message);
    return c.json({ error: { message: 'Failed to remove account' } }, 500);
  }
});

/**
 * GET /api/accounts/:email/login
 * Trigger browser login for a specific account
 */
accountsRouter.get('/:email/login', async (c) => {
  try {
    const email = decodeURIComponent(c.req.param('email'));
    const account = getAccountByEmail(email);

    if (!account) {
      return c.json({ error: { message: `Account ${email} not found` } }, 404);
    }

    if (!account.password) {
      return c.json({ error: { message: 'No password stored for this account' } }, 400);
    }

    // Authorize the browser profile — creates profile, logs in, saves cookie
    const { openBrowserProfile } = await import('../services/playwright.ts');
    const loginResult = await openBrowserProfile(account.email, account.password, { headless: true });

    if (loginResult === 'success') {
      // Re-read token from the now-authenticated profile
      const { loadCookiesFromProfile } = await import('../services/auth.ts');
      const profileState = await loadCookiesFromProfile(account.email);
      if (profileState) {
        account.state = profileState;
        return c.json({ success: true, email: account.email, authenticated: true });
      }
      return c.json({ success: true, email: account.email, authenticated: true });
    } else if (loginResult === 'captcha') {
      return c.json({ error: { message: 'CAPTCHA required — use autofill to complete manually' } }, 400);
    } else {
      return c.json({ error: { message: 'Login failed — check credentials' } }, 500);
    }
  } catch (err: any) {
    console.error('[Accounts] LOGIN failed:', err.message);
    return c.json({ error: { message: 'Login failed' } }, 500);
  }
});

accountsRouter.get('/:email/autofill', async (c) => {
  try {
    const email = decodeURIComponent(c.req.param('email'));
    const account = getAccountByEmail(email);
    if (!account) return c.json({ error: { message: `Account ${email} not found` } }, 404);
    if (!account.password) return c.json({ error: { message: 'No password stored' } }, 400);

    (async () => {
      try {
        const { openBrowserProfile } = await import('../services/playwright.ts');
        const loginResult = await openBrowserProfile(account.email, account.password, { headless: false });
        if (loginResult === 'success') {
          const { loadCookiesFromProfile } = await import('../services/auth.ts');
          const profileState = await loadCookiesFromProfile(account.email);
          if (profileState) account.state = profileState;
        }
      } catch (err: any) {
        logStore.log('error', 'auth', err.message || String(err));
      }
    })();

    return c.json({ success: true, email: account.email, message: 'Browser opened. Complete login manually.' });
  } catch (err: any) {
    console.error('[Accounts] AUTOFILL failed:', err.message);
    return c.json({ error: { message: 'Auto-fill login failed' } }, 500);
  }
});

/**
 * GET /api/accounts/:email/password
 * Returns the stored password for embedded browser login (screencast).
 * Protected by API key — internal dashboard use only.
 */
accountsRouter.get('/:email/password', async (c) => {
  try {
    const email = decodeURIComponent(c.req.param('email'));
    const account = getAccountByEmail(email);
    if (!account) return c.json({ error: { message: `Account ${email} not found` } }, 404);
    if (!account.password) return c.json({ error: { message: 'No password stored' } }, 400);
    return c.json({ email: account.email, password: account.password });
  } catch {
    return c.json({ error: { message: 'Failed' } }, 500);
  }
});

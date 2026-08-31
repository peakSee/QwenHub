import { existsSync, readFileSync } from 'fs';
import { Hono } from 'hono';
import { bearerAuth } from 'hono/bearer-auth';
import { resolve } from 'path';
import { getAccountCount, getAccountStats, getAllAccountEmails, getAvailableCount, initAuth } from '../../services/auth.ts';
import { config, isValidKey } from '../../services/configService.ts';
import { logStore } from '../../services/logStore.ts';
import { monitorStore } from '../../services/monitorStore.ts';

import { configureAccount, deleteAllChats } from '../../services/qwen.ts';
import { sessionPool } from '../../services/sessionPool.ts';
import { checkApiKeyAuth } from '../../utils/auth.ts';
import { projectPath } from '../../utils/paths.ts';
import { APP_VERSION } from '../../utils/version.ts';
import { accountsHtml } from './accounts.ts';
import { monitorHtml } from './monitor.ts';
import { networkHtml } from './network.ts';
import { overviewHtml } from './overview.ts';
import { settingsHtml } from './settings.ts';
import { usageHtml } from './usage.ts';

const serveHtml = (html: string) => (c: any) => {
  // Dashboard HTML pages always serve — they're localhost admin UI.
  // API_KEY protection applies only to data endpoints (handled by requireApiKey/bearerAuth).
  // The front-end JS injects Authorization: Bearer <key> via window.API_KEY for data fetches.
  const darkMode = config.get('DARK_MODE') === 'true';
  const scriptInjection = `<script>\nwindow.APP_VERSION = ${JSON.stringify(APP_VERSION)};\nwindow.API_KEY = ${JSON.stringify(config.get('API_KEY'))};\nwindow.DARK_MODE = ${JSON.stringify(darkMode)};\n</script>\n<link rel="icon" type="image/svg+xml" href="/dashboard/static/logo.svg">\n`;
  // Apply dark-mode class on <html> server-side to prevent flash on page navigation
  let output = html.replace(/(<script\b)/, scriptInjection + '$1');
  if (darkMode) {
    output = output.replace('<html lang="en">', '<html lang="en" class="dark-mode">');
  }
  c.header(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' ws: wss:;",
  );
  return c.html(output);
};

function dashboardStaticHandler(c: any) {
  const file = c.req.param('file');
  if (!/^[a-z0-9_-]+\.(css|js|svg)$/i.test(file)) return c.json({ error: 'Invalid file' }, 400);
  const DASHBOARD_STATIC = projectPath('src', 'routes', 'dashboard', 'public');
  const filePath = resolve(DASHBOARD_STATIC, file);
  if (!filePath.startsWith(DASHBOARD_STATIC) || !existsSync(filePath)) return c.json({ error: 'Not found' }, 404);
  const mime: Record<string, string> = { css: 'text/css', js: 'application/javascript', svg: 'image/svg+xml' };
  const ext = file.split('.').pop() || '';
  const contentType = mime[ext] || 'application/octet-stream';
  return c.text(readFileSync(filePath, 'utf-8'), 200, { 'Content-Type': contentType });
}

function healthHandler(c: any) {
  const poolOk = getAvailableCount() > 0;
  return c.json(
    {
      status: poolOk ? 'ok' : 'degraded',
      pool: poolOk,
      accounts: { total: getAccountCount(), available: getAvailableCount() },
      uptime: process.uptime(),
    },
    200,
  );
}

async function accountsReloadHandler(c: any) {
  try {
    await initAuth(async (email) => {
      logStore.log('info', 'account', `Reloading ${email}`);
      await configureAccount(email);
    });
    logStore.log('info', 'auth', 'Accounts reloaded');
    return c.json({ ok: true });
  } catch (err: any) {
    logStore.log('error', 'auth', `Reload failed: ${err.message}`);
    return c.json({ error: err.message }, 500);
  }
}

async function deleteAllChatsHandler(c: any) {
  const emails = getAllAccountEmails();
  if (!emails || emails.length === 0) return c.json({ error: 'No accounts configured' }, 400);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let deleted = 0;
      const errors: string[] = [];
      const maskEmail = (e: string) => {
        const at = e.indexOf('@');
        return at > 0 ? e.slice(0, Math.min(at, 3)) + '***' + e.slice(at) : e;
      };
      for (const email of emails) {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'progress', email: maskEmail(email), status: 'deleting' })}\n\n`),
          );
          await deleteAllChats(email);
          deleted++;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'progress', email: maskEmail(email), status: 'done' })}\n\n`));
        } catch (err: any) {
          errors.push(`${maskEmail(email)}: ${err.message}`);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: 'progress', email: maskEmail(email), status: 'error', error: err.message })}\n\n`,
            ),
          );
        }
      }
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({ type: 'result', ok: true, deleted, total: emails.length, errors: errors.length ? errors : undefined })}\n\n`,
        ),
      );
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
  });
}

function sanitizeLogEntry(entry: any): any {
  const sanitized = { ...entry };

  // Mask email addresses (keep first 3 chars)
  if (sanitized.account) {
    const [local, domain] = sanitized.account.split('@');
    sanitized.account = local.substring(0, 3) + '***@' + (domain || '***');
  }

  // Mask prompt content that might contain credentials
  if (sanitized.input?.messages) {
    sanitized.input = {
      ...sanitized.input,
      messages: sanitized.input.messages.map((m: any) => {
        if (typeof m.content === 'string' && m.content.length > 200) {
          return { ...m, content: m.content.substring(0, 200) + '...[truncated]' };
        }
        return m;
      }),
    };
  }

  // Truncate long text fields that may contain sensitive data
  for (const field of ['rawFullContent', 'processedApiOutput', 'remainingText', 'amplificationTriggeredInput', 'rawResponse', 'input']) {
    if (typeof sanitized[field] === 'string' && sanitized[field].length > 500) {
      sanitized[field] = sanitized[field].substring(0, 500) + '...[truncated]';
    }
  }

  // Truncate raw_output and proccessed_output
  if (sanitized.raw_output && sanitized.raw_output.length > 1000) {
    sanitized.raw_output = sanitized.raw_output.substring(0, 1000) + '...[truncated]';
  }
  if (sanitized.proccessed_output && sanitized.proccessed_output.length > 1000) {
    sanitized.proccessed_output = sanitized.proccessed_output.substring(0, 1000) + '...[truncated]';
  }
  // Truncate thinking_content
  if (sanitized.thinking_content && sanitized.thinking_content.length > 2000) {
    sanitized.thinking_content = sanitized.thinking_content.substring(0, 2000) + '...[truncated]';
  }

  return sanitized;
}

function systemLogsHandler(c: any) {
  const limit = parseInt(c.req.query('limit') || '100', 10);
  const category = c.req.query('category');
  const minLevel = c.req.query('level') as 'debug' | 'info' | 'warn' | 'error' | undefined;
  const logs = logStore.getSystemLogs({ limit, category, minLevel });
  return c.json(logs.map(sanitizeLogEntry));
}

function modelHealthHandler(c: any) {
  return c.json(logStore.getAllModelHealth());
}

function monitorHandler(c: any) {
  try {
    return c.json(monitorStore.getSummary());
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
}

function logStreamHandler(c: any) {
  return new Response(
    new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        let alive = true;
        const safeEnqueue = (data: string): boolean => {
          if (!alive) return false;
          try {
            controller.enqueue(encoder.encode(data));
            return true;
          } catch {
            alive = false;
            return false;
          }
        };

        for (const entry of logStore.getRecent(50)) {
          if (!safeEnqueue(`data: ${JSON.stringify(sanitizeLogEntry(entry))}\n\n`)) break;
        }

        const heartbeat = setInterval(() => {
          if (!alive) {
            clearInterval(heartbeat);
            return;
          }
          if (!safeEnqueue(': ping\n\n')) {
            clearInterval(heartbeat);
          }
        }, 15000);
        heartbeat.unref();

        const unsub = logStore.subscribe((entry) => {
          if (!safeEnqueue(`data: ${JSON.stringify(sanitizeLogEntry(entry))}\n\n`)) {
            unsub();
            clearInterval(heartbeat);
            try {
              controller.close();
            } catch {
              /* stream already lost */
            }
          }
        });

        const signal = c.req.raw?.signal;
        if (signal) {
          signal.addEventListener('abort', () => {
            alive = false;
            unsub();
            clearInterval(heartbeat);
            try {
              controller.close();
            } catch {
              /* stream already lost */
            }
          });
        }
      },
    }),
    {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    },
  );
}

function logJsonHandler(c: any) {
  const limit = parseInt(c.req.query('limit') || '50', 10);
  const entries = logStore.getRecent(Math.max(1, Math.min(limit, 500)));
  const serialized = entries.map((e) => {
    const toolCalls = (e.parsedToolCalls || []).map((tc) => {
      let args: unknown = tc.args;
      try {
        args = JSON.parse(tc.args);
      } catch {
        /* keep as string */
      }
      return { name: tc.name, arguments: args };
    });
    return {
      id: e.id,
      timestamp: e.timestamp,
      account: e.accountEmail,
      model: e.model,
      finish_reason: e.finalResponse?.finishReason || null,
      stream: e.stream,
      latency_ms: e.latency_ms,
      thinking_content: e.reasoningContent || '',
      raw_output: e.rawFullContent || '',
      proccessed_output: e.processedApiOutput || '',
      tool_call_count: toolCalls.length,
      tool_calls: toolCalls,
      errors: e.errors || [],
      chunks: e.qwenRawChunks || [],
      input: e.clientRequest || {},
    };
  });
  return c.json(serialized.map(sanitizeLogEntry));
}

function requireApiKey(c: any, next: () => Promise<void>) {
  const denied = checkApiKeyAuth(c);
  if (denied) return denied;
  return next();
}

export function registerDashboardRoutes(app: Hono): void {
  app.get('/dashboard', serveHtml(overviewHtml));
  app.get('/dashboard/accounts', serveHtml(accountsHtml));
  app.get('/dashboard/usage', serveHtml(usageHtml));
  app.get('/dashboard/network', serveHtml(networkHtml));
  app.get('/dashboard/settings', serveHtml(settingsHtml));
  app.get('/dashboard/monitor', serveHtml(monitorHtml));

  app.get('/dashboard/static/:file', dashboardStaticHandler);

  app.get('/', (c) => c.redirect('/dashboard'));
  app.get('/health', healthHandler);
  app.get(
    '/accounts',
    async (c, next) => requireApiKey(c, next),
    (c) => {
      return c.json(getAccountStats());
    },
  );
  app.get(
    '/pool/stats',
    async (c, next) => requireApiKey(c, next),
    (c) => {
      return c.json(sessionPool.getStats());
    },
  );

  app.post(
    '/admin/accounts/reload',
    async (c, next) => {
      const apiKey = config.get('API_KEY');
      if (!apiKey) return await next();
      return bearerAuth({ token: apiKey })(c, next);
    },
    accountsReloadHandler,
  );
  app.post(
    '/dashboard/accounts/delete-all-chats',
    async (c, next) => {
      const apiKey = config.get('API_KEY');
      if (!apiKey) return await next();
      return bearerAuth({ token: apiKey })(c, next);
    },
    deleteAllChatsHandler,
  );

  app.get('/system/logs', async (c, next) => requireApiKey(c, next), systemLogsHandler);
  app.get('/metrics/model-health', async (c, next) => requireApiKey(c, next), modelHealthHandler);
  app.get('/metrics/monitor', async (c, next) => requireApiKey(c, next), monitorHandler);

  app.get('/log', (c) => c.redirect('/dashboard'));

  app.patch(
    '/api/accounts/:email',
    async (c, next) => requireApiKey(c, next),
    async (c) => {
      try {
        const body = await c.req.json();
        const { setAccountDisabled } = await import('../../services/accountManager.ts');
        setAccountDisabled(c.req.param('email'), body.disabled === true);
        return c.json({ ok: true });
      } catch (err: any) {
        return c.json({ error: err.message }, 404);
      }
    },
  );

  app.get('/log/json', async (c, next) => requireApiKey(c, next), logJsonHandler);
  app.get('/log/stream', async (c, next) => requireApiKey(c, next), logStreamHandler);
  app.get(
    '/metrics/uptime',
    async (c, next) => requireApiKey(c, next),
    (c) => {
      return c.json({ uptimeSeconds: logStore.getUptimeSeconds() });
    },
  );

  app.get(
    '/api/config',
    async (c, next) => requireApiKey(c, next),
    (c) => {
      const all = config.getAll();
      const safe = Object.fromEntries(Object.entries(all).filter(([k]) => !['API_KEY'].includes(k)));
      return c.json({ config: safe });
    },
  );

  app.put(
    '/api/config',
    async (c, next) => requireApiKey(c, next),
    async (c) => {
      try {
        const body = await c.req.json();
        let changed = false;
        for (const key of Object.keys(body)) {
          if (typeof body[key] === 'string' && isValidKey(key)) {
            config.set(key, body[key]);
            changed = true;
          }
        }
        if (changed) config.save();
        const all = config.getAll();
        const safe = Object.fromEntries(Object.entries(all).filter(([k]) => !['API_KEY'].includes(k)));
        return c.json({ config: safe });
      } catch {
        return c.json({ error: 'invalid request body' }, 400);
      }
    },
  );
}

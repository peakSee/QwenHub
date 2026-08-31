/**
 * wreq-worker — Node.js sidecar for TLS/HTTP2 impersonation via wreq-js.
 *
 * wreq-js uses Rust + BoringSSL (Chrome's actual TLS library), producing
 * a more authentic fingerprint than impers (libcurl/OpenSSL-based).
 *
 * Runs as a child process spawned by Bun. Communicates via HTTP on localhost.
 *
 * Protocol: same as impers-worker.mjs
 *   POST /
 *   Body: { method, url, headers, body, stream, impersonate, timeout, debugLogDir }
 *
 *   X-Upstream-Status: 200
 *   X-Upstream-Headers: base64(json)
 *   X-Upstream-Url: base64(url)
 *   Body: upstream response body
 */

import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import http from 'node:http';

// Per-identity session pool: `${impersonate}::${proxy||'direct'}` → Session.
// Sessions carry TLS fingerprint + proxy binding; reusing them keeps the
// TLS session resumption and proxy connection warm across requests.
const sessionPool = new Map();
import { join } from 'node:path';
import wreq from 'wreq-js';

process.title = 'qwen-wreq-worker';

const HOST = '127.0.0.1';
const PORT = parseInt(process.env.WREQ_WORKER_PORT || '0', 10);
const MAX_BODY_BYTES = 100 * 1024 * 1024;

const server = http.createServer(async (req, res) => {
  if (req.method !== 'POST') {
    res.writeHead(405);
    res.end();
    return;
  }

  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
    if (body.length > MAX_BODY_BYTES) {
      res.writeHead(413);
      res.end('{"error":"payload too large"}');
      req.destroy();
    }
  });

  req.on('end', async () => {
    let spec;
    try {
      spec = JSON.parse(body);
    } catch {
      res.writeHead(400);
      res.end('{"error":"invalid json"}');
      return;
    }

    const { method = 'GET', url, headers = {}, body: reqBody, stream = false, impersonate = 'chrome_142', timeout = 30, proxy = null } = spec;

    if (!url) {
      res.writeHead(400);
      res.end('{"error":"url required"}');
      return;
    }

    try {
      const session = await wreq.createSession({
        browser: impersonate,
        os: 'linux',
        ...(proxy ? { proxy } : {}),
      });

      try {
        const opts = {
          method,
          headers,
          body: reqBody,
          disableDefaultHeaders: true,
          // ponytail: stream requests must never be aborted by this timer —
          // Qwen thinking models can idle 30-60s+ before/within a stream, and
          // the gate has its own STREAM_IDLE_TIMEOUT_MS (60s) per-read race.
          // Only non-stream requests keep the 30s wall-clock cap.
          ...(stream ? {} : { signal: AbortSignal.timeout(timeout * 1000) }),
        };

        const wreqResp = await session.fetch(url, opts);

        // ─── Debug: dump raw response to file ──────────────────────────
        if (spec.debugLogDir) {
          try {
            const sanitized = (url || '')
              .replace(/https?:\/\//, '')
              .replace(/[^a-zA-Z0-9._~/-]/g, '_')
              .substring(0, 80);
            const ts = new Date().toISOString().replace(/[:.]+/g, '-');
            const dumpDir = String(spec.debugLogDir);
            if (!existsSync(dumpDir)) mkdirSync(dumpDir, { recursive: true });
            const dumpPath = join(dumpDir, `wreq-${ts}-${sanitized}.raw`);
            const headerLines = [`STATUS: ${wreqResp.status}`, `URL: ${wreqResp.url || url}`, ''];
            for (const [k, v] of wreqResp.headers.entries()) {
              headerLines.push(`${k}: ${v}`);
            }
            headerLines.push('', '--- BODY ---', '');
            writeFileSync(dumpPath, headerLines.join('\n'), 'utf8');
            spec._debugDumpPath = dumpPath;
          } catch {
            // debug dump is best-effort
          }
        }

        // Build upstream headers to pass back
        const passthroughHeaders = {};
        const importantHeaders = [
          'content-type',
          'set-cookie',
          'location',
          'content-encoding',
          'transfer-encoding',
          'cache-control',
          'expires',
          'date',
        ];
        for (const h of importantHeaders) {
          const val = wreqResp.headers.get(h);
          if (val) passthroughHeaders[h] = val;
        }

        const upstreamHeadersB64 = Buffer.from(JSON.stringify(passthroughHeaders)).toString('base64');
        const upstreamUrlB64 = Buffer.from(wreqResp.url || url).toString('base64');

        if (stream) {
          // Streaming: chunked transfer encoding
          res.writeHead(200, {
            'X-Upstream-Status': String(wreqResp.status),
            'X-Upstream-Headers': upstreamHeadersB64,
            'X-Upstream-Url': upstreamUrlB64,
            'Content-Type': wreqResp.headers.get('content-type') || 'application/octet-stream',
            'Transfer-Encoding': 'chunked',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          });

          try {
            for await (const chunk of wreqResp.body) {
              res.write(chunk);
              if (spec._debugDumpPath) {
                try {
                  appendFileSync(spec._debugDumpPath, chunk);
                } catch {}
              }
            }
          } catch {
            // stream ended or client disconnected
          }
          res.end();
        } else {
          const buf = await wreqResp.arrayBuffer();
          const bodyBuf = Buffer.from(buf);
          if (spec._debugDumpPath) {
            try {
              appendFileSync(spec._debugDumpPath, bodyBuf);
            } catch {}
          }
          res.writeHead(200, {
            'X-Upstream-Status': String(wreqResp.status),
            'X-Upstream-Headers': upstreamHeadersB64,
            'X-Upstream-Url': upstreamUrlB64,
            'Content-Length': String(bodyBuf.length),
          });
          res.end(bodyBuf);
        }
      } finally {
        try {
          await session.close();
        } catch {}
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      res.writeHead(200, {
        'X-Upstream-Status': '0',
        'X-Upstream-Error': Buffer.from(errMsg).toString('base64'),
      });
      res.end();
    }
  });
});

server.listen(PORT, HOST, () => {
  const addr = server.address();
  console.log(JSON.stringify({ port: addr.port }));
});

/**
 * Vite dev-server plugin that lets the Pipeline Visualizer app run standalone
 * (outside the Cribl iframe sandbox) by:
 *
 *   1. Reading OAuth client credentials from `local.env`.
 *   2. Acquiring a Cribl Cloud bearer token via OAuth client_credentials.
 *   3. Refreshing that token in the background before it expires.
 *   4. Configuring a dev-server proxy at `/api` that forwards to the real
 *      Cribl API and stamps every request with `Authorization: Bearer …`.
 *   5. Injecting `window.CRIBL_API_URL` / `window.CRIBL_BASE_PATH` globals
 *      into `index.html` so the React app keeps using the same code path
 *      it uses when installed as a Cribl App.
 *
 * Activate by creating `local.env` (see `local.env.example`).
 * If `local.env` is absent the plugin is a no-op and the existing landing
 * page behaviour stays untouched.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const LOG_TAG = '[cribl-standalone]';

function parseEnvFile(text) {
  const out = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function loadLocalEnv(root) {
  const candidates = [join(root, 'local.env'), join(root, '.env.local')];
  for (const path of candidates) {
    if (existsSync(path)) {
      try {
        const text = readFileSync(path, 'utf-8');
        const parsed = parseEnvFile(text);
        return { path, env: parsed };
      } catch (err) {
        console.error(`${LOG_TAG} Failed to read ${path}: ${err.message}`);
      }
    }
  }
  return null;
}

function requireEnv(env, key) {
  const v = env[key];
  if (!v || !v.trim()) {
    throw new Error(
      `${LOG_TAG} Missing required value for ${key} in local.env`,
    );
  }
  return v.trim();
}

function stripTrailingApi(url) {
  return url.replace(/\/api\/v1\/?$/, '').replace(/\/+$/, '');
}

class TokenManager {
  constructor({ tokenUrl, clientId, clientSecret, audience, insecureTls }) {
    this.tokenUrl = tokenUrl;
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.audience = audience;
    this.insecureTls = insecureTls;
    this.token = null;
    this.expiresAt = 0;
    this.inflight = null;
  }

  async getToken() {
    const now = Date.now();
    // Refresh 5 minutes before actual expiry to absorb clock skew.
    if (this.token && now < this.expiresAt - 5 * 60_000) return this.token;
    if (this.inflight) return this.inflight;
    this.inflight = this.fetchToken().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  async fetchToken() {
    const previous = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    if (this.insecureTls) {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    }
    try {
      const res = await fetch(this.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          grant_type: 'client_credentials',
          client_id: this.clientId,
          client_secret: this.clientSecret,
          audience: this.audience,
        }),
      });
      const text = await res.text();
      if (!res.ok) {
        throw new Error(
          `OAuth ${this.tokenUrl} → ${res.status} ${res.statusText}: ${text.slice(0, 400)}`,
        );
      }
      let data;
      try {
        data = JSON.parse(text);
      } catch (err) {
        throw new Error(
          `OAuth response was not JSON: ${text.slice(0, 200)}`,
        );
      }
      if (!data.access_token) {
        throw new Error(
          `OAuth response missing access_token: ${text.slice(0, 200)}`,
        );
      }
      const expiresInSec = Number(data.expires_in) || 3600;
      this.token = data.access_token;
      this.expiresAt = Date.now() + expiresInSec * 1000;
      console.log(
        `${LOG_TAG} Acquired bearer token (expires in ${Math.round(expiresInSec / 60)}m)`,
      );
      return this.token;
    } finally {
      if (this.insecureTls) {
        if (previous === undefined) {
          delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
        } else {
          process.env.NODE_TLS_REJECT_UNAUTHORIZED = previous;
        }
      }
    }
  }

  invalidate() {
    this.token = null;
    this.expiresAt = 0;
  }
}

export function criblStandalonePlugin() {
  let target = null;
  let manager = null;
  let envPath = null;
  let insecureTls = false;
  let lastError = null;

  return {
    name: 'cribl-standalone',
    enforce: 'pre',

    config(config, { command }) {
      if (command !== 'serve') return;
      const root = config.root || process.cwd();
      const loaded = loadLocalEnv(root);
      if (!loaded) {
        return;
      }
      try {
        const env = loaded.env;
        const apiBase = stripTrailingApi(requireEnv(env, 'CRIBL_API_URL'));
        const tokenUrl = requireEnv(env, 'CRIBL_TOKEN_URL');
        const clientId = requireEnv(env, 'CRIBL_CLIENT_ID');
        const clientSecret = requireEnv(env, 'CRIBL_CLIENT_SECRET');
        const audience =
          env.CRIBL_AUDIENCE && env.CRIBL_AUDIENCE.trim()
            ? env.CRIBL_AUDIENCE.trim()
            : 'https://api.cribl.cloud';
        insecureTls = /^(1|true|yes)$/i.test(env.CRIBL_INSECURE_TLS || '');

        target = apiBase;
        envPath = loaded.path;
        manager = new TokenManager({
          tokenUrl,
          clientId,
          clientSecret,
          audience,
          insecureTls,
        });
      } catch (err) {
        lastError = err.message;
        console.error(
          `${LOG_TAG} Disabled — ${err.message}\n` +
            `${LOG_TAG} Fix local.env or remove the file to suppress this message.`,
        );
        return;
      }

      console.log(
        `${LOG_TAG} Loaded credentials from ${loaded.path}\n` +
          `${LOG_TAG} Proxying /api → ${target}/api\n` +
          `${LOG_TAG} Open http://127.0.0.1:${config.server?.port ?? 5173}`,
      );

      return {
        server: {
          proxy: {
            '/api': {
              target,
              changeOrigin: true,
              secure: !insecureTls,
              configure: (proxy) => {
                proxy.on('proxyReq', (proxyReq, req) => {
                  if (manager?.token) {
                    proxyReq.setHeader(
                      'Authorization',
                      `Bearer ${manager.token}`,
                    );
                  } else {
                    console.warn(
                      `${LOG_TAG} → ${req.method} ${req.url} — no cached token yet, request will likely 401`,
                    );
                  }
                  proxyReq.setHeader('Accept', 'application/json');
                  // Per-request traces (`→ GET …` / `← 200 GET …`) used to be
                  // emitted here. They duplicated the in-app Debug panel
                  // and made the dev-server terminal too noisy to read.
                  // Warnings + errors below are still logged.
                  // Some Cribl POST endpoints hang if the body has been buffered
                  // by an upstream middleware. Re-stream the body explicitly.
                  if (
                    req.method !== 'GET' &&
                    req.method !== 'HEAD' &&
                    req.body !== undefined &&
                    req.body !== null
                  ) {
                    const payload =
                      typeof req.body === 'string'
                        ? req.body
                        : JSON.stringify(req.body);
                    proxyReq.setHeader(
                      'Content-Type',
                      'application/json',
                    );
                    proxyReq.setHeader(
                      'Content-Length',
                      Buffer.byteLength(payload),
                    );
                    proxyReq.write(payload);
                    proxyReq.end();
                  }
                });
                proxy.on('proxyRes', (proxyRes, req) => {
                  if (proxyRes.statusCode === 401) {
                    console.warn(
                      `${LOG_TAG} Got 401 from upstream on ${req.method} ${req.url} — invalidating cached token.`,
                    );
                    manager?.invalidate();
                  } else if (proxyRes.statusCode >= 500) {
                    console.warn(
                      `${LOG_TAG} ← ${proxyRes.statusCode} ${req.method} ${req.url}`,
                    );
                  }
                });
                proxy.on('error', (err, req) => {
                  console.error(
                    `${LOG_TAG} Proxy error on ${req?.method ?? '?'} ${req?.url ?? '?'}: ${err.message}`,
                  );
                });
              },
            },
          },
        },
      };
    },

    configureServer(server) {
      if (!manager) return;

      server.middlewares.use('/api', (req, res, next) => {
        // Fast path: a fresh cached token lets us advance to the proxy
        // synchronously. Critical for POST requests — if we await in a
        // microtask before calling next(), Connect/http-proxy can lose the
        // body's `data` events, which causes the upstream to either reject
        // the request or hang waiting for a body that never arrives. Even
        // when Cribl starts the job (matched on the URL alone) it then
        // never sends the response because it's still waiting on the
        // request stream.
        const now = Date.now();
        if (manager.token && now < manager.expiresAt - 5 * 60_000) {
          next();
          return;
        }
        // Cold/expiring token: pause the request so any incoming body bytes
        // are buffered until the proxy attaches its own listeners.
        try {
          req.pause();
        } catch {
          // Some streams (already-ended GETs) throw — safe to ignore.
        }
        manager
          .getToken()
          .then(() => {
            try {
              req.resume();
            } catch {
              // ignore
            }
            next();
          })
          .catch((err) => {
            console.error(`${LOG_TAG} Token refresh failed: ${err.message}`);
            res.statusCode = 502;
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                error: 'cribl-standalone token refresh failed',
                detail: err.message,
              }),
            );
          });
      });

      // Pre-warm the token so the first request doesn't pay the auth round-trip.
      manager.getToken().catch((err) => {
        console.error(`${LOG_TAG} Initial token fetch failed: ${err.message}`);
      });

      // Background refresh loop.
      const interval = setInterval(
        () => {
          manager.getToken().catch((err) => {
            console.error(
              `${LOG_TAG} Background token refresh failed: ${err.message}`,
            );
          });
        },
        30 * 60_000,
      );
      server.httpServer?.on('close', () => clearInterval(interval));
    },

    transformIndexHtml(html, ctx) {
      // Always inject globals so the React app's CRIBL_API_URL guard passes.
      // In standalone mode we point it at the local proxy; without local.env we
      // still inject `null`-safe defaults so the existing iframe code path
      // continues to work when served standalone via `npm run preview`.
      const tags = [
        {
          tag: 'script',
          children:
            manager && target
              ? `window.CRIBL_API_URL = '/api/v1'; window.CRIBL_BASE_PATH = '/'; window.CRIBL_STANDALONE = ${JSON.stringify(
                  {
                    target,
                    envPath,
                    audience: manager.audience,
                    insecureTls,
                  },
                )};`
              : `window.CRIBL_STANDALONE = ${JSON.stringify(
                  lastError ? { disabled: true, error: lastError } : { disabled: true },
                )};`,
          injectTo: 'head-prepend',
        },
      ];
      return { html, tags };
    },
  };
}

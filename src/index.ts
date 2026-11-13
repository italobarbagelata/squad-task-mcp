#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ApiClient, createApiClientFromEnv } from './api-client.js';
import { registerProjectTools } from './tools/projects.js';
import { registerIssueTools } from './tools/issues.js';
import { registerSprintTools } from './tools/sprints.js';
import { registerUserTools } from './tools/users.js';
import { registerCommentTools } from './tools/comments.js';
import { registerTeamTools } from './tools/teams.js';
import { registerNotificationTools } from './tools/notifications.js';
import { registerVotingTools } from './tools/voting.js';
import { registerIssueLinkTools } from './tools/issue-links.js';
import { registerActivityTools } from './tools/activities.js';
import { registerSearchTools } from './tools/search.js';
import { registerLabelTools } from './tools/labels.js';
import { registerReportTools } from './tools/reports.js';
import { registerInvitationTools } from './tools/invitations.js';
import { registerBillingTools } from './tools/billing.js';
import { registerVersionTools } from './tools/versions.js';
import { registerWatcherTools } from './tools/watchers.js';
import { registerWorkLogTools } from './tools/work-logs.js';
import { registerBulkTools } from './tools/bulk.js';
import { registerProjectRepoTools } from './tools/project-repos.js';

function createSquadServer(client: ApiClient): McpServer {
  const server = new McpServer({
    name: 'squad',
    version: '2.0.0',
  });

  // Core
  registerProjectTools(server, client);
  registerIssueTools(server, client);
  registerSprintTools(server, client);
  registerUserTools(server, client);
  registerCommentTools(server, client);

  // Repos
  registerProjectRepoTools(server, client);

  // Collaboration
  registerTeamTools(server, client);
  registerVotingTools(server, client);
  registerIssueLinkTools(server, client);
  registerActivityTools(server, client);
  registerNotificationTools(server, client);
  registerInvitationTools(server, client);

  // Utilities
  registerSearchTools(server, client);
  registerLabelTools(server, client);
  registerReportTools(server, client);
  registerBillingTools(server, client);

  // New features
  registerVersionTools(server, client);
  registerWatcherTools(server, client);
  registerWorkLogTools(server, client);
  registerBulkTools(server, client);

  return server;
}

// ── Stdio mode (local, default) ─────────────────────────────────────────────

async function startStdio() {
  const client = createApiClientFromEnv();
  const server = createSquadServer(client);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// ── HTTP mode (remote, for VPS) ─────────────────────────────────────────────

async function startHttp() {
  const PORT = parseInt(process.env.MCP_PORT || '3001', 10);
  const HOST = process.env.HOST ?? '127.0.0.1';
  const API_URL = process.env.SQUAD_API_URL || process.env.TASKMANAGER_API_URL || 'http://localhost:8000';
  const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  const SESSION_TTL_MS = 30 * 60 * 1000;
  const MAX_SESSIONS = 100;
  const CLIENT_TTL_MS = 30 * 60 * 1000;
  const FAILED_LOGIN_TTL_MS = 30 * 1000;
  const MAX_CACHED_CLIENTS = 500;

  // Authenticated API clients reused across MCP sessions with the same
  // credentials. Every MCP `initialize` used to log in again; clients that
  // reconnect in bursts exhausted the backend's per-IP login rate limit
  // (all MCP logins share this server's IP). Keyed by a hash so raw
  // credentials are never used as map keys.
  const clientCache = new Map<string, { client: ApiClient; lastUsed: number }>();
  // Recently failed credentials: answer 401 locally instead of hammering login.
  const failedLogins = new Map<string, number>();
  const credentialKey = (email: string, password: string) =>
    createHash('sha256').update(`${API_URL}\0${email}\0${password}`).digest('hex');

  // Map of session ID -> { server, transport, lastSeen }
  const sessions = new Map<
    string,
    { server: McpServer; transport: StreamableHTTPServerTransport; lastSeen: number }
  >();

  // Evict sessions idle for longer than SESSION_TTL_MS, plus stale cached
  // clients and expired failed-login entries.
  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of clientCache) {
      if (now - entry.lastUsed > CLIENT_TTL_MS) clientCache.delete(key);
    }
    for (const [key, failedAt] of failedLogins) {
      if (now - failedAt > FAILED_LOGIN_TTL_MS) failedLogins.delete(key);
    }
    for (const [sid, session] of sessions) {
      if (now - session.lastSeen > SESSION_TTL_MS) {
        sessions.delete(sid);
        session.transport.close().catch(() => {});
        console.log(`Session expired: ${sid}`);
      }
    }
  }, 60 * 1000);
  sweeper.unref();

  const httpServer = createServer(async (req, res) => {
    // CORS: only for explicitly allowed origins (MCP clients are not browsers).
    const origin = req.headers.origin;
    if (origin && ALLOWED_ORIGINS.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, mcp-session-id, x-squad-email, x-squad-password');
      res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id');
    }

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Health check
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', name: 'squad-mcp-server', version: '2.0.0' }));
      return;
    }

    // Landing page
    if (req.url === '/' || req.url === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>xSquad MCP Server</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #080809; color: #f0f0f0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .card { text-align: center; padding: 3rem 2rem; max-width: 420px; }
    .logo { width: 56px; height: 56px; margin: 0 auto 1.5rem; background: linear-gradient(135deg, #7033ff, #a78bfa); border-radius: 16px; display: flex; align-items: center; justify-content: center; box-shadow: 0 8px 24px rgba(112,51,255,0.3); }
    .logo svg { width: 28px; height: 28px; }
    h1 { font-size: 1.5rem; font-weight: 700; margin-bottom: 0.5rem; }
    .subtitle { color: #888; font-size: 0.875rem; margin-bottom: 2rem; }
    .status { display: inline-flex; align-items: center; gap: 8px; padding: 8px 16px; background: rgba(76,183,130,0.1); border: 1px solid rgba(76,183,130,0.25); border-radius: 999px; font-size: 0.8125rem; color: #4CB782; font-weight: 500; }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: #4CB782; animation: pulse 2s ease-in-out infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
    .info { margin-top: 2rem; display: flex; flex-direction: column; gap: 0.5rem; }
    .info a, .info span { font-size: 0.75rem; color: #555; }
    .info a { color: #8c5cff; text-decoration: none; }
    .info a:hover { text-decoration: underline; }
    .endpoints { margin-top: 1.5rem; text-align: left; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 1rem 1.25rem; }
    .endpoints h3 { font-size: 0.75rem; color: #888; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.75rem; }
    .ep { display: flex; align-items: center; gap: 0.5rem; padding: 0.35rem 0; font-size: 0.8125rem; }
    .method { font-size: 0.625rem; font-weight: 600; padding: 2px 6px; border-radius: 4px; font-family: monospace; }
    .get { background: rgba(76,183,130,0.15); color: #4CB782; }
    .post { background: rgba(112,51,255,0.15); color: #a78bfa; }
    .path { color: #ccc; font-family: monospace; font-size: 0.8125rem; }
    .desc { color: #555; font-size: 0.75rem; margin-left: auto; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">
      <svg viewBox="0 0 26 26" fill="none"><rect x="2" y="6" width="6" height="16" rx="1.5" fill="white"/><rect x="10" y="10" width="6" height="12" rx="1.5" fill="white" fill-opacity="0.7"/><rect x="18" y="14" width="6" height="8" rx="1.5" fill="white" fill-opacity="0.4"/></svg>
    </div>
    <h1>xSquad MCP Server</h1>
    <p class="subtitle">Model Context Protocol server para xSquad</p>
    <div class="status"><span class="dot"></span> Operativo</div>
    <div class="endpoints">
      <h3>Endpoints</h3>
      <div class="ep"><span class="method get">GET</span><span class="path">/health</span><span class="desc">Health check</span></div>
      <div class="ep"><span class="method post">POST</span><span class="path">/mcp</span><span class="desc">MCP protocol</span></div>
    </div>
    <div class="info">
      <span>v2.0.0 · ${sessions.size} sesiones activas</span>
      <a href="/health">/health</a>
    </div>
  </div>
</body>
</html>`);
      return;
    }

    // Only handle /mcp path
    if (req.url !== '/mcp' && !req.url?.startsWith('/mcp?')) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found', endpoints: ['/', '/health', '/mcp'] }));
      return;
    }

    // Check for existing session
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    if (sessionId && sessions.has(sessionId)) {
      // Existing session - route to its transport
      const session = sessions.get(sessionId)!;
      session.lastSeen = Date.now();
      await session.transport.handleRequest(req, res);
      return;
    }

    if (sessionId && !sessions.has(sessionId)) {
      // Invalid session
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Session not found' }));
      return;
    }

    // New session - only on POST (initialization)
    if (req.method === 'POST') {
      // Extract per-user credentials from headers
      const userEmail = req.headers['x-squad-email'] as string | undefined;
      const userPassword = req.headers['x-squad-password'] as string | undefined;

      if (!userEmail || !userPassword) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'Authentication required. Send x-squad-email and x-squad-password headers.',
        }));
        return;
      }

      if (sessions.size >= MAX_SESSIONS) {
        res.writeHead(503, { 'Content-Type': 'application/json', 'Retry-After': '60' });
        res.end(JSON.stringify({ error: 'Too many active sessions, try again later' }));
        return;
      }

      const key = credentialKey(userEmail, userPassword);
      const failedAt = failedLogins.get(key);
      if (failedAt && Date.now() - failedAt < FAILED_LOGIN_TTL_MS) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid credentials' }));
        return;
      }

      let client: ApiClient;
      const cached = clientCache.get(key);
      if (cached) {
        cached.lastUsed = Date.now();
        client = cached.client;
      } else {
        client = new ApiClient({
          apiUrl: API_URL,
          email: userEmail,
          password: userPassword,
        });
        // Verify credentials before creating session
        try {
          await client.ensureAuth();
        } catch (err) {
          failedLogins.set(key, Date.now());
          console.warn(`Login failed for MCP session: ${(err as Error).message.slice(0, 120)}`);
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid credentials' }));
          return;
        }
        if (clientCache.size >= MAX_CACHED_CLIENTS) {
          const oldest = [...clientCache.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed)[0];
          if (oldest) clientCache.delete(oldest[0]);
        }
        clientCache.set(key, { client, lastUsed: Date.now() });
      }

      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
      });

      const server = createSquadServer(client);

      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid) {
          sessions.delete(sid);
          console.log(`Session closed: ${sid}`);
        }
      };

      await server.connect(transport);

      // Handle the request - this will set the session ID in the response
      await transport.handleRequest(req, res);

      // Store the session after handling (session ID is set by handleRequest)
      const newSessionId = transport.sessionId;
      if (newSessionId) {
        sessions.set(newSessionId, { server, transport, lastSeen: Date.now() });
        console.log(`New session: ${newSessionId}`);
      }

      return;
    }

    // GET without session (for SSE standalone) or other methods
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Bad request - session ID required for GET, or use POST to initialize' }));
  });

  httpServer.listen(PORT, HOST, () => {
    console.log(`Squad MCP Server v2.0.0 (HTTP mode)`);
    console.log(`Listening on http://${HOST}:${PORT}/mcp`);
    console.log(`Health check: http://${HOST}:${PORT}/health`);
  });
}

// ── Main ────────────────────────────────────────────────────────────────────

const mode = process.argv.includes('--http') ? 'http' : 'stdio';

if (mode === 'http') {
  startHttp().catch((err) => {
    console.error('Failed to start Squad MCP server (HTTP):', err);
    process.exit(1);
  });
} else {
  startStdio().catch((err) => {
    console.error('Failed to start Squad MCP server (stdio):', err);
    process.exit(1);
  });
}

#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { ApiClient, createApiClientFromEnv } from './api-client.js';
import { registerProjectTools } from './tools/projects.js';
import { registerIssueTools } from './tools/issues.js';
import { registerSprintTools } from './tools/sprints.js';
import { registerUserTools } from './tools/users.js';
import { registerCommentTools } from './tools/comments.js';
import { registerWorkerTools } from './tools/worker.js';
import { registerSquadTools } from './tools/squad.js';
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

  // Squad AI
  registerWorkerTools(server, client);
  registerSquadTools(server, client);

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

  // Map of session ID -> { server, transport }
  const sessions = new Map<string, { server: McpServer; transport: StreamableHTTPServerTransport }>();

  const httpServer = createServer(async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, mcp-session-id, x-squad-email, x-squad-password, x-squad-api-url');
    res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id');

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

    // Only handle /mcp path
    if (req.url !== '/mcp') {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    // Check for existing session
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    if (sessionId && sessions.has(sessionId)) {
      // Existing session - route to its transport
      const session = sessions.get(sessionId)!;
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
      const userApiUrl = req.headers['x-squad-api-url'] as string | undefined;

      if (!userEmail || !userPassword) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'Authentication required. Send x-squad-email and x-squad-password headers.',
        }));
        return;
      }

      const client = new ApiClient({
        apiUrl: userApiUrl || process.env.SQUAD_API_URL || 'http://localhost:8000',
        email: userEmail,
        password: userPassword,
      });

      // Verify credentials before creating session
      try {
        await client.ensureAuth();
      } catch {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid credentials' }));
        return;
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
        sessions.set(newSessionId, { server, transport });
        console.log(`New session: ${newSessionId}`);
      }

      return;
    }

    // GET without session (for SSE standalone) or other methods
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Bad request - session ID required for GET, or use POST to initialize' }));
  });

  httpServer.listen(PORT, () => {
    console.log(`Squad MCP Server v2.0.0 (HTTP mode)`);
    console.log(`Listening on http://0.0.0.0:${PORT}/mcp`);
    console.log(`Health check: http://0.0.0.0:${PORT}/health`);
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

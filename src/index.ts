#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ensureAuth } from './api-client.js';
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

const server = new McpServer({
  name: 'squad',
  version: '2.0.0',
});

// Core
registerProjectTools(server);
registerIssueTools(server);
registerSprintTools(server);
registerUserTools(server);
registerCommentTools(server);

// Squad AI
registerWorkerTools(server);
registerSquadTools(server);

// Collaboration
registerTeamTools(server);
registerVotingTools(server);
registerIssueLinkTools(server);
registerActivityTools(server);
registerNotificationTools(server);
registerInvitationTools(server);

// Utilities
registerSearchTools(server);
registerLabelTools(server);
registerReportTools(server);
registerBillingTools(server);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('Failed to start Squad MCP server:', err);
  process.exit(1);
});

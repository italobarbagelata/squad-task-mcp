import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ApiClient } from '../api-client.js';

export function registerWatcherTools(server: McpServer, client: ApiClient) {
  server.tool(
    'list_watchers',
    'Lista todos los watchers (observadores) de un issue.',
    { issueId: z.string().describe('ID del issue') },
    async ({ issueId }) => {
      const watchers = await client.api(`/api/issues/${issueId}/watchers`);
      return { content: [{ type: 'text', text: JSON.stringify(watchers, null, 2) }] };
    },
  );

  server.tool(
    'watch_issue',
    'Agrega al usuario actual como watcher del issue para recibir notificaciones.',
    { issueId: z.string().describe('ID del issue') },
    async ({ issueId }) => {
      const watcher = await client.api(`/api/issues/${issueId}/watchers`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      return { content: [{ type: 'text', text: JSON.stringify(watcher, null, 2) }] };
    },
  );

  server.tool(
    'unwatch_issue',
    'Deja de observar un issue (quita al usuario actual como watcher).',
    { issueId: z.string().describe('ID del issue') },
    async ({ issueId }) => {
      await client.api(`/api/issues/${issueId}/watchers`, { method: 'DELETE' });
      return { content: [{ type: 'text', text: 'Unwatched successfully' }] };
    },
  );

  server.tool(
    'check_watching',
    'Verifica si el usuario actual está observando un issue.',
    { issueId: z.string().describe('ID del issue') },
    async ({ issueId }) => {
      const result = await client.api(`/api/issues/${issueId}/watchers/me`);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );
}

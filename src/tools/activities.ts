import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { api } from '../api-client.js';

export function registerActivityTools(server: McpServer) {
  server.tool(
    'list_activities',
    'Lista el historial de actividades/cambios de un issue. Muestra quién hizo qué y cuándo (cambios de estado, asignación, etc.).',
    { issueId: z.string().describe('ID del issue') },
    async ({ issueId }) => {
      const activities = await api(`/api/issues/${issueId}/activities`);
      return { content: [{ type: 'text', text: JSON.stringify(activities, null, 2) }] };
    },
  );
}

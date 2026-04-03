import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ApiClient } from '../api-client.js';

export function registerBulkTools(server: McpServer, client: ApiClient) {
  server.tool(
    'bulk_update_issues',
    'Actualiza múltiples issues a la vez. Permite cambiar status, assignee, sprint, prioridad, versión o labels en lote.',
    {
      projectId: z.string().describe('ID del proyecto'),
      issueIds: z.array(z.string()).describe('Lista de IDs de issues a actualizar'),
      status: z.string().optional().describe('Nuevo status para todos'),
      assigneeId: z.string().optional().describe('Nuevo assignee para todos'),
      sprintId: z.string().optional().describe('Nuevo sprint para todos'),
      priority: z.string().optional().describe('Nueva prioridad para todos'),
      versionId: z.string().optional().describe('Nueva versión para todos'),
      labelIds: z.array(z.string()).optional().describe('Nuevos labels para todos'),
    },
    async ({ projectId, ...data }) => {
      const result = await client.api(`/api/projects/${projectId}/issues/bulk`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'bulk_delete_issues',
    'Elimina múltiples issues a la vez. Requiere rol de Admin en el proyecto.',
    {
      projectId: z.string().describe('ID del proyecto'),
      issueIds: z.array(z.string()).describe('Lista de IDs de issues a eliminar'),
    },
    async ({ projectId, issueIds }) => {
      const result = await client.api(`/api/projects/${projectId}/issues/bulk/delete`, {
        method: 'POST',
        body: JSON.stringify({ issueIds }),
      });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );
}

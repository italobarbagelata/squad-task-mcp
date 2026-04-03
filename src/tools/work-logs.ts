import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ApiClient } from '../api-client.js';

export function registerWorkLogTools(server: McpServer, client: ApiClient) {
  server.tool(
    'list_work_logs',
    'Lista todos los registros de trabajo (work logs) de un issue.',
    { issueId: z.string().describe('ID del issue') },
    async ({ issueId }) => {
      const logs = await client.api(`/api/issues/${issueId}/work-logs`);
      return { content: [{ type: 'text', text: JSON.stringify(logs, null, 2) }] };
    },
  );

  server.tool(
    'log_work',
    'Registra tiempo de trabajo en un issue. El tiempo se auto-suma al total del issue.',
    {
      issueId: z.string().describe('ID del issue'),
      timeSpent: z.number().describe('Tiempo en minutos (ej: 120 para 2 horas)'),
      description: z.string().optional().describe('Descripción del trabajo realizado'),
      workDate: z.string().describe('Fecha del trabajo (ISO 8601)'),
    },
    async ({ issueId, timeSpent, description, workDate }) => {
      const log = await client.api(`/api/issues/${issueId}/work-logs`, {
        method: 'POST',
        body: JSON.stringify({ timeSpent, description, workDate }),
      });
      return { content: [{ type: 'text', text: JSON.stringify(log, null, 2) }] };
    },
  );

  server.tool(
    'update_work_log',
    'Actualiza un registro de trabajo existente (solo el autor puede editarlo).',
    {
      issueId: z.string().describe('ID del issue'),
      workLogId: z.string().describe('ID del work log'),
      timeSpent: z.number().optional().describe('Nuevo tiempo en minutos'),
      description: z.string().optional().describe('Nueva descripción'),
      workDate: z.string().optional().describe('Nueva fecha'),
    },
    async ({ issueId, workLogId, ...data }) => {
      const log = await client.api(`/api/issues/${issueId}/work-logs/${workLogId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
      return { content: [{ type: 'text', text: JSON.stringify(log, null, 2) }] };
    },
  );

  server.tool(
    'delete_work_log',
    'Elimina un registro de trabajo (solo el autor puede eliminarlo).',
    {
      issueId: z.string().describe('ID del issue'),
      workLogId: z.string().describe('ID del work log'),
    },
    async ({ issueId, workLogId }) => {
      await client.api(`/api/issues/${issueId}/work-logs/${workLogId}`, {
        method: 'DELETE',
      });
      return { content: [{ type: 'text', text: 'Work log deleted successfully' }] };
    },
  );
}

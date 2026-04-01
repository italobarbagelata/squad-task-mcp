import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ApiClient } from '../api-client.js';

export function registerIssueLinkTools(server: McpServer, client: ApiClient) {
  server.tool(
    'list_issue_links',
    'Lista los links/relaciones de un issue (blocks, relates_to, duplicates, causes).',
    {
      projectId: z.string().describe('ID del proyecto'),
      issueId: z.string().describe('ID del issue'),
    },
    async ({ projectId, issueId }) => {
      const links = await client.api(`/api/projects/${projectId}/issues/${issueId}/links`);
      return { content: [{ type: 'text', text: JSON.stringify(links, null, 2) }] };
    },
  );

  server.tool(
    'create_issue_link',
    'Crea un link/relación entre dos issues.',
    {
      projectId: z.string().describe('ID del proyecto'),
      issueId: z.string().describe('ID del issue origen'),
      targetIssueId: z.string().describe('ID del issue destino'),
      linkType: z.enum(['blocks', 'relates_to', 'duplicates', 'causes']).describe('Tipo de relación'),
    },
    async ({ projectId, issueId, targetIssueId, linkType }) => {
      const link = await client.api(`/api/projects/${projectId}/issues/${issueId}/links`, {
        method: 'POST',
        body: JSON.stringify({ targetIssueId, linkType }),
      });
      return { content: [{ type: 'text', text: JSON.stringify(link, null, 2) }] };
    },
  );

  server.tool(
    'delete_issue_link',
    'Elimina un link entre issues.',
    {
      projectId: z.string().describe('ID del proyecto'),
      issueId: z.string().describe('ID del issue'),
      linkId: z.string().describe('ID del link a eliminar'),
    },
    async ({ projectId, issueId, linkId }) => {
      await client.api(`/api/projects/${projectId}/issues/${issueId}/links/${linkId}`, { method: 'DELETE' });
      return { content: [{ type: 'text', text: `Link ${linkId} eliminado.` }] };
    },
  );
}

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ApiClient } from '../api-client.js';

export function registerCommentTools(server: McpServer, client: ApiClient) {
  server.tool(
    'list_comments',
    'Lista todos los comentarios de un issue, ordenados cronológicamente.',
    { issueId: z.string().describe('ID del issue') },
    async ({ issueId }) => {
      const comments = await client.api(`/api/issues/${issueId}/comments`);
      return { content: [{ type: 'text', text: JSON.stringify(comments, null, 2) }] };
    },
  );

  server.tool(
    'add_comment',
    'Agrega un comentario a un issue. Útil para documentar decisiones, dejar notas o comunicar progreso.',
    {
      issueId: z.string().describe('ID del issue'),
      content: z.string().describe('Contenido del comentario'),
    },
    async ({ issueId, content }) => {
      const comment = await client.api(`/api/issues/${issueId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ content }),
      });
      return { content: [{ type: 'text', text: JSON.stringify(comment, null, 2) }] };
    },
  );
}

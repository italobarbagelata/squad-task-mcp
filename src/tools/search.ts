import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { api } from '../api-client.js';

export function registerSearchTools(server: McpServer) {
  server.tool(
    'search',
    'Búsqueda global en Squad. Busca issues, proyectos y usuarios por texto.',
    { query: z.string().describe('Texto de búsqueda') },
    async ({ query }) => {
      const results = await api(`/api/search?q=${encodeURIComponent(query)}`);
      return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
    },
  );
}

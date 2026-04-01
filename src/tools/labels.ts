import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { api } from '../api-client.js';

export function registerLabelTools(server: McpServer) {
  server.tool(
    'list_labels',
    'Lista todas las etiquetas disponibles.',
    {},
    async () => {
      const labels = await api('/api/labels');
      return { content: [{ type: 'text', text: JSON.stringify(labels, null, 2) }] };
    },
  );

  server.tool(
    'create_label',
    'Crea una nueva etiqueta.',
    {
      name: z.string().describe('Nombre de la etiqueta'),
      color: z.string().optional().describe('Color hex (ej: "#EF4444")'),
    },
    async ({ name, color }) => {
      const label = await api('/api/labels', {
        method: 'POST',
        body: JSON.stringify({ name, color }),
      });
      return { content: [{ type: 'text', text: JSON.stringify(label, null, 2) }] };
    },
  );

  server.tool(
    'delete_label',
    'Elimina una etiqueta.',
    { labelId: z.string().describe('ID de la etiqueta a eliminar') },
    async ({ labelId }) => {
      await api(`/api/labels/${labelId}`, { method: 'DELETE' });
      return { content: [{ type: 'text', text: `Etiqueta ${labelId} eliminada.` }] };
    },
  );
}

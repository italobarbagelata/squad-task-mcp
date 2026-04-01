import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { api } from '../api-client.js';

export function registerUserTools(server: McpServer) {
  server.tool(
    'list_users',
    'Lista todos los usuarios del sistema con su ID, nombre, email y rol. Útil para obtener IDs de usuarios al asignar issues.',
    {},
    async () => {
      const users = await api('/api/users');
      return { content: [{ type: 'text', text: JSON.stringify(users, null, 2) }] };
    },
  );

  server.tool(
    'get_my_issues',
    'Obtiene todos los issues asignados al usuario autenticado actual.',
    {},
    async () => {
      const issues = await api('/api/users/me/issues');
      return { content: [{ type: 'text', text: JSON.stringify(issues, null, 2) }] };
    },
  );
}

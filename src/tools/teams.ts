import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { api } from '../api-client.js';

export function registerTeamTools(server: McpServer) {
  server.tool(
    'list_teams',
    'Lista todos los equipos con sus miembros y líder.',
    {},
    async () => {
      const teams = await api('/api/teams');
      return { content: [{ type: 'text', text: JSON.stringify(teams, null, 2) }] };
    },
  );

  server.tool(
    'get_team',
    'Obtiene el detalle de un equipo por su ID.',
    { teamId: z.string().describe('ID del equipo') },
    async ({ teamId }) => {
      const team = await api(`/api/teams/${teamId}`);
      return { content: [{ type: 'text', text: JSON.stringify(team, null, 2) }] };
    },
  );

  server.tool(
    'create_team',
    'Crea un nuevo equipo.',
    {
      name: z.string().describe('Nombre del equipo'),
      description: z.string().optional().describe('Descripción del equipo'),
    },
    async ({ name, description }) => {
      const team = await api('/api/teams', {
        method: 'POST',
        body: JSON.stringify({ name, description }),
      });
      return { content: [{ type: 'text', text: JSON.stringify(team, null, 2) }] };
    },
  );

  server.tool(
    'update_team',
    'Actualiza un equipo existente.',
    {
      teamId: z.string().describe('ID del equipo'),
      name: z.string().optional().describe('Nuevo nombre'),
      description: z.string().optional().describe('Nueva descripción'),
    },
    async ({ teamId, ...body }) => {
      const team = await api(`/api/teams/${teamId}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      return { content: [{ type: 'text', text: JSON.stringify(team, null, 2) }] };
    },
  );

  server.tool(
    'add_team_member',
    'Agrega un usuario a un equipo.',
    {
      teamId: z.string().describe('ID del equipo'),
      userId: z.string().describe('ID del usuario a agregar'),
    },
    async ({ teamId, userId }) => {
      const result = await api(`/api/teams/${teamId}/members`, {
        method: 'POST',
        body: JSON.stringify({ userId }),
      });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'remove_team_member',
    'Remueve un usuario de un equipo.',
    {
      teamId: z.string().describe('ID del equipo'),
      userId: z.string().describe('ID del usuario a remover'),
    },
    async ({ teamId, userId }) => {
      await api(`/api/teams/${teamId}/members/${userId}`, { method: 'DELETE' });
      return { content: [{ type: 'text', text: `Miembro ${userId} removido del equipo.` }] };
    },
  );
}

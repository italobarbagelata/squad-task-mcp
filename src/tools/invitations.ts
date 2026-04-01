import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { api } from '../api-client.js';

export function registerInvitationTools(server: McpServer) {
  server.tool(
    'list_invitations',
    'Lista las invitaciones pendientes.',
    {},
    async () => {
      const invitations = await api('/api/invitations');
      return { content: [{ type: 'text', text: JSON.stringify(invitations, null, 2) }] };
    },
  );

  server.tool(
    'create_invitation',
    'Invita a un usuario por email a un proyecto o equipo.',
    {
      email: z.string().describe('Email del usuario a invitar'),
      projectId: z.string().optional().describe('ID del proyecto al que invitar'),
      teamId: z.string().optional().describe('ID del equipo al que invitar'),
      role: z.enum(['admin', 'member', 'viewer']).optional().describe('Rol asignado (default: member)'),
    },
    async ({ email, projectId, teamId, role }) => {
      const invitation = await api('/api/invitations', {
        method: 'POST',
        body: JSON.stringify({ email, projectId, teamId, role: role || 'member' }),
      });
      return { content: [{ type: 'text', text: JSON.stringify(invitation, null, 2) }] };
    },
  );

  server.tool(
    'cancel_invitation',
    'Cancela una invitación pendiente.',
    { invitationId: z.string().describe('ID de la invitación a cancelar') },
    async ({ invitationId }) => {
      await api(`/api/invitations/${invitationId}`, { method: 'DELETE' });
      return { content: [{ type: 'text', text: `Invitación ${invitationId} cancelada.` }] };
    },
  );
}

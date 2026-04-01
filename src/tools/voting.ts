import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { api } from '../api-client.js';

export function registerVotingTools(server: McpServer) {
  server.tool(
    'create_voting_session',
    'Crea una nueva sesión de Planning Poker para estimar un issue.',
    { issueId: z.string().describe('ID del issue a estimar') },
    async ({ issueId }) => {
      const session = await api(`/api/issues/${issueId}/voting`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      return { content: [{ type: 'text', text: JSON.stringify(session, null, 2) }] };
    },
  );

  server.tool(
    'list_voting_sessions',
    'Lista las sesiones de votación de un issue.',
    { issueId: z.string().describe('ID del issue') },
    async ({ issueId }) => {
      const sessions = await api(`/api/issues/${issueId}/voting`);
      return { content: [{ type: 'text', text: JSON.stringify(sessions, null, 2) }] };
    },
  );

  server.tool(
    'get_active_voting_session',
    'Obtiene la sesión de votación activa de un issue (si existe).',
    { issueId: z.string().describe('ID del issue') },
    async ({ issueId }) => {
      const session = await api(`/api/issues/${issueId}/voting/active`);
      return { content: [{ type: 'text', text: JSON.stringify(session, null, 2) }] };
    },
  );

  server.tool(
    'cast_vote',
    'Emite un voto en una sesión de Planning Poker. Valores Fibonacci: 0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89.',
    {
      sessionId: z.string().describe('ID de la sesión de votación'),
      points: z.number().describe('Story points a votar'),
    },
    async ({ sessionId, points }) => {
      const vote = await api(`/api/voting/${sessionId}/vote`, {
        method: 'POST',
        body: JSON.stringify({ points }),
      });
      return { content: [{ type: 'text', text: JSON.stringify(vote, null, 2) }] };
    },
  );

  server.tool(
    'reveal_votes',
    'Revela todos los votos de una sesión de Planning Poker.',
    { sessionId: z.string().describe('ID de la sesión de votación') },
    async ({ sessionId }) => {
      const session = await api(`/api/voting/${sessionId}/reveal`, { method: 'PATCH' });
      return { content: [{ type: 'text', text: JSON.stringify(session, null, 2) }] };
    },
  );

  server.tool(
    'finalize_voting',
    'Finaliza una sesión de votación con los story points definitivos.',
    {
      sessionId: z.string().describe('ID de la sesión de votación'),
      finalPoints: z.number().describe('Story points definitivos'),
    },
    async ({ sessionId, finalPoints }) => {
      const session = await api(`/api/voting/${sessionId}/finalize`, {
        method: 'PATCH',
        body: JSON.stringify({ finalPoints }),
      });
      return { content: [{ type: 'text', text: JSON.stringify(session, null, 2) }] };
    },
  );

  server.tool(
    'cancel_voting',
    'Cancela una sesión de votación activa.',
    { sessionId: z.string().describe('ID de la sesión de votación') },
    async ({ sessionId }) => {
      await api(`/api/voting/${sessionId}/cancel`, { method: 'PATCH' });
      return { content: [{ type: 'text', text: 'Sesión de votación cancelada.' }] };
    },
  );
}

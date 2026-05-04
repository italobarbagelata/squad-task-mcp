import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ApiClient } from '../api-client.js';

export function registerProjectRepoTools(server: McpServer, client: ApiClient) {
  server.tool(
    'list_project_repos',
    'Lista los repositorios configurados en un proyecto.',
    {
      projectId: z.string().describe('ID del proyecto'),
    },
    async ({ projectId }) => {
      const repos = await client.api(`/api/projects/${projectId}/repos`);
      return { content: [{ type: 'text', text: JSON.stringify(repos, null, 2) }] };
    },
  );

  server.tool(
    'update_project_repo',
    'Actualiza un repositorio del proyecto.',
    {
      projectId: z.string().describe('ID del proyecto'),
      repoId: z.string().describe('ID del repo (e.g. "repo-abc123")'),
      name: z.string().optional().describe('Nuevo nombre'),
      isPrimary: z.boolean().optional().describe('Marcar como repo primario'),
    },
    async ({ projectId, repoId, ...body }) => {
      const repo = await client.api(`/api/projects/${projectId}/repos/${repoId}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      return { content: [{ type: 'text', text: JSON.stringify(repo, null, 2) }] };
    },
  );
}

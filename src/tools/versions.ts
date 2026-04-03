import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ApiClient } from '../api-client.js';

export function registerVersionTools(server: McpServer, client: ApiClient) {
  server.tool(
    'list_versions',
    'Lista todas las versiones/releases de un proyecto.',
    { projectId: z.string().describe('ID del proyecto') },
    async ({ projectId }) => {
      const versions = await client.api(`/api/projects/${projectId}/versions`);
      return { content: [{ type: 'text', text: JSON.stringify(versions, null, 2) }] };
    },
  );

  server.tool(
    'get_version',
    'Obtiene los detalles de una versión específica.',
    {
      projectId: z.string().describe('ID del proyecto'),
      versionId: z.string().describe('ID de la versión'),
    },
    async ({ projectId, versionId }) => {
      const version = await client.api(`/api/projects/${projectId}/versions/${versionId}`);
      return { content: [{ type: 'text', text: JSON.stringify(version, null, 2) }] };
    },
  );

  server.tool(
    'create_version',
    'Crea una nueva versión/release en un proyecto.',
    {
      projectId: z.string().describe('ID del proyecto'),
      name: z.string().describe('Nombre de la versión (ej: v1.0.0)'),
      description: z.string().optional().describe('Descripción o release notes'),
      startDate: z.string().optional().describe('Fecha de inicio (ISO 8601)'),
      releaseDate: z.string().optional().describe('Fecha de release planificada (ISO 8601)'),
    },
    async ({ projectId, name, description, startDate, releaseDate }) => {
      const version = await client.api(`/api/projects/${projectId}/versions`, {
        method: 'POST',
        body: JSON.stringify({ name, description, startDate, releaseDate }),
      });
      return { content: [{ type: 'text', text: JSON.stringify(version, null, 2) }] };
    },
  );

  server.tool(
    'update_version',
    'Actualiza una versión existente.',
    {
      projectId: z.string().describe('ID del proyecto'),
      versionId: z.string().describe('ID de la versión'),
      name: z.string().optional().describe('Nuevo nombre'),
      description: z.string().optional().describe('Nueva descripción'),
      status: z.enum(['unreleased', 'released', 'archived']).optional().describe('Nuevo estado'),
      startDate: z.string().optional().describe('Nueva fecha de inicio'),
      releaseDate: z.string().optional().describe('Nueva fecha de release'),
    },
    async ({ projectId, versionId, ...data }) => {
      const version = await client.api(`/api/projects/${projectId}/versions/${versionId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
      return { content: [{ type: 'text', text: JSON.stringify(version, null, 2) }] };
    },
  );

  server.tool(
    'release_version',
    'Marca una versión como released. Establece la fecha de release si no tiene una.',
    {
      projectId: z.string().describe('ID del proyecto'),
      versionId: z.string().describe('ID de la versión'),
    },
    async ({ projectId, versionId }) => {
      const version = await client.api(`/api/projects/${projectId}/versions/${versionId}/release`, {
        method: 'POST',
      });
      return { content: [{ type: 'text', text: JSON.stringify(version, null, 2) }] };
    },
  );

  server.tool(
    'delete_version',
    'Elimina una versión. Los issues vinculados quedan sin versión.',
    {
      projectId: z.string().describe('ID del proyecto'),
      versionId: z.string().describe('ID de la versión'),
    },
    async ({ projectId, versionId }) => {
      await client.api(`/api/projects/${projectId}/versions/${versionId}`, {
        method: 'DELETE',
      });
      return { content: [{ type: 'text', text: 'Version deleted successfully' }] };
    },
  );
}

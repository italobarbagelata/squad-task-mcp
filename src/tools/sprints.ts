import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ApiClient } from '../api-client.js';

export function registerSprintTools(server: McpServer, client: ApiClient) {
  server.tool(
    'list_sprints',
    'Lista todos los sprints de un proyecto con su estado (planning, active, completed), fechas y objetivo.',
    { projectId: z.string().describe('ID del proyecto') },
    async ({ projectId }) => {
      const sprints = await client.api(`/api/projects/${projectId}/sprints`);
      return { content: [{ type: 'text', text: JSON.stringify(sprints, null, 2) }] };
    },
  );

  server.tool(
    'get_sprint',
    'Obtiene el detalle de un sprint específico.',
    {
      projectId: z.string().describe('ID del proyecto'),
      sprintId: z.string().describe('ID del sprint'),
    },
    async ({ projectId, sprintId }) => {
      const sprint = await client.api(`/api/projects/${projectId}/sprints/${sprintId}`);
      return { content: [{ type: 'text', text: JSON.stringify(sprint, null, 2) }] };
    },
  );

  server.tool(
    'create_sprint',
    'Crea un nuevo sprint en un proyecto. Se crea en estado "planning".',
    {
      projectId: z.string().describe('ID del proyecto'),
      name: z.string().describe('Nombre del sprint (ej: "Sprint 5")'),
      goal: z.string().optional().describe('Objetivo del sprint'),
    },
    async ({ projectId, name, goal }) => {
      const sprint = await client.api(`/api/projects/${projectId}/sprints`, {
        method: 'POST',
        body: JSON.stringify({ name, goal }),
      });
      return { content: [{ type: 'text', text: JSON.stringify(sprint, null, 2) }] };
    },
  );

  server.tool(
    'start_sprint',
    'Inicia un sprint que está en estado "planning". Requiere fechas de inicio y fin.',
    {
      projectId: z.string().describe('ID del proyecto'),
      sprintId: z.string().describe('ID del sprint a iniciar'),
      startDate: z.string().describe('Fecha de inicio ISO (ej: "2026-03-13")'),
      endDate: z.string().describe('Fecha de fin ISO (ej: "2026-03-27")'),
    },
    async ({ projectId, sprintId, startDate, endDate }) => {
      const sprint = await client.api(`/api/projects/${projectId}/sprints/${sprintId}/start`, {
        method: 'POST',
        body: JSON.stringify({ startDate, endDate }),
      });
      return { content: [{ type: 'text', text: JSON.stringify(sprint, null, 2) }] };
    },
  );

  server.tool(
    'complete_sprint',
    'Completa un sprint activo. Los issues no terminados permanecen en el backlog.',
    {
      projectId: z.string().describe('ID del proyecto'),
      sprintId: z.string().describe('ID del sprint a completar'),
    },
    async ({ projectId, sprintId }) => {
      const sprint = await client.api(`/api/projects/${projectId}/sprints/${sprintId}/complete`, {
        method: 'POST',
      });
      return { content: [{ type: 'text', text: JSON.stringify(sprint, null, 2) }] };
    },
  );
}

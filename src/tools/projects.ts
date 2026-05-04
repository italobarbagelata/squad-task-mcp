import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ApiClient } from '../api-client.js';

export function registerProjectTools(server: McpServer, client: ApiClient) {
  server.tool(
    'list_projects',
    'Lista todos los proyectos de Squad. Devuelve id, key, nombre, descripción, tipo, statuses e issue types de cada proyecto.',
    {},
    async () => {
      const projects = await client.api('/api/projects');
      return { content: [{ type: 'text', text: JSON.stringify(projects, null, 2) }] };
    },
  );

  server.tool(
    'get_project',
    'Obtiene el detalle de un proyecto por su ID. Incluye statuses configurados, tipos de issue, miembros y metadata.',
    { projectId: z.string().describe('ID del proyecto') },
    async ({ projectId }) => {
      const project = await client.api(`/api/projects/${projectId}`);
      return { content: [{ type: 'text', text: JSON.stringify(project, null, 2) }] };
    },
  );

  server.tool(
    'create_project',
    'Crea un nuevo proyecto. Tipos disponibles: scrum, kanban, squad_ai.',
    {
      name: z.string().describe('Nombre del proyecto'),
      key: z.string().describe('Clave corta del proyecto (ej: "TT", "MOBILE")'),
      description: z.string().optional().describe('Descripción del proyecto'),
      projectType: z.enum(['scrum', 'kanban', 'squad_ai']).describe('Tipo de proyecto'),
    },
    async ({ ...body }) => {
      const project = await client.api('/api/projects', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      return { content: [{ type: 'text', text: JSON.stringify(project, null, 2) }] };
    },
  );

  server.tool(
    'update_project',
    'Actualiza campos de un proyecto existente.',
    {
      projectId: z.string().describe('ID del proyecto'),
      name: z.string().optional().describe('Nuevo nombre'),
      description: z.string().optional().describe('Nueva descripción'),
      techStack: z.string().optional().describe('Stack técnico (visible en prompts de agentes)'),
      autoExecute: z.boolean().optional().describe('Auto-ejecutar tareas en pipeline Squad AI'),
      specTemplateMd: z.string().optional().describe('SDD template (Markdown) usado para inicializar Issue.spec_md'),
    },
    async ({ projectId, ...body }) => {
      const project = await client.api(`/api/projects/${projectId}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      return { content: [{ type: 'text', text: JSON.stringify(project, null, 2) }] };
    },
  );

  server.tool(
    'delete_project',
    'Elimina un proyecto permanentemente. Acción irreversible.',
    { projectId: z.string().describe('ID del proyecto a eliminar') },
    async ({ projectId }) => {
      await client.api(`/api/projects/${projectId}`, { method: 'DELETE' });
      return { content: [{ type: 'text', text: `Proyecto ${projectId} eliminado.` }] };
    },
  );

  // ── Project Members ───────────────────────────────────────
  server.tool(
    'list_project_members',
    'Lista los miembros de un proyecto con sus roles.',
    { projectId: z.string().describe('ID del proyecto') },
    async ({ projectId }) => {
      const members = await client.api(`/api/projects/${projectId}/members`);
      return { content: [{ type: 'text', text: JSON.stringify(members, null, 2) }] };
    },
  );

  server.tool(
    'add_project_member',
    'Agrega un usuario como miembro de un proyecto.',
    {
      projectId: z.string().describe('ID del proyecto'),
      userId: z.string().describe('ID del usuario a agregar'),
      role: z.enum(['admin', 'member', 'viewer']).optional().describe('Rol en el proyecto (default: member)'),
    },
    async ({ projectId, userId, role }) => {
      const member = await client.api(`/api/projects/${projectId}/members`, {
        method: 'POST',
        body: JSON.stringify({ userId, role: role || 'member' }),
      });
      return { content: [{ type: 'text', text: JSON.stringify(member, null, 2) }] };
    },
  );

  server.tool(
    'update_project_member_role',
    'Cambia el rol de un miembro del proyecto.',
    {
      projectId: z.string().describe('ID del proyecto'),
      userId: z.string().describe('ID del usuario'),
      role: z.enum(['admin', 'member', 'viewer']).describe('Nuevo rol'),
    },
    async ({ projectId, userId, role }) => {
      const member = await client.api(`/api/projects/${projectId}/members/${userId}`, {
        method: 'PUT',
        body: JSON.stringify({ role }),
      });
      return { content: [{ type: 'text', text: JSON.stringify(member, null, 2) }] };
    },
  );

  server.tool(
    'remove_project_member',
    'Remueve un miembro del proyecto.',
    {
      projectId: z.string().describe('ID del proyecto'),
      userId: z.string().describe('ID del usuario a remover'),
    },
    async ({ projectId, userId }) => {
      await client.api(`/api/projects/${projectId}/members/${userId}`, { method: 'DELETE' });
      return { content: [{ type: 'text', text: `Miembro ${userId} removido del proyecto.` }] };
    },
  );

  // ── Project Statuses ──────────────────────────────────────
  server.tool(
    'create_project_status',
    'Crea un nuevo status personalizado para un proyecto.',
    {
      projectId: z.string().describe('ID del proyecto'),
      name: z.string().describe('Nombre del status (ej: "In Review")'),
      category: z.enum(['todo', 'in_progress', 'done']).describe('Categoría del status'),
      color: z.string().optional().describe('Color hex (ej: "#3B82F6")'),
      agentInstructions: z.string().optional().describe('Instrucciones para agentes AI en esta fase'),
    },
    async ({ projectId, ...body }) => {
      const status = await client.api(`/api/projects/${projectId}/statuses`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      return { content: [{ type: 'text', text: JSON.stringify(status, null, 2) }] };
    },
  );

  server.tool(
    'update_project_status',
    'Actualiza un status de proyecto.',
    {
      projectId: z.string().describe('ID del proyecto'),
      statusId: z.string().describe('ID del status'),
      name: z.string().optional().describe('Nuevo nombre'),
      color: z.string().optional().describe('Nuevo color'),
      agentInstructions: z.string().optional().describe('Nuevas instrucciones para agentes'),
    },
    async ({ projectId, statusId, ...body }) => {
      const status = await client.api(`/api/projects/${projectId}/statuses/${statusId}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      return { content: [{ type: 'text', text: JSON.stringify(status, null, 2) }] };
    },
  );

  server.tool(
    'delete_project_status',
    'Elimina un status de proyecto.',
    {
      projectId: z.string().describe('ID del proyecto'),
      statusId: z.string().describe('ID del status a eliminar'),
    },
    async ({ projectId, statusId }) => {
      await client.api(`/api/projects/${projectId}/statuses/${statusId}`, { method: 'DELETE' });
      return { content: [{ type: 'text', text: `Status ${statusId} eliminado.` }] };
    },
  );

  // ── Project Issue Types ───────────────────────────────────
  server.tool(
    'create_project_issue_type',
    'Crea un nuevo tipo de issue personalizado para un proyecto.',
    {
      projectId: z.string().describe('ID del proyecto'),
      name: z.string().describe('Nombre del tipo (ej: "Feature", "Spike")'),
      icon: z.string().optional().describe('Ícono'),
      color: z.string().optional().describe('Color hex'),
    },
    async ({ projectId, ...body }) => {
      const issueType = await client.api(`/api/projects/${projectId}/issue-types`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      return { content: [{ type: 'text', text: JSON.stringify(issueType, null, 2) }] };
    },
  );

  server.tool(
    'update_project_issue_type',
    'Actualiza un tipo de issue de proyecto.',
    {
      projectId: z.string().describe('ID del proyecto'),
      typeId: z.string().describe('ID del tipo de issue'),
      name: z.string().optional().describe('Nuevo nombre'),
      icon: z.string().optional().describe('Nuevo ícono'),
      color: z.string().optional().describe('Nuevo color'),
    },
    async ({ projectId, typeId, ...body }) => {
      const issueType = await client.api(`/api/projects/${projectId}/issue-types/${typeId}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      return { content: [{ type: 'text', text: JSON.stringify(issueType, null, 2) }] };
    },
  );

  server.tool(
    'delete_project_issue_type',
    'Elimina un tipo de issue de proyecto.',
    {
      projectId: z.string().describe('ID del proyecto'),
      typeId: z.string().describe('ID del tipo a eliminar'),
    },
    async ({ projectId, typeId }) => {
      await client.api(`/api/projects/${projectId}/issue-types/${typeId}`, { method: 'DELETE' });
      return { content: [{ type: 'text', text: `Tipo de issue ${typeId} eliminado.` }] };
    },
  );
}

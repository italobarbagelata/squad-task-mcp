import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ApiClient } from '../api-client.js';

export function registerIssueTools(server: McpServer, client: ApiClient) {
  server.tool(
    'list_issues',
    'Lista issues de un proyecto con filtros opcionales. Usa los filtros para buscar por sprint, estado, asignado, tipo, prioridad o execution status.',
    {
      projectId: z.string().describe('ID del proyecto'),
      sprint: z.string().optional().describe('Filtrar por sprint ID. Usar "backlog" para issues sin sprint'),
      status: z.string().optional().describe('Filtrar por status ID'),
      assignee: z.string().optional().describe('Filtrar por ID del usuario asignado'),
      type: z.string().optional().describe('Filtrar por tipo: story, task, bug, epic, subtask'),
      priority: z.string().optional().describe('Filtrar por prioridad: highest, high, medium, low, lowest'),
      executionStatus: z.string().optional().describe('Filtrar por execution status: pending, execute, executing, executed, failed'),
    },
    async ({ projectId, sprint, status, assignee, type, priority, executionStatus }) => {
      const params = new URLSearchParams();
      if (sprint) params.set('sprint', sprint);
      if (status) params.set('status', status);
      if (assignee) params.set('assignee', assignee);
      if (type) params.set('type', type);
      if (priority) params.set('priority', priority);
      if (executionStatus) params.set('execution_status', executionStatus);
      const qs = params.toString();
      const issues = await client.api(`/api/projects/${projectId}/issues${qs ? `?${qs}` : ''}`);
      return { content: [{ type: 'text', text: JSON.stringify(issues, null, 2) }] };
    },
  );

  server.tool(
    'get_issue',
    'Obtiene el detalle completo de un issue. Acepta ID interno o key (ej: "ZEY-21").',
    {
      projectId: z.string().describe('ID del proyecto'),
      issueId: z.string().describe('ID del issue o key (ej: ZEY-21)'),
    },
    async ({ projectId, issueId }) => {
      let resolvedId = issueId;

      // If it looks like a key (e.g. "ZEY-21"), search for the actual ID
      if (/^[A-Z]+-\d+$/i.test(issueId)) {
        const results = await client.api<any[]>(`/api/projects/${projectId}/issues`);
        const match = results.find((i: any) => i.key?.toLowerCase() === issueId.toLowerCase());
        if (!match) {
          return { content: [{ type: 'text', text: `Issue con key "${issueId}" no encontrado en este proyecto.` }] };
        }
        resolvedId = match.id;
      }

      const issue = await client.api(`/api/projects/${projectId}/issues/${resolvedId}`);
      return { content: [{ type: 'text', text: JSON.stringify(issue, null, 2) }] };
    },
  );

  server.tool(
    'create_issue',
    'Crea un nuevo issue en un proyecto. Requiere tipo y título.',
    {
      projectId: z.string().describe('ID del proyecto'),
      type: z.string().describe('Tipo de issue: story, task, bug, epic, subtask'),
      title: z.string().describe('Título del issue'),
      description: z.string().optional().describe('Descripción detallada (soporta markdown)'),
      priority: z.enum(['highest', 'high', 'medium', 'low', 'lowest']).optional().describe('Prioridad'),
      status: z.string().optional().describe('Status ID inicial'),
      assigneeId: z.string().optional().describe('ID del usuario a asignar'),
      sprintId: z.string().optional().describe('ID del sprint'),
      parentId: z.string().optional().describe('ID del issue padre (para subtasks)'),
      epicId: z.string().optional().describe('ID del epic'),
      storyPoints: z.number().optional().describe('Story points'),
      dueDate: z.string().optional().describe('Fecha límite ISO'),
      startDate: z.string().optional().describe('Fecha de inicio ISO'),
    },
    async ({ projectId, ...body }) => {
      const issue = await client.api(`/api/projects/${projectId}/issues`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      return { content: [{ type: 'text', text: JSON.stringify(issue, null, 2) }] };
    },
  );

  server.tool(
    'update_issue',
    'Actualiza campos de un issue existente. Solo envía los campos que quieras cambiar.',
    {
      projectId: z.string().describe('ID del proyecto'),
      issueId: z.string().describe('ID del issue a actualizar'),
      title: z.string().optional().describe('Nuevo título'),
      description: z.string().optional().describe('Nueva descripción'),
      priority: z.enum(['highest', 'high', 'medium', 'low', 'lowest']).optional().describe('Nueva prioridad'),
      type: z.string().optional().describe('Nuevo tipo'),
      assigneeId: z.string().optional().describe('Nuevo asignado'),
      sprintId: z.string().optional().describe('Nuevo sprint'),
      storyPoints: z.number().optional().describe('Nuevos story points'),
      dueDate: z.string().optional().describe('Nueva fecha límite ISO'),
      startDate: z.string().optional().describe('Nueva fecha de inicio ISO'),
      epicId: z.string().optional().describe('Nuevo epic ID'),
      specMd: z.string().optional().describe('Living spec markdown completo del issue. Mandar string vacío para resetearlo.'),
    },
    async ({ projectId, issueId, ...body }) => {
      const issue = await client.api(`/api/projects/${projectId}/issues/${issueId}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      return { content: [{ type: 'text', text: JSON.stringify(issue, null, 2) }] };
    },
  );

  server.tool(
    'delete_issue',
    'Elimina un issue permanentemente.',
    {
      projectId: z.string().describe('ID del proyecto'),
      issueId: z.string().describe('ID del issue a eliminar'),
    },
    async ({ projectId, issueId }) => {
      await client.api(`/api/projects/${projectId}/issues/${issueId}`, { method: 'DELETE' });
      return { content: [{ type: 'text', text: `Issue ${issueId} eliminado.` }] };
    },
  );

  server.tool(
    'set_pending_questions',
    'Registra preguntas estructuradas que el usuario debe responder antes de continuar el refinement. Reemplaza la lista anterior. Usar SOLO desde el agente PO cuando falta información clave para refinar; NO avanzar la tarea hasta que el usuario responda.',
    {
      projectId: z.string().describe('ID del proyecto'),
      issueId: z.string().describe('ID del issue'),
      questions: z.array(z.string()).describe('Lista de preguntas en lenguaje natural. Pasar [] para limpiar todas.'),
    },
    async ({ projectId, issueId, questions }) => {
      const issue = await client.api(`/api/projects/${projectId}/issues/${issueId}/pending-questions`, {
        method: 'PUT',
        body: JSON.stringify({ questions }),
      });
      return { content: [{ type: 'text', text: JSON.stringify(issue, null, 2) }] };
    },
  );

  server.tool(
    'change_issue_status',
    'Cambia el estado de un issue (ej: mover de "todo" a "in-progress").',
    {
      projectId: z.string().describe('ID del proyecto'),
      issueId: z.string().describe('ID del issue'),
      status: z.string().describe('Nuevo status ID'),
    },
    async ({ projectId, issueId, status }) => {
      const issue = await client.api(`/api/projects/${projectId}/issues/${issueId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      return { content: [{ type: 'text', text: JSON.stringify(issue, null, 2) }] };
    },
  );

  server.tool(
    'assign_issue',
    'Asigna un issue a un usuario o lo deja sin asignar.',
    {
      projectId: z.string().describe('ID del proyecto'),
      issueId: z.string().describe('ID del issue'),
      assigneeId: z.string().nullable().describe('ID del usuario, o null para desasignar'),
    },
    async ({ projectId, issueId, assigneeId }) => {
      const issue = await client.api(`/api/projects/${projectId}/issues/${issueId}/assignee`, {
        method: 'PATCH',
        body: JSON.stringify({ assigneeId }),
      });
      return { content: [{ type: 'text', text: JSON.stringify(issue, null, 2) }] };
    },
  );

  server.tool(
    'move_issue_to_sprint',
    'Mueve un issue a un sprint o al backlog.',
    {
      projectId: z.string().describe('ID del proyecto'),
      issueId: z.string().describe('ID del issue'),
      sprintId: z.string().nullable().describe('ID del sprint, o null para backlog'),
    },
    async ({ projectId, issueId, sprintId }) => {
      const issue = await client.api(`/api/projects/${projectId}/issues/${issueId}/sprint`, {
        method: 'PATCH',
        body: JSON.stringify({ sprintId }),
      });
      return { content: [{ type: 'text', text: JSON.stringify(issue, null, 2) }] };
    },
  );

  server.tool(
    'change_execution_status',
    'Cambia el execution status de un issue (pending, execute, executing, executed, failed). Útil para controlar el pipeline Squad AI manualmente.',
    {
      projectId: z.string().describe('ID del proyecto'),
      issueId: z.string().describe('ID del issue'),
      executionStatus: z.enum(['pending', 'execute', 'executing', 'executed', 'failed']).describe('Nuevo execution status'),
    },
    async ({ projectId, issueId, executionStatus }) => {
      const issue = await client.api(`/api/projects/${projectId}/issues/${issueId}/execution-status`, {
        method: 'PATCH',
        body: JSON.stringify({ executionStatus }),
      });
      return { content: [{ type: 'text', text: JSON.stringify(issue, null, 2) }] };
    },
  );

  server.tool(
    'reorder_issues',
    'Reordena issues dentro de un proyecto (útil para backlog grooming).',
    {
      projectId: z.string().describe('ID del proyecto'),
      orderedIssueIds: z.array(z.string()).describe('Array de issue IDs en el orden deseado'),
    },
    async ({ projectId, orderedIssueIds }) => {
      await client.api(`/api/projects/${projectId}/issues/reorder`, {
        method: 'PUT',
        body: JSON.stringify({ orderedIssueIds }),
      });
      return { content: [{ type: 'text', text: 'Issues reordenados exitosamente.' }] };
    },
  );
}

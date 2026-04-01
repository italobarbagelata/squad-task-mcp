import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { api } from '../api-client.js';
import type { Issue, Project, Comment } from '../types.js';

export function registerWorkerTools(server: McpServer) {
  server.tool(
    'poll_executable_tasks',
    'Busca issues en estado "Ejecutar" listos para ser trabajados por Claude Code. Devuelve las tareas con su contexto completo (título, descripción, proyecto, prioridad). Usa esto para descubrir qué tareas necesitan ser ejecutadas.',
    {
      projectId: z.string().optional().describe('Filtrar por proyecto específico. Si no se pasa, busca en todos los proyectos.'),
    },
    async ({ projectId }) => {
      const projects = projectId
        ? [await api<Project>(`/api/projects/${projectId}`)]
        : await api<Project[]>('/api/projects');

      const tasks: {
        issue: Issue;
        project: { id: string; key: string; name: string };
      }[] = [];

      for (const proj of projects) {
        const issues = await api<Issue[]>(
          `/api/projects/${proj.id}/issues?status=ejecutar`,
        );
        for (const issue of issues) {
          tasks.push({ issue, project: { id: proj.id, key: proj.key, name: proj.name } });
        }
      }

      if (tasks.length === 0) {
        return {
          content: [{ type: 'text' as const, text: 'No hay tareas en estado "Ejecutar" en este momento.' }],
        };
      }

      const summary = tasks.map((t, i) => {
        return [
          `### Tarea ${i + 1}: ${t.issue.key} - ${t.issue.title}`,
          `- **Proyecto**: ${t.project.name} (${t.project.id})`,
          `- **Issue ID**: ${t.issue.id}`,
          `- **Tipo**: ${t.issue.type}`,
          `- **Prioridad**: ${t.issue.priority}`,
          `- **Story Points**: ${t.issue.storyPoints ?? 'N/A'}`,
          `- **Descripción**:`,
          t.issue.description || '(sin descripción)',
          '',
        ].join('\n');
      });

      return {
        content: [{
          type: 'text' as const,
          text: `# Tareas Pendientes de Ejecución\n\nSe encontraron **${tasks.length}** tarea(s) en estado "Ejecutar":\n\n${summary.join('\n---\n\n')}`,
        }],
      };
    },
  );

  server.tool(
    'pick_task',
    'Toma una tarea en estado "Ejecutar" y devuelve toda la información necesaria para trabajarla: descripción completa, comentarios previos, y contexto del proyecto. Además marca la tarea como "en progreso" internamente agregando un comentario.',
    {
      projectId: z.string().describe('ID del proyecto'),
      issueId: z.string().describe('ID del issue a tomar'),
    },
    async ({ projectId, issueId }) => {
      const issue = await api<Issue>(`/api/projects/${projectId}/issues/${issueId}`);

      if (issue.status !== 'ejecutar') {
        return {
          content: [{
            type: 'text' as const,
            text: `⚠️ El issue ${issue.key} no está en estado "Ejecutar" (estado actual: ${issue.status}). Solo se pueden tomar tareas en estado "Ejecutar".`,
          }],
        };
      }

      // Add comment indicating Claude is working on it
      await api(`/api/issues/${issueId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ content: '🤖 Claude Code ha tomado esta tarea y está trabajando en ella.' }),
      });

      // Get existing comments for context
      const comments = await api<Comment[]>(
        `/api/issues/${issueId}/comments`,
      );

      const prevComments = comments
        .filter((c) => !c.content.includes('Claude Code ha tomado'))
        .map((c) => `- ${c.content}`)
        .join('\n');

      return {
        content: [{
          type: 'text' as const,
          text: [
            `# Tarea: ${issue.key} - ${issue.title}`,
            '',
            `**Tipo**: ${issue.type} | **Prioridad**: ${issue.priority} | **Story Points**: ${issue.storyPoints ?? 'N/A'}`,
            '',
            '## Descripción',
            issue.description || '(sin descripción)',
            '',
            prevComments ? `## Comentarios Previos\n${prevComments}` : '',
            '',
            '## Instrucciones',
            'Lee la descripción cuidadosamente y ejecuta la tarea. Cuando termines, usa `complete_task` para marcarla como completada.',
          ].join('\n'),
        }],
      };
    },
  );

  server.tool(
    'complete_task',
    'Marca una tarea como completada después de ejecutarla. Mueve el issue a estado "En Revisión" y deja un comentario con el resumen de lo que se hizo.',
    {
      projectId: z.string().describe('ID del proyecto'),
      issueId: z.string().describe('ID del issue completado'),
      summary: z.string().describe('Resumen de lo que se hizo: archivos modificados, cambios realizados, tests ejecutados'),
    },
    async ({ projectId, issueId, summary }) => {
      // Move to "En Revisión"
      await api(`/api/projects/${projectId}/issues/${issueId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'in_review' }),
      });

      // Add completion comment
      await api(`/api/issues/${issueId}/comments`, {
        method: 'POST',
        body: JSON.stringify({
          content: `✅ **Tarea completada por Claude Code**\n\n${summary}\n\n---\n_Movido a "En Revisión" automáticamente._`,
        }),
      });

      const issue = await api<Issue>(`/api/projects/${projectId}/issues/${issueId}`);

      return {
        content: [{
          type: 'text' as const,
          text: `Tarea ${issue.key} completada y movida a "En Revisión".\n\nResumen guardado como comentario en el issue.`,
        }],
      };
    },
  );

  server.tool(
    'fail_task',
    'Marca una tarea como fallida si no se pudo completar. La devuelve a "To Do" y deja un comentario explicando el problema.',
    {
      projectId: z.string().describe('ID del proyecto'),
      issueId: z.string().describe('ID del issue que falló'),
      reason: z.string().describe('Explicación de por qué no se pudo completar la tarea'),
    },
    async ({ projectId, issueId, reason }) => {
      // Move back to "To Do"
      await api(`/api/projects/${projectId}/issues/${issueId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'todo' }),
      });

      // Add failure comment
      await api(`/api/issues/${issueId}/comments`, {
        method: 'POST',
        body: JSON.stringify({
          content: `❌ **Tarea no completada por Claude Code**\n\n**Razón:** ${reason}\n\n---\n_Devuelta a "To Do" para revisión manual._`,
        }),
      });

      return {
        content: [{
          type: 'text' as const,
          text: `Tarea devuelta a "To Do". Razón documentada como comentario.`,
        }],
      };
    },
  );
}

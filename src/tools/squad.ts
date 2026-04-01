import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { api } from '../api-client.js';
import type { Issue, Project, Comment, PhaseExecution, User } from '../types.js';

/** Helper: get ordered phases from a project's statuses */
function getOrderedPhases(project: Project) {
  return [...project.statuses].sort((a, b) => a.order - b.order);
}

/** Helper: get the next phase ID after the given one */
function getNextPhase(project: Project, currentPhase: string): string | undefined {
  const ordered = getOrderedPhases(project);
  const idx = ordered.findIndex((s) => s.id === currentPhase);
  if (idx === -1 || idx + 1 >= ordered.length) return undefined;
  return ordered[idx + 1].id;
}

/** Helper: get label for a phase */
function getPhaseLabel(project: Project, phaseId: string): string {
  const status = project.statuses.find((s) => s.id === phaseId);
  return status?.name ?? phaseId;
}

/** Helper: get actionable phase IDs (not "done" category) */
function getActionablePhaseIds(project: Project): string[] {
  return getOrderedPhases(project)
    .filter((s) => s.category !== 'done')
    .map((s) => s.id);
}

export function registerSquadTools(server: McpServer) {
  // ── poll_squad_tasks ────────────────────────────────────────
  server.tool(
    'poll_squad_tasks',
    'Busca issues en proyectos Squad AI que están listos para ser procesados (execution_status="execute"). Filtra opcionalmente por fase del pipeline, proyecto, y asignación.',
    {
      phase: z.string().optional().describe('Fase del pipeline a consultar (usa el ID del status). Si no se pasa, busca en todas las fases.'),
      projectId: z.string().optional().describe('Filtrar por proyecto específico. Si no se pasa, busca en todos los proyectos Squad AI.'),
      assignedToMe: z.boolean().optional().describe('Si true, solo muestra tareas asignadas al usuario autenticado.'),
    },
    async ({ phase, projectId, assignedToMe }) => {
      // Get current user ID if filtering by assignment
      let myUserId: string | undefined;
      if (assignedToMe) {
        const me = await api<User>('/api/auth/me');
        myUserId = me.id;
      }

      const allProjects = projectId
        ? [await api<Project>(`/api/projects/${projectId}`)]
        : await api<Project[]>('/api/projects');

      const squadProjects = allProjects.filter((p) => p.projectType === 'squad_ai');

      if (squadProjects.length === 0) {
        return {
          content: [{ type: 'text' as const, text: 'No hay proyectos de tipo Squad AI.' }],
        };
      }

      const tasks: { issue: Issue; project: Project; phase: string }[] = [];

      for (const proj of squadProjects) {
        const phases = phase ? [phase] : getActionablePhaseIds(proj);
        for (const ph of phases) {
          const assigneeParam = myUserId ? `&assignee=${myUserId}` : '';
          const issues = await api<Issue[]>(
            `/api/projects/${proj.id}/issues?status=${ph}&execution_status=execute${assigneeParam}`,
          );
          for (const issue of issues) {
            tasks.push({ issue, project: proj, phase: ph });
          }
        }
      }

      if (tasks.length === 0) {
        const phaseMsg = phase ? `fase "${phase}"` : 'el pipeline';
        return {
          content: [{ type: 'text' as const, text: `No hay tareas con ejecución pendiente en ${phaseMsg}.` }],
        };
      }

      const summary = tasks.map((t, i) => {
        const nextPhase = getNextPhase(t.project, t.phase);
        return [
          `### ${i + 1}. ${t.issue.key} - ${t.issue.title}`,
          `- **Fase**: ${getPhaseLabel(t.project, t.phase)} → siguiente: ${nextPhase ? getPhaseLabel(t.project, nextPhase) : 'N/A'}`,
          `- **Proyecto**: ${t.project.name} (${t.project.id})`,
          `- **Issue ID**: ${t.issue.id}`,
          `- **Tipo**: ${t.issue.type} | **Prioridad**: ${t.issue.priority}${t.issue.assigneeId ? ` | **Asignado a**: ${t.issue.assigneeId}` : ''}`,
          `- **Auto-execute**: ${t.project.autoExecute ? 'Sí (pipeline automático)' : 'No (requiere aprobación manual)'}`,
          t.project.repoPath ? `- **Repo Path**: ${t.project.repoPath}` : '',
          `- **Descripción**: ${t.issue.description || '(sin descripción)'}`,
          '',
        ].filter(Boolean).join('\n');
      });

      return {
        content: [{
          type: 'text' as const,
          text: `# Squad AI - Tareas listas para ejecución\n\n**${tasks.length}** tarea(s) con execution_status="execute":\n\n${summary.join('\n---\n\n')}`,
        }],
      };
    },
  );

  // ── pick_squad_task ─────────────────────────────────────────
  server.tool(
    'pick_squad_task',
    'Toma una tarea Squad AI de forma atómica (execution_status: execute → executing). Previene que dos agentes tomen la misma tarea. Devuelve toda la información necesaria incluyendo contexto de fases anteriores y comentarios previos.',
    {
      projectId: z.string().describe('ID del proyecto'),
      issueId: z.string().describe('ID del issue a tomar'),
      agentUser: z.string().optional().describe('Identificador del agente que toma la tarea'),
    },
    async ({ projectId, issueId, agentUser }) => {
      try {
        const issue = await api<Issue>(`/api/projects/${projectId}/squad/issues/${issueId}/pick`, {
          method: 'POST',
          body: JSON.stringify({ agentUser: agentUser || 'claude-code' }),
        });

        // Get project for phase info
        const project = await api<Project>(`/api/projects/${projectId}`);

        // Get comments for context
        const comments = await api<Comment[]>(`/api/issues/${issueId}/comments`);
        const prevComments = comments
          .filter((c) => !c.content.includes('Agente ha tomado'))
          .map((c) => `- ${c.content}`)
          .join('\n');

        // Get phase execution history
        const phases = await api<PhaseExecution[]>(
          `/api/projects/${projectId}/squad/issues/${issueId}/phases`,
        );
        const phaseHistory = phases
          .filter((p) => p.status === 'completed')
          .map((p) => `- **${getPhaseLabel(project, p.phase)}**: ${p.summary || '(sin resumen)'}`)
          .join('\n');

        // Format phase context
        const phaseCtx = issue.phaseContext;
        const contextSection = phaseCtx && Object.keys(phaseCtx).length > 0
          ? `## Contexto de fases anteriores\n\`\`\`json\n${JSON.stringify(phaseCtx, null, 2)}\n\`\`\``
          : '';

        const currentPhase = issue.status;
        const nextPhase = getNextPhase(project, currentPhase);
        const currentStatus = project.statuses.find((s) => s.id === currentPhase);
        const agentInstructions = currentStatus?.agentInstructions;

        return {
          content: [{
            type: 'text' as const,
            text: [
              `# Tarea: ${issue.key} - ${issue.title}`,
              '',
              `**Fase actual**: ${getPhaseLabel(project, currentPhase)} → siguiente: ${nextPhase ? getPhaseLabel(project, nextPhase) : 'N/A'}`,
              `**Tipo**: ${issue.type} | **Prioridad**: ${issue.priority} | **Story Points**: ${issue.storyPoints ?? 'N/A'}`,
              '',
              '## Descripción',
              issue.description || '(sin descripción)',
              '',
              phaseHistory ? `## Historial de fases\n${phaseHistory}` : '',
              contextSection,
              prevComments ? `## Comentarios previos\n${prevComments}` : '',
              '',
              '## Instrucciones',
              agentInstructions
                ? agentInstructions
                : `Ejecuta el trabajo correspondiente a la fase **${getPhaseLabel(project, currentPhase)}**.`,
              '',
              'Cuando termines, usa `advance_task` con un resumen y opcionalmente `phaseOutput` con datos estructurados para la siguiente fase.',
              'Si no puedes completar la tarea, usa `fail_squad_task` con la razón.',
            ].filter(Boolean).join('\n'),
          }],
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('409')) {
          return {
            content: [{
              type: 'text' as const,
              text: `⚠️ No se pudo tomar la tarea: otro agente ya la reclamó o no está en estado "execute".`,
            }],
          };
        }
        throw err;
      }
    },
  );

  // ── advance_task ────────────────────────────────────────────
  server.tool(
    'advance_task',
    'Marca la fase actual como completada y avanza el issue al siguiente paso del pipeline de forma atómica. Soporta pasar datos estructurados (phaseOutput) para que la siguiente fase tenga contexto.',
    {
      projectId: z.string().describe('ID del proyecto'),
      issueId: z.string().describe('ID del issue a avanzar'),
      summary: z.string().describe('Resumen del trabajo realizado en esta fase'),
      phaseOutput: z.record(z.string(), z.unknown()).optional().describe('Datos estructurados de salida de esta fase (ej: spec, archivos modificados, resultados de tests). Se acumulan en el issue para que fases posteriores tengan contexto.'),
    },
    async ({ projectId, issueId, summary, phaseOutput }) => {
      // Get project for labels
      const project = await api<Project>(`/api/projects/${projectId}`);

      const result = await api<{
        issueKey: string;
        previousPhase: string;
        newStatus: string;
        executionStatus: string;
        autoExecuted: boolean;
      }>(`/api/projects/${projectId}/squad/issues/${issueId}/advance`, {
        method: 'POST',
        body: JSON.stringify({ summary, phaseOutput }),
      });

      const autoMsg = result.autoExecuted
        ? ' (auto-execute: la siguiente fase ya está lista para ser tomada)'
        : '';

      return {
        content: [{
          type: 'text' as const,
          text: `✅ ${result.issueKey} avanzado: ${getPhaseLabel(project, result.previousPhase)} → ${getPhaseLabel(project, result.newStatus)} (execution: ${result.executionStatus})${autoMsg}\n\nResumen guardado como comentario.`,
        }],
      };
    },
  );

  // ── approve_task ───────────────────────────────────────────
  server.tool(
    'approve_task',
    'Aprueba una tarea pendiente para que pueda ser ejecutada por un agente (execution_status: pending → execute). Úsalo después de revisar el resultado de una fase y decidir que está listo para continuar.',
    {
      projectId: z.string().describe('ID del proyecto'),
      issueId: z.string().describe('ID del issue a aprobar'),
    },
    async ({ projectId, issueId }) => {
      const issue = await api<Issue>(`/api/projects/${projectId}/squad/issues/${issueId}/approve`, {
        method: 'POST',
        body: JSON.stringify({}),
      });

      const project = await api<Project>(`/api/projects/${projectId}`);

      return {
        content: [{
          type: 'text' as const,
          text: `✅ ${issue.key} aprobado para ejecución en fase **${getPhaseLabel(project, issue.status)}**.\n\nExecution status: execute. Listo para ser procesado por un agente.`,
        }],
      };
    },
  );

  // ── reject_task ────────────────────────────────────────────
  server.tool(
    'reject_task',
    'Rechaza una tarea y la devuelve a una fase anterior del pipeline. Útil cuando Test/CI-CD falla y necesitas que Dev corrija el código. El issue queda en "pending" en la fase destino.',
    {
      projectId: z.string().describe('ID del proyecto'),
      issueId: z.string().describe('ID del issue a rechazar'),
      targetPhase: z.string().describe('ID de la fase a la que devolver el issue (debe ser anterior a la actual)'),
      reason: z.string().describe('Explicación de por qué se rechaza y qué debe corregirse'),
    },
    async ({ projectId, issueId, targetPhase, reason }) => {
      const issue = await api<Issue>(`/api/projects/${projectId}/squad/issues/${issueId}/reject`, {
        method: 'POST',
        body: JSON.stringify({ targetPhase, reason }),
      });

      const project = await api<Project>(`/api/projects/${projectId}`);

      return {
        content: [{
          type: 'text' as const,
          text: `🔙 ${issue.key} devuelto a fase **${getPhaseLabel(project, targetPhase)}**.\n\n**Razón:** ${reason}\n\nExecution status: pending. Usar \`approve_task\` cuando esté listo para reintentar.`,
        }],
      };
    },
  );

  // ── get_pipeline_status ────────────────────────────────────
  server.tool(
    'get_pipeline_status',
    'Muestra el estado completo del pipeline Squad AI: cuántos issues hay en cada fase, su estado de ejecución, y un resumen general. Ideal para tener visibilidad antes de ejecutar tareas.',
    {
      projectId: z.string().describe('ID del proyecto Squad AI'),
    },
    async ({ projectId }) => {
      const project = await api<Project>(`/api/projects/${projectId}`);
      const data = await api<{
        project: { id: string; key: string; name: string };
        phases: Record<string, { count: number; issues: { id: string; key: string; title: string; executionStatus: string; priority: string; storyPoints?: number }[] }>;
        summary: { total: number; byExecutionStatus: Record<string, number> };
      }>(`/api/projects/${projectId}/squad/pipeline`);

      const EXEC_ICONS: Record<string, string> = {
        pending: '⏳',
        execute: '🟢',
        executing: '🔄',
        executed: '✅',
        failed: '❌',
      };

      const orderedPhases = getOrderedPhases(project);
      const lines: string[] = [
        `# Pipeline: ${data.project.name} (${data.project.key})`,
        '',
      ];

      for (const phaseStatus of orderedPhases) {
        const phaseData = data.phases[phaseStatus.id];
        if (!phaseData) continue;

        lines.push(`## ${phaseStatus.name} (${phaseData.count})`);

        if (phaseData.issues.length === 0) {
          lines.push('_Sin issues_');
        } else {
          for (const issue of phaseData.issues) {
            const icon = EXEC_ICONS[issue.executionStatus] || '❓';
            const sp = issue.storyPoints ? ` [${issue.storyPoints}sp]` : '';
            lines.push(`- ${icon} **${issue.key}** - ${issue.title}${sp} (${issue.executionStatus})`);
          }
        }
        lines.push('');
      }

      // Summary
      lines.push('---');
      lines.push(`**Total:** ${data.summary.total} issues`);
      const statusSummary = Object.entries(data.summary.byExecutionStatus || {})
        .map(([s, c]) => `${EXEC_ICONS[s] || ''} ${s}: ${c}`)
        .join(' | ');
      if (statusSummary) {
        lines.push(`**Por estado:** ${statusSummary}`);
      }

      return {
        content: [{ type: 'text' as const, text: lines.join('\n') }],
      };
    },
  );

  // ── get_task_context ───────────────────────────────────────
  server.tool(
    'get_task_context',
    'Obtiene el contexto completo de una tarea Squad AI SIN tomarla. Incluye: descripción, phaseContext acumulado, instrucciones del agente para la fase actual, historial de fases y comentarios previos. Úsalo para inspeccionar una tarea antes de decidir si tomarla con pick_squad_task.',
    {
      projectId: z.string().describe('ID del proyecto'),
      issueId: z.string().describe('ID del issue a inspeccionar'),
    },
    async ({ projectId, issueId }) => {
      const [issue, project, comments, phases] = await Promise.all([
        api<Issue>(`/api/projects/${projectId}/issues/${issueId}`),
        api<Project>(`/api/projects/${projectId}`),
        api<Comment[]>(`/api/issues/${issueId}/comments`),
        api<PhaseExecution[]>(`/api/projects/${projectId}/squad/issues/${issueId}/phases`),
      ]);

      const currentPhase = issue.status;
      const nextPhase = getNextPhase(project, currentPhase);
      const currentStatus = project.statuses.find((s) => s.id === currentPhase);
      const agentInstructions = currentStatus?.agentInstructions;

      const phaseHistory = phases
        .filter((p) => p.status === 'completed')
        .map((p) => `- **${getPhaseLabel(project, p.phase)}**: ${p.summary || '(sin resumen)'}`)
        .join('\n');

      const phaseCtx = issue.phaseContext;
      const contextSection = phaseCtx && Object.keys(phaseCtx).length > 0
        ? `## Contexto de fases anteriores\n\`\`\`json\n${JSON.stringify(phaseCtx, null, 2)}\n\`\`\``
        : '';

      const prevComments = comments
        .map((c) => `- ${c.content}`)
        .join('\n');

      return {
        content: [{
          type: 'text' as const,
          text: [
            `# Contexto: ${issue.key} - ${issue.title}`,
            '',
            `**Fase actual**: ${getPhaseLabel(project, currentPhase)} → siguiente: ${nextPhase ? getPhaseLabel(project, nextPhase) : 'N/A'}`,
            `**Execution status**: ${issue.executionStatus}`,
            `**Tipo**: ${issue.type} | **Prioridad**: ${issue.priority} | **Story Points**: ${issue.storyPoints ?? 'N/A'}`,
            `**Asignado a**: ${issue.assigneeId || '(sin asignar)'}`,
            '',
            '## Descripción',
            issue.description || '(sin descripción)',
            '',
            agentInstructions ? `## Instrucciones del agente para esta fase\n${agentInstructions}` : '',
            phaseHistory ? `## Historial de fases completadas\n${phaseHistory}` : '',
            contextSection,
            prevComments ? `## Comentarios\n${prevComments}` : '',
            '',
            `> Para tomar esta tarea usa \`pick_squad_task\` con projectId="${projectId}" issueId="${issueId}"`,
          ].filter(Boolean).join('\n'),
        }],
      };
    },
  );

  // ── fail_squad_task ─────────────────────────────────────────
  server.tool(
    'fail_squad_task',
    'Marca una tarea Squad AI como fallida en su fase actual sin moverla. El issue permanece en la misma fase con execution_status="failed". Se puede reintentar cambiando execution_status a "execute".',
    {
      projectId: z.string().describe('ID del proyecto'),
      issueId: z.string().describe('ID del issue que falló'),
      reason: z.string().describe('Explicación de por qué no se pudo completar la fase'),
    },
    async ({ projectId, issueId, reason }) => {
      const issue = await api<Issue>(`/api/projects/${projectId}/squad/issues/${issueId}/fail`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });

      const project = await api<Project>(`/api/projects/${projectId}`);

      return {
        content: [{
          type: 'text' as const,
          text: `❌ ${issue.key} marcado como fallido en fase "${getPhaseLabel(project, issue.status)}" (execution: failed).\n\n**Razón:** ${reason}\n\nPara reintentar, cambiar execution_status a "execute".`,
        }],
      };
    },
  );
}

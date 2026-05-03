#!/usr/bin/env node

/**
 * Squad AI Worker
 *
 * Supports two modes:
 * 1. Standard: Polls for issues in "Ejecutar" status (Scrum/Kanban projects)
 * 2. Squad AI: Polls for issues in pipeline phases (po, design, dev, test, cicd)
 *    and launches specialized Claude Code agents for each phase.
 *
 * Usage:
 *   node build/worker.js [--project <projectId>] [--interval <seconds>] [--once] [--workdir <path>]
 *
 * Options:
 *   --project   Only poll this project (default: all projects)
 *   --interval  Polling interval in seconds (default: 30)
 *   --once      Run once and exit (don't poll)
 *   --workdir   Working directory for Claude Code (default: current dir)
 */

import { spawn } from 'child_process';
import { createApiClientFromEnv } from './api-client.js';

const client = createApiClientFromEnv();

// ─── Types ───────────────────────────────────────────────────────────────────

interface Issue {
  id: string;
  key: string;
  projectId: string;
  title: string;
  description?: string;
  type: string;
  priority: string;
  status: string;
  executionStatus: string;
  storyPoints?: number;
}

interface Project {
  id: string;
  key: string;
  name: string;
  projectType: string;
}

interface TaskItem {
  issue: Issue;
  project: Project;
  phase?: SquadPhase;
}

// ─── Squad AI Configuration ─────────────────────────────────────────────────

const SQUAD_PHASES = ['po', 'design', 'dev', 'test', 'cicd'] as const;
type SquadPhase = typeof SQUAD_PHASES[number];

const NEXT_STATUS: Record<SquadPhase, string> = {
  po: 'design',
  design: 'dev',
  dev: 'test',
  test: 'cicd',
  cicd: 'done',
};

interface AgentConfig {
  role: string;
  systemPrompt: string;
  allowedTools: string;
  timeout: number; // ms
}

const SQUAD_AGENTS: Record<SquadPhase, AgentConfig> = {
  po: {
    role: 'PO Agent',
    systemPrompt: [
      'Eres el **PO Agent** (Product Owner) de un equipo Squad AI.',
      'Tu trabajo es refinar y preparar el issue para que el equipo pueda trabajarlo.',
      '',
      'Debes:',
      '1. Analizar el título y descripción del issue',
      '2. Escribir criterios de aceptación claros y verificables',
      '3. Si la tarea es grande, sugerir cómo dividirla en subtareas',
      '4. Estimar story points (1, 2, 3, 5, 8, 13)',
      '5. Asegurar que la descripción sea clara y completa para el equipo de diseño',
      '',
      'Usa `mcp__squad__update_issue` para actualizar la descripción con los criterios de aceptación.',
      'Cuando termines, usa `mcp__squad__advance_task` para avanzar al siguiente paso.',
      'Si el issue no tiene suficiente información, usa `mcp__squad__set_pending_questions` con la lista de preguntas que necesitas que responda el usuario y NO avances la tarea. Esto es un canal estructurado para clarificaciones — NO uses `add_comment` para preguntas.',
      'Si el issue ya tiene preguntas previas con respuesta (ver el campo `pendingQuestions` en `get_issue`), úsalas para refinar y limpia las que ya no apliquen llamando `set_pending_questions` con la lista vacía o con las que sigan pendientes.',
    ].join('\n'),
    allowedTools: 'mcp__squad__advance_task,mcp__squad__update_issue,mcp__squad__add_comment,mcp__squad__list_comments,mcp__squad__set_pending_questions,mcp__squad__get_issue,Read,Glob,Grep',
    timeout: 5 * 60 * 1000,
  },
  design: {
    role: 'Design Agent',
    systemPrompt: [
      'Eres el **Design Agent** de un equipo Squad AI.',
      'Tu trabajo es diseñar la solución técnica antes de que el equipo de desarrollo la implemente.',
      '',
      'Debes:',
      '1. Leer la descripción y criterios de aceptación del issue',
      '2. Analizar el código existente para entender la arquitectura',
      '3. Proponer la estructura de archivos/componentes necesarios',
      '4. Definir interfaces, tipos, y contratos de API si aplica',
      '5. Documentar decisiones de diseño como comentario en el issue',
      '',
      'Usa `mcp__squad__add_comment` para documentar el diseño propuesto.',
      'Usa `mcp__squad__update_issue` para actualizar la descripción con el diseño técnico.',
      'Cuando termines, usa `mcp__squad__advance_task` para avanzar al siguiente paso.',
    ].join('\n'),
    allowedTools: 'mcp__squad__advance_task,mcp__squad__update_issue,mcp__squad__add_comment,mcp__squad__list_comments,mcp__squad__get_issue,Read,Glob,Grep',
    timeout: 5 * 60 * 1000,
  },
  dev: {
    role: 'Dev Agent',
    systemPrompt: [
      'Eres el **Dev Agent** de un equipo Squad AI.',
      'Tu trabajo es implementar el código según el diseño y criterios de aceptación.',
      '',
      'Debes:',
      '1. Leer los comentarios previos (diseño, criterios de aceptación)',
      '2. Implementar los cambios en el código',
      '3. Asegurarte de que el código compila correctamente',
      '4. Seguir las convenciones del proyecto existente',
      '5. Documentar los archivos modificados/creados como comentario',
      '',
      'Cuando termines, usa `mcp__squad__advance_task` para avanzar al siguiente paso.',
      'Si encuentras un blocker, usa `mcp__squad__add_comment` explicando el problema.',
    ].join('\n'),
    allowedTools: 'mcp__squad__advance_task,mcp__squad__update_issue,mcp__squad__add_comment,mcp__squad__list_comments,mcp__squad__get_issue,Edit,Write,Read,Glob,Grep,Bash',
    timeout: 10 * 60 * 1000,
  },
  test: {
    role: 'Test Agent',
    systemPrompt: [
      'Eres el **Test Agent** de un equipo Squad AI.',
      'Tu trabajo es validar que la implementación cumple con los criterios de aceptación.',
      '',
      'Debes:',
      '1. Leer los criterios de aceptación y el diseño del issue',
      '2. Revisar los cambios realizados por el Dev Agent (lee los comentarios)',
      '3. Escribir tests unitarios y/o de integración',
      '4. Ejecutar los tests existentes para verificar que nada se rompió',
      '5. Ejecutar lint/build para verificar calidad de código',
      '6. Documentar los resultados como comentario',
      '',
      'Cuando los tests pasen, usa `mcp__squad__advance_task` para avanzar al siguiente paso.',
      'Si los tests fallan, usa `mcp__squad__add_comment` explicando qué falla y NO avances.',
    ].join('\n'),
    allowedTools: 'mcp__squad__advance_task,mcp__squad__update_issue,mcp__squad__add_comment,mcp__squad__list_comments,mcp__squad__get_issue,Edit,Write,Read,Glob,Grep,Bash',
    timeout: 10 * 60 * 1000,
  },
  cicd: {
    role: 'CI/CD Agent',
    systemPrompt: [
      'Eres el **CI/CD Agent** de un equipo Squad AI.',
      'Tu trabajo es verificar que el código está listo para producción.',
      '',
      'Debes:',
      '1. Ejecutar el build completo del proyecto',
      '2. Ejecutar todos los tests',
      '3. Verificar que no hay errores de lint o tipado',
      '4. Verificar que no hay dependencias con vulnerabilidades conocidas',
      '5. Documentar el resultado del pipeline como comentario',
      '',
      'Si todo pasa correctamente, usa `mcp__squad__advance_task` para marcar como Done.',
      'Si algo falla, usa `mcp__squad__add_comment` con los logs de error y NO avances.',
    ].join('\n'),
    allowedTools: 'mcp__squad__advance_task,mcp__squad__add_comment,mcp__squad__list_comments,mcp__squad__get_issue,Read,Glob,Grep,Bash',
    timeout: 10 * 60 * 1000,
  },
};

// ─── CLI Args ────────────────────────────────────────────────────────────────

const cliArgs = process.argv.slice(2);
function getArg(name: string): string | undefined {
  const idx = cliArgs.indexOf(`--${name}`);
  return idx !== -1 && idx + 1 < cliArgs.length ? cliArgs[idx + 1] : undefined;
}
const projectFilter = getArg('project');
const pollInterval = parseInt(getArg('interval') || '30', 10) * 1000;
const runOnce = cliArgs.includes('--once');
const workDir = getArg('workdir') || process.cwd();

// Track issues being processed to avoid duplicate execution
const processing = new Set<string>();

// ─── Task Discovery ──────────────────────────────────────────────────────────

async function getExecutableTasks(): Promise<TaskItem[]> {
  const projects = projectFilter
    ? [await client.api<Project>(`/api/projects/${projectFilter}`)]
    : await client.api<Project[]>('/api/projects');

  const tasks: TaskItem[] = [];

  for (const proj of projects) {
    if (proj.projectType === 'squad_ai') {
      // Squad AI: check all pipeline phases, only issues with execution_status=execute
      for (const phase of SQUAD_PHASES) {
        const issues = await client.api<Issue[]>(`/api/projects/${proj.id}/issues?status=${phase}&execution_status=execute`);
        for (const issue of issues) {
          if (!processing.has(issue.id)) {
            tasks.push({ issue, project: proj, phase });
          }
        }
      }
    } else {
      // Standard: check "ejecutar" status
      const issues = await client.api<Issue[]>(`/api/projects/${proj.id}/issues?status=ejecutar`);
      for (const issue of issues) {
        if (!processing.has(issue.id)) {
          tasks.push({ issue, project: proj });
        }
      }
    }
  }

  return tasks;
}

// ─── Prompt Builders ─────────────────────────────────────────────────────────

function buildStandardPrompt(issue: Issue, project: Project): string {
  return [
    `Eres un desarrollador trabajando en el proyecto "${project.name}".`,
    `Se te ha asignado la siguiente tarea:`,
    '',
    `## ${issue.key}: ${issue.title}`,
    `- Tipo: ${issue.type}`,
    `- Prioridad: ${issue.priority}`,
    `- Story Points: ${issue.storyPoints ?? 'N/A'}`,
    '',
    '## Descripción',
    issue.description || '(sin descripción detallada)',
    '',
    '## Instrucciones',
    '1. Lee y comprende la tarea completamente',
    '2. Implementa los cambios necesarios en el código',
    '3. Asegúrate de que el código compila y funciona',
    '4. Al terminar, usa la herramienta `complete_task` del MCP squad con:',
    `   - projectId: "${project.id}"`,
    `   - issueId: "${issue.id}"`,
    '   - summary: Un resumen detallado de los cambios realizados',
    '',
    'Si no puedes completar la tarea, usa `fail_task` con la razón.',
    '',
    'IMPORTANTE: Trabaja SOLO en lo que pide la tarea. No hagas cambios extra.',
  ].join('\n');
}

function buildSquadPrompt(issue: Issue, project: Project, phase: SquadPhase): string {
  const agent = SQUAD_AGENTS[phase];
  return [
    agent.systemPrompt,
    '',
    '---',
    '',
    `# Proyecto: ${project.name}`,
    `# Issue: ${issue.key} - ${issue.title}`,
    `- Tipo: ${issue.type}`,
    `- Prioridad: ${issue.priority}`,
    `- Story Points: ${issue.storyPoints ?? 'N/A'}`,
    `- Fase actual: ${phase} → siguiente: ${NEXT_STATUS[phase]}`,
    '',
    '## Descripción',
    issue.description || '(sin descripción detallada)',
    '',
    '## Datos para herramientas MCP',
    `- projectId: "${project.id}"`,
    `- issueId: "${issue.id}"`,
    '',
    'IMPORTANTE: Trabaja SOLO en lo que corresponde a tu fase. Usa `advance_task` cuando termines.',
  ].join('\n');
}

// ─── Task Execution ──────────────────────────────────────────────────────────

async function executeTask(task: TaskItem): Promise<void> {
  const { issue, project, phase } = task;
  processing.add(issue.id);

  const isSquad = !!phase;
  const agentLabel = isSquad ? SQUAD_AGENTS[phase].role : 'Worker';
  const ts = () => new Date().toISOString().slice(11, 19);

  console.log(`[${ts()}] 🚀 [${agentLabel}] Ejecutando: ${issue.key} - ${issue.title}`);

  // Mark as executing
  if (isSquad) {
    await client.api(`/api/projects/${project.id}/issues/${issue.id}/execution-status`, {
      method: 'PATCH',
      body: JSON.stringify({ executionStatus: 'executing' }),
    });
  }

  // Comment that agent is starting
  const startMsg = isSquad
    ? `🤖 **${agentLabel}** ha tomado esta tarea en la fase "${phase}" y está procesándola.`
    : '🤖 Claude Code Worker ha detectado esta tarea y está iniciando la ejecución automática.';

  await client.api(`/api/issues/${issue.id}/comments`, {
    method: 'POST',
    body: JSON.stringify({ content: startMsg }),
  });

  const prompt = isSquad
    ? buildSquadPrompt(issue, project, phase)
    : buildStandardPrompt(issue, project);

  const allowedTools = isSquad
    ? SQUAD_AGENTS[phase].allowedTools
    : 'mcp__squad__complete_task,mcp__squad__fail_task,Edit,Write,Read,Glob,Grep,Bash';

  const timeout = isSquad
    ? SQUAD_AGENTS[phase].timeout
    : 10 * 60 * 1000;

  try {
    const child = spawn('claude', ['-p', prompt, '--allowedTools', allowedTools], {
      cwd: workDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error(`Timeout: ${agentLabel} tardó más de ${timeout / 60000} minutos`));
      }, timeout);

      child.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Claude Code salió con código ${code}\n${stderr}`));
        }
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });

    console.log(`[${ts()}] ✅ [${agentLabel}] Completado: ${issue.key}`);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[${ts()}] ❌ [${agentLabel}] Error en ${issue.key}: ${errorMsg}`);

    // If Claude didn't already handle the failure, log the error
    try {
      const currentIssue = await client.api<Issue>(`/api/projects/${project.id}/issues/${issue.id}`);

      if (isSquad) {
        // For Squad AI, mark as failed and comment the error
        if (currentIssue.status === phase) {
          await client.api(`/api/projects/${project.id}/issues/${issue.id}/execution-status`, {
            method: 'PATCH',
            body: JSON.stringify({ executionStatus: 'failed' }),
          });
          await client.api(`/api/issues/${issue.id}/comments`, {
            method: 'POST',
            body: JSON.stringify({
              content: `❌ **${agentLabel} - Error en ejecución**\n\n${errorMsg}\n\n_Marcado como "fallido". Cambia a "ejecutar" para reintentar._`,
            }),
          });
        }
      } else {
        // Standard: move back to "todo"
        if (currentIssue.status === 'ejecutar') {
          await client.api(`/api/projects/${project.id}/issues/${issue.id}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'todo' }),
          });
          await client.api(`/api/issues/${issue.id}/comments`, {
            method: 'POST',
            body: JSON.stringify({
              content: `❌ **Error en ejecución automática**\n\n${errorMsg}\n\n_Devuelta a "To Do" para revisión._`,
            }),
          });
        }
      }
    } catch {
      // Best effort
    }
  } finally {
    processing.delete(issue.id);
  }
}

// ─── Polling ─────────────────────────────────────────────────────────────────

async function poll(): Promise<void> {
  try {
    const tasks = await getExecutableTasks();
    if (tasks.length > 0) {
      const squadTasks = tasks.filter((t) => t.phase);
      const standardTasks = tasks.filter((t) => !t.phase);

      if (standardTasks.length > 0) {
        console.log(`[${new Date().toISOString().slice(11, 19)}] 📋 ${standardTasks.length} tarea(s) en "Ejecutar"`);
      }
      if (squadTasks.length > 0) {
        const byPhase = squadTasks.reduce((acc, t) => {
          acc[t.phase!] = (acc[t.phase!] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);
        const phasesSummary = Object.entries(byPhase).map(([p, c]) => `${p}:${c}`).join(' ');
        console.log(`[${new Date().toISOString().slice(11, 19)}] 🤖 Squad AI: ${squadTasks.length} tarea(s) [${phasesSummary}]`);
      }

      // Execute tasks sequentially
      for (const task of tasks) {
        await executeTask(task);
      }
    }
  } catch (err) {
    console.error(`[${new Date().toISOString().slice(11, 19)}] Error polling:`, err);
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🔧 Squad AI Worker');
  console.log(`   Proyecto: ${projectFilter || 'todos'}`);
  console.log(`   Intervalo: ${pollInterval / 1000}s`);
  console.log(`   Directorio: ${workDir}`);
  console.log(`   Modo: ${runOnce ? 'una vez' : 'continuo'}`);
  console.log(`   Squad AI: activado (fases: ${SQUAD_PHASES.join(', ')})`);
  console.log('');

  await client.ensureAuth();
  console.log('✅ Autenticado correctamente');
  console.log('');

  if (runOnce) {
    await poll();
    return;
  }

  // Initial poll
  await poll();

  // Continue polling
  setInterval(poll, pollInterval);
  console.log(`⏳ Esperando tareas... (polling cada ${pollInterval / 1000}s)`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});

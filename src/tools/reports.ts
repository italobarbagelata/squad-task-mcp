import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { api } from '../api-client.js';

export function registerReportTools(server: McpServer) {
  server.tool(
    'get_dashboard_stats',
    'Obtiene estadísticas generales del dashboard: totales de issues, proyectos activos, etc.',
    {},
    async () => {
      const stats = await api('/api/reports/dashboard');
      return { content: [{ type: 'text', text: JSON.stringify(stats, null, 2) }] };
    },
  );

  server.tool(
    'get_issues_by_project',
    'Reporte de issues agrupados por proyecto.',
    {},
    async () => {
      const data = await api('/api/reports/issues-by-project');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    'get_issues_by_type',
    'Reporte de issues agrupados por tipo (epic, story, task, bug).',
    {},
    async () => {
      const data = await api('/api/reports/issues-by-type');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    'get_team_workload',
    'Reporte de carga de trabajo por equipo/usuario.',
    {},
    async () => {
      const data = await api('/api/reports/team-workload');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    },
  );
}

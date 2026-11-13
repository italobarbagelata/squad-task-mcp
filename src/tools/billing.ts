import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ApiClient } from '../api-client.js';

export function registerBillingTools(server: McpServer, client: ApiClient) {
  server.tool(
    'get_billing_usage',
    'Obtiene el uso actual y los límites del plan (proyectos, features disponibles).',
    {},
    async () => {
      const usage = await client.api('/api/billing/usage');
      return { content: [{ type: 'text', text: JSON.stringify(usage, null, 2) }] };
    },
  );

  server.tool(
    'change_plan',
    'Cambia el plan del usuario. Cualquiera puede bajar a free; subir a pro solo lo puede hacer un admin global. Pro desbloquea proyectos ilimitados.',
    {
      plan: z.enum(['free', 'pro']).describe('Plan destino'),
    },
    async ({ plan }) => {
      const result = await client.api('/api/billing/plan', {
        method: 'PUT',
        body: JSON.stringify({ plan }),
      });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );
}

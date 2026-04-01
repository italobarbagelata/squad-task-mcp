import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ApiClient } from '../api-client.js';

export function registerNotificationTools(server: McpServer, client: ApiClient) {
  server.tool(
    'list_notifications',
    'Lista las notificaciones del usuario autenticado.',
    {},
    async () => {
      const notifications = await client.api('/api/notifications');
      return { content: [{ type: 'text', text: JSON.stringify(notifications, null, 2) }] };
    },
  );

  server.tool(
    'get_unread_count',
    'Obtiene el número de notificaciones no leídas.',
    {},
    async () => {
      const count = await client.api('/api/notifications/unread-count');
      return { content: [{ type: 'text', text: JSON.stringify(count, null, 2) }] };
    },
  );

  server.tool(
    'mark_notification_read',
    'Marca una notificación como leída.',
    { notificationId: z.string().describe('ID de la notificación') },
    async ({ notificationId }) => {
      await client.api(`/api/notifications/${notificationId}/read`, { method: 'PUT' });
      return { content: [{ type: 'text', text: 'Notificación marcada como leída.' }] };
    },
  );

  server.tool(
    'mark_all_notifications_read',
    'Marca todas las notificaciones como leídas.',
    {},
    async () => {
      await client.api('/api/notifications/read-all', { method: 'PUT' });
      return { content: [{ type: 'text', text: 'Todas las notificaciones marcadas como leídas.' }] };
    },
  );
}

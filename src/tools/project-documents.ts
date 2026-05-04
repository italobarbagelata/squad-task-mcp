import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ApiClient } from '../api-client.js';

interface ProjectDocument {
  id: string;
  projectId: string;
  title: string;
  path: string;
  content: string;
  docType: string;
  source: string;
  taskTypes?: string[] | null;
  version: number;
}

export function registerProjectDocumentTools(server: McpServer, client: ApiClient) {
  server.tool(
    'list_project_documents',
    'Lista los documentos del proyecto (sin contenido). Devuelve id, título, doc_type y versión. Para leer el contenido usá get_project_document.',
    {
      projectId: z.string().describe('ID del proyecto'),
    },
    async ({ projectId }) => {
      const docs = await client.api<ProjectDocument[]>(`/api/projects/${projectId}/documents`);
      const summary = docs.map((d) => ({
        id: d.id,
        title: d.title,
        docType: d.docType,
        version: d.version,
      }));
      return { content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }] };
    },
  );

  server.tool(
    'get_project_document',
    'Devuelve el contenido completo de un ProjectDocument por ID. Úsalo durante /squad-pickup cuando necesites leer un documento puntual del knowledge base del proyecto en lugar de cargar todo el contexto al inicio.',
    {
      projectId: z.string().describe('ID del proyecto'),
      documentId: z.string().describe('ID del documento (e.g. "doc-abc123")'),
    },
    async ({ projectId, documentId }) => {
      const doc = await client.api<ProjectDocument>(
        `/api/projects/${projectId}/documents/${documentId}`,
      );
      const out = [
        `# ${doc.title} (v${doc.version}, ${doc.docType})`,
        '',
        doc.content.trim(),
      ].join('\n');
      return { content: [{ type: 'text', text: out }] };
    },
  );
}

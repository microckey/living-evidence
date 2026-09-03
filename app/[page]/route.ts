import atlasHtml from '../../.sites-source/atlas.txt?raw';
import boardHtml from '../../.sites-source/board.txt?raw';
import indexHtml from '../../.sites-source/index.txt?raw';
import templateHtml from '../../.sites-source/template.txt?raw';
import workspaceHtml from '../../.sites-source/workspace.txt?raw';
import { renderDocument } from '../render-document';

const pages = {
  atlas: {
    source: atlasHtml,
    title: 'Living Evidence Atlas',
    description:
      'Explore an evidence map with machine-checkable claims and gaps computed live from the data.',
  },
  board: {
    source: boardHtml,
    title: 'Living Evidence Board',
    description:
      'Turn hypotheses, claims, evidence, and open questions into one auditable map for people and AI agents.',
  },
  workspace: {
    source: workspaceHtml,
    title: 'Living Evidence Workspace',
    description:
      'Build an evidence base with your agent, approve every change, and export a document others can cross-examine.',
  },
  template: {
    source: templateHtml,
    title: 'Living Evidence authoring template',
    description:
      'A minimal template for authoring WebMCP-native documents your AI can cross-examine.',
  },
} as const;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ page: string }> | { page: string } },
) {
  const { page: requestedPage } = await params;
  if (requestedPage === 'index' || requestedPage === 'index.html') {
    return renderDocument(request, indexHtml, {
      title: 'Living Evidence — Documents your AI can cross-examine',
      description:
        'A WebMCP-native living meta-analysis that you and your AI agent can cross-examine, re-run, and extend on the page.',
    });
  }
  const pageName = requestedPage.replace(/\.html$/, '');
  const page = pages[pageName as keyof typeof pages];
  if (!page) return new Response('Not found', { status: 404 });
  return renderDocument(request, page.source, page);
}

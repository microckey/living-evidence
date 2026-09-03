import indexHtml from '../.sites-source/index.txt?raw';
import { renderDocument } from './render-document';

export function GET(request: Request) {
  return renderDocument(request, indexHtml, {
    title: 'Living Evidence — Documents your AI can cross-examine',
    description:
      'A WebMCP-native living meta-analysis that you and your AI agent can cross-examine, re-run, and extend on the page.',
  });
}

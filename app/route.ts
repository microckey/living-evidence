import indexHtml from '../.sites-source/index.txt?raw';
import { renderDocument } from './render-document';

export function GET(request: Request) {
  return renderDocument(request, indexHtml, {
    title: 'Living Evidence — Documents your AI can cross-examine',
    description:
      'A WebMCP-native aggregate-SMD prototype with registered-rule outcomes, explicit provenance gaps, reruns, and human-gated updates.',
  });
}

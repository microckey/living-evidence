#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';
import { parseEvidenceContent } from '../lib/evidence-package.js';
import { canonicalStringify, sha256Hex } from '../lib/integrity.js';

const [inputArg, outputArg] = process.argv.slice(2);
if (!inputArg || inputArg === '--help') {
  console.log('Usage: node scripts/convert-evidence.mjs INPUT.{csv,json,qmd,ipynb} [OUTPUT.json]');
  process.exit(inputArg ? 0 : 1);
}
const input = resolve(inputArg);
const sourceBytes = await readFile(input);
const source = new TextDecoder('utf-8', { fatal: true }).decode(sourceBytes);
const sourceArtifact = {
  filename: basename(input),
  media_type: ({ '.csv': 'text/csv', '.qmd': 'text/markdown', '.ipynb': 'application/x-ipynb+json' })[extname(input).toLowerCase()] || 'application/json',
  sha256: `sha256:${sha256Hex(sourceBytes)}`,
};
const pkg = parseEvidenceContent(source, basename(input), { sourceArtifact });
const output = resolve(outputArg || input.replace(/\.[^.]+$/, '') + '.living-evidence.json');
await writeFile(output, canonicalStringify(pkg) + '\n', 'utf8');
console.log(`${pkg.studies.length} records → ${output}`);

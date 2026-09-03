import { cp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const publicRoot = resolve(projectRoot, 'public');
const sourceRoot = resolve(projectRoot, '.sites-source');
const files = [
  'index.html',
  'atlas.html',
  'board.html',
  'workspace.html',
  'template.html',
];
const directories = ['data', 'docs', 'lib', 'schemas'];

await mkdir(publicRoot, { recursive: true });
await mkdir(sourceRoot, { recursive: true });

for (const name of files) {
  await rm(resolve(publicRoot, name), { force: true });
  const sourceName = name.replace(/\.html$/, '.txt');
  await cp(resolve(projectRoot, name), resolve(sourceRoot, sourceName));
}

for (const name of directories) {
  const target = resolve(publicRoot, name);
  await rm(target, { recursive: true, force: true });
  await cp(resolve(projectRoot, name), target, { recursive: true });
}

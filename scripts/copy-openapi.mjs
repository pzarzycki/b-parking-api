import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(repositoryRoot, 'specs/openapi.yaml');
const destination = resolve(repositoryRoot, 'docs/website/static/openapi.yaml');

await mkdir(dirname(destination), { recursive: true });
await mkdir(resolve(repositoryRoot, 'docs/website/static/img/floor-plans'), { recursive: true });
await copyFile(source, destination);

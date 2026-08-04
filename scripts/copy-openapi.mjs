import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const staticDirectory = resolve(repositoryRoot, 'docs/website/static');
const openApiSource = resolve(repositoryRoot, 'specs/openapi.yaml');
const floorPlanSource = resolve(repositoryRoot, 'examples/garage-layout.yml');

await mkdir(staticDirectory, { recursive: true });
await mkdir(resolve(repositoryRoot, 'docs/website/static/img/floor-plans'), { recursive: true });
await mkdir(resolve(staticDirectory, 'examples'), { recursive: true });
await copyFile(openApiSource, resolve(staticDirectory, 'openapi.yaml'));
await copyFile(floorPlanSource, resolve(staticDirectory, 'examples/garage-layout.yml'));

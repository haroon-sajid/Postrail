// Writes the OpenAPI document to disk so the web app can generate its typed client
// without a running server:  pnpm --filter @postrail/api openapi:export
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createTestApp } from '../src/test/app';

const target = resolve(process.argv[2] ?? '../web/src/api/openapi.json');
const { app } = createTestApp();
const res = await app.request('/openapi.json');
if (!res.ok) throw new Error(`openapi.json responded ${res.status}`);
const doc = (await res.json()) as { info: { version: string } };
// The version is per deploy, not per schema; keep the committed file stable.
doc.info.version = '1';
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, `${JSON.stringify(doc, null, 2)}\n`);
process.stdout.write(`wrote ${target}\n`);

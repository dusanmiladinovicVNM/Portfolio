import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(root, relativePath), 'utf8'));
}

const config = await readJson('vercel.json');

if (config.buildCommand !== 'pnpm --filter @portfolio/web build') {
  failures.push('vercel.json must build only @portfolio/web from the monorepo root.');
}

if (config.outputDirectory !== 'apps/web/dist') {
  failures.push('vercel.json outputDirectory must be apps/web/dist.');
}

const spaRewrite = Array.isArray(config.rewrites)
  ? config.rewrites.find(
      (rewrite) =>
        rewrite?.source === '/(.*)' &&
        rewrite?.destination === '/index.html',
    )
  : undefined;

if (!spaRewrite) {
  failures.push(
    'vercel.json must preserve History API deep links with /(.*) -> /index.html.',
  );
}

const rootPackage = await readJson('package.json');
if (rootPackage.engines?.node !== '>=24 <25') {
  failures.push('Root Node engine must remain pinned to Node 24.');
}

const webPackage = await readJson('apps/web/package.json');
if (webPackage.scripts?.build !== 'vite build') {
  failures.push('The public deployment contract expects the web build to remain vite build.');
}

const envExample = await readFile(
  path.join(root, 'apps/web/.env.example'),
  'utf8',
);
for (const name of [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'VITE_API_BASE_URL',
]) {
  if (!envExample.includes(name)) {
    failures.push(`apps/web/.env.example must document ${name}.`);
  }
}

try {
  await access(path.join(root, 'apps/web/dist/index.html'), constants.R_OK);
} catch {
  failures.push(
    'apps/web/dist/index.html is missing; run the production web build before this check.',
  );
}

try {
  await access(
    path.join(root, 'apps/web/dist/browser-harness.html'),
    constants.F_OK,
  );
  failures.push('browser-harness.html must not be present in the production web artifact.');
} catch {
  // Expected: the test-only harness is not part of the production artifact.
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`PUBLIC WEB DEPLOYMENT CHECK: ${failure}`);
  process.exit(1);
}

console.log('PUBLIC WEB DEPLOYMENT CHECK: PASS');

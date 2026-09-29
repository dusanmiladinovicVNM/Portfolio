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

const deploymentEnabled = config.git?.deploymentEnabled;
if (
  typeof deploymentEnabled !== 'object' ||
  deploymentEnabled === null ||
  deploymentEnabled['**'] !== false
) {
  failures.push(
    'vercel.json must suppress automatic Git deployment for every branch, including main; production web deploys only through the gated main CI release.',
  );
}

if (
  typeof deploymentEnabled === 'object' &&
  deploymentEnabled !== null
) {
  if (Object.prototype.hasOwnProperty.call(deploymentEnabled, '*')) {
    failures.push(
      'vercel.json must not use "*" as the deployment catch-all; minimatch "*" does not cover slash branch names.',
    );
  }

  const unexpectedEnabledPatterns = Object.entries(deploymentEnabled)
    .filter(([, enabled]) => enabled === true)
    .map(([pattern]) => pattern);

  if (unexpectedEnabledPatterns.length > 0) {
    failures.push(
      `vercel.json must not enable automatic deployment for additional branch patterns: ${unexpectedEnabledPatterns.join(', ')}.`,
    );
  }

  const canonicalDeploymentDecision = (branch) => {
    const matchingDecisions = [];

    if (deploymentEnabled['**'] === false) {
      matchingDecisions.push(false);
    }
    // Vercel defaults an unspecified branch to enabled. The globstar false
    // rule must therefore cover main and every feature branch.
    return matchingDecisions.length === 0
      ? true
      : matchingDecisions.some(Boolean);
  };

  for (const [branch, expectedEnabled] of [
    ['main', false],
    ['plain-branch', false],
    ['feature/foo', false],
    ['ux/inspection-workspace-shell', false],
    ['claude/something', false],
  ]) {
    const actualEnabled = canonicalDeploymentDecision(branch);
    if (actualEnabled !== expectedEnabled) {
      failures.push(
        `Vercel Git deployment policy is wrong for ${branch}: expected ${expectedEnabled ? 'enabled' : 'disabled'}.`,
      );
    }
  }
}

const rootPackage = await readJson('package.json');
if (
  rootPackage.scripts?.['vercel:production:deploy'] !==
  'bash scripts/deployment/deploy-vercel-production.sh'
) {
  failures.push(
    'Production web deployment must use the canonical scripts/deployment/deploy-vercel-production.sh entry point.',
  );
}

const supabaseDeployScript = await readFile(
  path.join(root, 'scripts/deployment/deploy-supabase-function.sh'),
  'utf8',
);
const vercelDeployScript = await readFile(
  path.join(root, 'scripts/deployment/deploy-vercel-production.sh'),
  'utf8',
);

for (const [label, deployScript] of [
  ['Supabase API', supabaseDeployScript],
  ['Vercel web', vercelDeployScript],
]) {
  if (
    !deployScript.includes('DEPLOY_REQUIRE_REMOTE_MAIN') ||
    !deployScript.includes('assert-current-main.sh')
  ) {
    failures.push(
      `${label} canonical deploy script must consume DEPLOY_REQUIRE_REMOTE_MAIN through assert-current-main.sh.`,
    );
  }
}

const ciWorkflow = await readFile(
  path.join(root, '.github/workflows/ci.yml'),
  'utf8',
);
const releaseJobStart = ciWorkflow.indexOf('  deploy-production-api:');
const releaseJob =
  releaseJobStart === -1 ? '' : ciWorkflow.slice(releaseJobStart);
const apiDeployIndex = releaseJob.indexOf(
  'run: pnpm supabase:function:deploy',
);
const webDeployIndex = releaseJob.indexOf(
  'run: pnpm vercel:production:deploy',
);

if (releaseJobStart === -1) {
  failures.push('Main CI must contain the gated deploy-production-api release job.');
} else {
  if (
    !releaseJob.includes(
      "if: github.event_name == 'push' && github.ref == 'refs/heads/main'",
    )
  ) {
    failures.push('Production release job must run only for pushes to main.');
  }
  if (
    apiDeployIndex === -1 ||
    webDeployIndex === -1 ||
    webDeployIndex <= apiDeployIndex
  ) {
    failures.push(
      'Production release must deploy and verify the API before deploying the Vercel web frontend.',
    );
  }
  if (!releaseJob.includes('DEPLOY_REQUIRE_REMOTE_MAIN: "1"')) {
    failures.push(
      'Production release must require the current-main fence at deployment time.',
    );
  }
}

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

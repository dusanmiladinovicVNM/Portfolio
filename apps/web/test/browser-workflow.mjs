import { spawn } from 'node:child_process';
import { join } from 'node:path';

const vitePort = 4174;
const driverPort = 9515;
const baseUrl = `http://127.0.0.1:${vitePort}`;
const driverUrl = `http://127.0.0.1:${driverPort}`;
const propertyId = '11111111-1111-4111-8111-111111111111';
const unitId = '22222222-2222-4222-8222-222222222222';
const tenancyId = '33333333-3333-4333-8333-333333333333';
const agreementId = '55555555-5555-4555-8555-555555555555';
const amendmentId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const inspectionId = 'a1000000-0000-4000-8000-000000000001';
const inspectionSectionId = 'a1000000-0000-4000-8000-000000000003';
const setupPropertyId = 'b1000000-0000-4000-8000-000000000001';
const setupUnitId = 'b1000000-0000-4000-8000-000000000002';

const logs = [];

function capture(child, label) {
  child.stdout?.on('data', (chunk) => logs.push(`[${label}] ${chunk}`));
  child.stderr?.on('data', (chunk) => logs.push(`[${label}] ${chunk}`));
}

function stop(child) {
  if (!child || child.killed) return;
  try {
    if (process.platform !== 'win32' && child.pid) {
      process.kill(-child.pid, 'SIGTERM');
    } else {
      child.kill('SIGTERM');
    }
  } catch {
    child.kill('SIGTERM');
  }
}

async function waitForHttp(url, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = new Error(`${url} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  throw lastError ?? new Error(`Timed out waiting for ${url}`);
}

async function webdriver(path, options = {}) {
  const response = await fetch(`${driverUrl}${path}`, {
    method: options.method ?? 'GET',
    headers:
      options.body === undefined
        ? undefined
        : { 'content-type': 'application/json' },
    body:
      options.body === undefined
        ? undefined
        : JSON.stringify(options.body),
  });
  const payload = await response.json();

  if (!response.ok || payload.value?.error) {
    throw new Error(
      `WebDriver ${options.method ?? 'GET'} ${path} failed: ${JSON.stringify(payload.value)}`,
    );
  }

  return payload.value;
}

function elementId(value) {
  const id = value?.['element-6066-11e4-a52e-4f735466cecf'];
  if (!id) throw new Error('WebDriver did not return an element id.');
  return id;
}

async function waitForElement(sessionId, using, value, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;

  while (Date.now() < deadline) {
    try {
      const result = await webdriver(`/session/${sessionId}/element`, {
        method: 'POST',
        body: { using, value },
      });
      return elementId(result);
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  throw new Error(
    `Timed out waiting for ${using}=${value}. Last error: ${lastError}`,
  );
}

async function clickXpath(sessionId, xpath) {
  const id = await waitForElement(sessionId, 'xpath', xpath);
  await webdriver(`/session/${sessionId}/element/${id}/click`, {
    method: 'POST',
    body: {},
  });
}

async function clearXpath(sessionId, xpath) {
  const id = await waitForElement(sessionId, 'xpath', xpath);
  await webdriver(`/session/${sessionId}/element/${id}/clear`, {
    method: 'POST',
    body: {},
  });
}

async function typeXpath(sessionId, xpath, value) {
  const id = await waitForElement(sessionId, 'xpath', xpath);
  await webdriver(`/session/${sessionId}/element/${id}/clear`, {
    method: 'POST',
    body: {},
  });
  await webdriver(`/session/${sessionId}/element/${id}/value`, {
    method: 'POST',
    body: { text: value, value: [...value] },
  });
}

async function selectOptionXpath(sessionId, selectXpath, optionValue) {
  const optionXpath =
    `${selectXpath}/option[@value='${optionValue}']`;
  const id = await waitForElement(sessionId, 'xpath', optionXpath);
  await webdriver(`/session/${sessionId}/element/${id}/click`, {
    method: 'POST',
    body: {},
  });
}

async function elementValueXpath(sessionId, xpath) {
  const id = await waitForElement(sessionId, 'xpath', xpath);
  return webdriver(
    `/session/${sessionId}/element/${id}/property/value`,
  );
}

async function clickAndDismissConfirm(sessionId, xpath, expectedText) {
  const id = await waitForElement(sessionId, 'xpath', xpath);
  try {
    await webdriver(`/session/${sessionId}/element/${id}/click`, {
      method: 'POST',
      body: {},
    });
  } catch (error) {
    if (!String(error).includes('unexpected alert open')) throw error;
  }

  const text = await webdriver(`/session/${sessionId}/alert/text`);
  assertEqual(text, expectedText, 'Unsaved Inspection confirmation');
  await webdriver(`/session/${sessionId}/alert/dismiss`, {
    method: 'POST',
    body: {},
  });
}

async function currentUrl(sessionId) {
  return webdriver(`/session/${sessionId}/url`);
}

async function activeElement(sessionId) {
  const value = await webdriver(`/session/${sessionId}/element/active`);
  return elementId(value);
}

async function executeScript(sessionId, script) {
  return webdriver(`/session/${sessionId}/execute/sync`, {
    method: 'POST',
    body: { script, args: [] },
  });
}

async function waitForBinaryReads(sessionId, expected, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const count = await executeScript(
      sessionId,
      'return window.__portfolioBinaryReads || 0;',
    );
    if (count === expected) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${expected} binary read(s).`);
}

async function waitForNewWindow(sessionId, previousHandles, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const handles = await webdriver(`/session/${sessionId}/window/handles`);
    const added = handles.find((handle) => !previousHandles.includes(handle));
    if (added) return added;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Timed out waiting for the document window.');
}

async function switchWindow(sessionId, handle) {
  await webdriver(`/session/${sessionId}/window`, {
    method: 'POST',
    body: { handle },
  });
}

async function assertActiveHeading(sessionId, expectedText, label) {
  const id = await activeElement(sessionId);
  const [name, text] = await Promise.all([
    webdriver(`/session/${sessionId}/element/${id}/name`),
    webdriver(`/session/${sessionId}/element/${id}/text`),
  ]);
  assertEqual(name.toLowerCase(), 'h1', `${label} active element`);
  assertEqual(text.trim(), expectedText, `${label} heading text`);
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const vite = spawn(
  pnpm,
  ['exec', 'vite', '--host', '127.0.0.1', '--port', String(vitePort), '--strictPort'],
  {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
  },
);
capture(vite, 'vite');

const chromeDriverExecutable = process.env.CHROMEWEBDRIVER
  ? join(process.env.CHROMEWEBDRIVER, process.platform === 'win32' ? 'chromedriver.exe' : 'chromedriver')
  : process.platform === 'win32'
    ? 'chromedriver.exe'
    : 'chromedriver';

const driver = spawn(
  chromeDriverExecutable,
  [`--port=${driverPort}`, '--allowed-origins=*'],
  {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
  },
);
capture(driver, 'chromedriver');

let sessionId;

try {
  await Promise.all([
    waitForHttp(`${baseUrl}/browser-harness.html?asOf=2025-06-30`),
    waitForHttp(`${driverUrl}/status`),
  ]);

  const session = await webdriver('/session', {
    method: 'POST',
    body: {
      capabilities: {
        alwaysMatch: {
          browserName: 'chrome',
          'goog:chromeOptions': {
            args: [
              '--headless=new',
              '--no-sandbox',
              '--disable-dev-shm-usage',
              '--window-size=1440,1200',
            ],
          },
        },
      },
    },
  });
  sessionId = session.sessionId;

  await webdriver(`/session/${sessionId}/url`, {
    method: 'POST',
    body: {
      url: `${baseUrl}/browser-harness.html?asOf=2025-06-30`,
    },
  });

  await waitForElement(
    sessionId,
    'xpath',
    "//h1[normalize-space()='Portfolio picture']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//a[normalize-space()='Skip to main content']",
  );
  await assertActiveHeading(sessionId, 'Portfolio picture', 'Dashboard focus');
  const dashboardUrl = `${baseUrl}/dashboard?asOf=2025-06-30`;
  assertEqual(
    await currentUrl(sessionId),
    dashboardUrl,
    'Dashboard canonical URL',
  );
  await clearXpath(
    sessionId,
    "//input[@aria-label='Reporting business date']",
  );
  await new Promise((resolve) => setTimeout(resolve, 200));
  assertEqual(
    await currentUrl(sessionId),
    dashboardUrl,
    'Empty Dashboard date does not create an invalid route',
  );

  await clickXpath(sessionId, "//aside//a[normalize-space()='Parties']");
  await waitForElement(sessionId, 'xpath', "//h1[normalize-space()='Parties']");
  assertEqual(
    await currentUrl(sessionId),
    baseUrl + '/parties?asOf=2025-06-30',
    'Parties URL',
  );
  await selectOptionXpath(
    sessionId,
    "//form[contains(@class,'setup-form')]//select[@name='partyType']",
    'company',
  );
  await typeXpath(
    sessionId,
    "//form[contains(@class,'setup-form')]//input[@name='code']",
    'PTY-SETUP-BRW',
  );
  await typeXpath(
    sessionId,
    "//form[contains(@class,'setup-form')]//input[@name='legalName']",
    'Setup Service GmbH',
  );
  await typeXpath(
    sessionId,
    "//form[contains(@class,'setup-form')]//input[@name='email']",
    'service@example.test',
  );
  await typeXpath(
    sessionId,
    "//form[contains(@class,'setup-form')]//input[@name='addressLine1']",
    'Setup Street 10',
  );
  await typeXpath(
    sessionId,
    "//form[contains(@class,'setup-form')]//input[@name='postalCode']",
    '8000',
  );
  await typeXpath(
    sessionId,
    "//form[contains(@class,'setup-form')]//input[@name='city']",
    'Zürich',
  );
  await typeXpath(
    sessionId,
    "//form[contains(@class,'setup-form')]//input[@name='countryCode']",
    'CH',
  );
  await clickXpath(
    sessionId,
    "//form[contains(@class,'setup-form')]//button[normalize-space()='Create Party']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//article[contains(@class,'party-card')][.//h3[normalize-space()='Setup Service GmbH']]",
  );

  await clickXpath(sessionId, "//aside//a[normalize-space()='Overview']");
  await waitForElement(
    sessionId,
    'xpath',
    "//h1[normalize-space()='Portfolio picture']",
  );

  await typeXpath(
    sessionId,
    "//form[contains(@class,'setup-form')]//input[@name='code']",
    'PROP-SETUP-BRW',
  );
  await typeXpath(
    sessionId,
    "//form[contains(@class,'setup-form')]//input[@name='name']",
    'Setup Browser Property',
  );
  await typeXpath(
    sessionId,
    "//form[contains(@class,'setup-form')]//input[@name='street']",
    'Setup Avenue',
  );
  await typeXpath(
    sessionId,
    "//form[contains(@class,'setup-form')]//input[@name='houseNumber']",
    '20',
  );
  await typeXpath(
    sessionId,
    "//form[contains(@class,'setup-form')]//input[@name='postalCode']",
    '8001',
  );
  await typeXpath(
    sessionId,
    "//form[contains(@class,'setup-form')]//input[@name='city']",
    'Zürich',
  );
  await clickXpath(
    sessionId,
    "//form[contains(@class,'setup-form')]//button[normalize-space()='Create Property']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//h1[normalize-space()='Setup Browser Property']",
  );
  assertEqual(
    await currentUrl(sessionId),
    baseUrl + '/properties/' + setupPropertyId + '?asOf=2025-06-30',
    'Created Property URL',
  );

  await typeXpath(
    sessionId,
    "//form[contains(@class,'setup-form')]//input[@name='code']",
    'UNIT-SETUP-BRW',
  );
  await typeXpath(
    sessionId,
    "//form[contains(@class,'setup-form')]//input[@name='unitNumber']",
    '2B',
  );
  await typeXpath(
    sessionId,
    "//form[contains(@class,'setup-form')]//input[@name='floor']",
    '2',
  );
  await typeXpath(
    sessionId,
    "//form[contains(@class,'setup-form')]//input[@name='areaM2']",
    '64.5',
  );
  await clickXpath(
    sessionId,
    "//form[contains(@class,'setup-form')]//button[normalize-space()='Create Unit']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//h1[normalize-space()='Unit 2B']",
  );
  const setupUnitUrl =
    baseUrl +
    '/properties/' +
    setupPropertyId +
    '/units/' +
    setupUnitId +
    '?tab=spaces&asOf=2025-06-30';
  assertEqual(
    await currentUrl(sessionId),
    setupUnitUrl,
    'Created Unit Spaces URL',
  );

  await typeXpath(
    sessionId,
    "//form[contains(@class,'setup-form')]//input[@name='code']",
    'BED-SETUP',
  );
  await typeXpath(
    sessionId,
    "//form[contains(@class,'setup-form')]//input[@name='name']",
    'Setup Bedroom',
  );
  await typeXpath(
    sessionId,
    "//form[contains(@class,'setup-form')]//input[@name='areaM2']",
    '14.5',
  );
  await typeXpath(
    sessionId,
    "//form[contains(@class,'setup-form')]//input[@name='sortOrder']",
    '1',
  );
  await clickXpath(
    sessionId,
    "//form[contains(@class,'setup-form')]//button[normalize-space()='Create Space']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//article[contains(@class,'space-card')][.//h3[normalize-space()='Setup Bedroom']]",
  );
  assertEqual(
    await currentUrl(sessionId),
    setupUnitUrl,
    'Space creation keeps Unit Spaces context',
  );

  await clickXpath(sessionId, "//aside//a[normalize-space()='Overview']");
  await waitForElement(
    sessionId,
    'xpath',
    "//h1[normalize-space()='Portfolio picture']",
  );

  await clickXpath(
    sessionId,
    "//a[.//strong[normalize-space()='PROP-BRW']]",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//h1[normalize-space()='Browser Test Property']",
  );
  await assertActiveHeading(
    sessionId,
    'Browser Test Property',
    'Property route focus',
  );
  assertEqual(
    await currentUrl(sessionId),
    `${baseUrl}/properties/${propertyId}?asOf=2025-06-30`,
    'Property URL',
  );

  await clickXpath(
    sessionId,
    "//a[contains(@class,'unit-card')][.//strong[normalize-space()='Unit 1A']]",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//h1[normalize-space()='Unit 1A']",
  );
  await assertActiveHeading(sessionId, 'Unit 1A', 'Unit route focus');
  const unitOverviewUrl =
    `${baseUrl}/properties/${propertyId}/units/${unitId}?tab=overview&asOf=2025-06-30`;
  assertEqual(
    await currentUrl(sessionId),
    unitOverviewUrl,
    'Unit overview URL',
  );
  await clearXpath(
    sessionId,
    "//input[@aria-label='Unit overview business date']",
  );
  await new Promise((resolve) => setTimeout(resolve, 200));
  assertEqual(
    await currentUrl(sessionId),
    unitOverviewUrl,
    'Empty Unit Overview date does not create an invalid route',
  );

  await clickXpath(sessionId, "//a[normalize-space()='Contracts']");
  await waitForElement(
    sessionId,
    'xpath',
    "//h2[normalize-space()='Select the lifecycle record']",
  );
  await assertActiveHeading(sessionId, 'Unit 1A', 'Contracts tab focus');

  await clickXpath(
    sessionId,
    "//a[contains(@class,'selection-card')][.//strong[normalize-space()='TEN-BRW']]",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//a[contains(@class,'agreement-card')][.//span[normalize-space()='AGR-BRW']]",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[normalize-space()='Browser Tenant']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[normalize-space()='Browser Landlord Ltd']",
  );

  await clickXpath(
    sessionId,
    "//a[contains(@class,'agreement-card')][.//span[normalize-space()='AGR-BRW']]",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//section[.//p[normalize-space()='Step 3 · Agreement Documents']]//h2[normalize-space()='AGR-BRW']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//strong[normalize-space()='LEASE-2026.pdf']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//article[.//strong[normalize-space()='LEASE-2026.pdf']]//button[normalize-space()='Open']",
  );

  const originalHandle = await webdriver(`/session/${sessionId}/window`);
  const handlesBeforeOpen = await webdriver(
    `/session/${sessionId}/window/handles`,
  );
  await clickXpath(
    sessionId,
    "//article[.//strong[normalize-space()='LEASE-2026.pdf']]//button[normalize-space()='Open']",
  );
  await waitForBinaryReads(sessionId, 1);
  const documentHandle = await waitForNewWindow(
    sessionId,
    handlesBeforeOpen,
  );
  await switchWindow(sessionId, documentHandle);
  const documentUrl = await currentUrl(sessionId);
  if (!documentUrl.startsWith(`blob:${baseUrl}/`)) {
    throw new Error(
      `Open document URL: expected blob:${baseUrl}/..., got ${documentUrl}`,
    );
  }
  await webdriver(`/session/${sessionId}/window`, {
    method: 'DELETE',
  });
  await switchWindow(sessionId, originalHandle);

  await clickXpath(
    sessionId,
    "//article[.//strong[normalize-space()='LEASE-2026.pdf']]//button[normalize-space()='Download']",
  );
  await waitForBinaryReads(sessionId, 2);
  await waitForElement(
    sessionId,
    'xpath',
    "//a[contains(@class,'amendment-card')][.//strong[normalize-space()='AMD-BRW']]",
  );

  const agreementDeepLink =
    `${baseUrl}/properties/${propertyId}/units/${unitId}?tab=contracts&tenancyId=${tenancyId}&agreementId=${agreementId}&asOf=2025-06-30`;
  assertEqual(
    await currentUrl(sessionId),
    agreementDeepLink,
    'Agreement contract deep-link URL',
  );

  await clickXpath(sessionId, "//aside//a[normalize-space()='Unit dossier']");
  assertEqual(
    await currentUrl(sessionId),
    agreementDeepLink,
    'Active Unit dossier link preserves Contract selection',
  );

  await clearXpath(
    sessionId,
    "//input[@aria-label='Contract effective terms business date']",
  );
  await new Promise((resolve) => setTimeout(resolve, 200));
  assertEqual(
    await currentUrl(sessionId),
    agreementDeepLink,
    'Empty Contract date does not create an invalid route',
  );

  await clickXpath(
    sessionId,
    "//a[contains(@class,'amendment-card')][.//strong[normalize-space()='AMD-BRW']]",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//section[.//p[normalize-space()='Step 5 · Amendment Documents']]//h2[normalize-space()='AMD-BRW']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//strong[normalize-space()='LEASE-AMENDMENT-2026.pdf']",
  );
  await clickXpath(
    sessionId,
    "//article[.//strong[normalize-space()='LEASE-AMENDMENT-2026.pdf']]//button[normalize-space()='Download']",
  );
  await waitForBinaryReads(sessionId, 3);

  const expectedDeepLink =
    `${baseUrl}/properties/${propertyId}/units/${unitId}?tab=contracts&tenancyId=${tenancyId}&agreementId=${agreementId}&amendmentId=${amendmentId}&asOf=2025-06-30`;
  assertEqual(
    await currentUrl(sessionId),
    expectedDeepLink,
    'Amendment contract deep-link URL',
  );

  await webdriver(`/session/${sessionId}/refresh`, {
    method: 'POST',
    body: {},
  });
  await waitForElement(
    sessionId,
    'xpath',
    "//section[.//p[normalize-space()='Step 5 · Amendment Documents']]//h2[normalize-space()='AMD-BRW']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//strong[normalize-space()='LEASE-2026.pdf']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//strong[normalize-space()='LEASE-AMENDMENT-2026.pdf']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[normalize-space()='Browser Tenant']",
  );
  assertEqual(
    await currentUrl(sessionId),
    expectedDeepLink,
    'Deep link after browser refresh',
  );

  await clickXpath(sessionId, "//a[normalize-space()='Inspections']");
  await waitForElement(
    sessionId,
    'xpath',
    "//h2[normalize-space()='Inspections']",
  );
  await clickXpath(
    sessionId,
    "//a[contains(@class,'inspection-card')][.//strong[normalize-space()='INS-BRW-001']]",
  );

  const inspectionUrl =
    `${baseUrl}/properties/${propertyId}/units/${unitId}?tab=inspections&inspectionId=${inspectionId}&sectionId=${inspectionSectionId}&asOf=2025-06-30`;
  await waitForElement(
    sessionId,
    'xpath',
    "//button[normalize-space()='Start Inspection']",
  );
  assertEqual(
    await currentUrl(sessionId),
    inspectionUrl,
    'Inspection section deep-link URL',
  );

  await clickXpath(
    sessionId,
    "//button[normalize-space()='Start Inspection']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//span[contains(@class,'status-chip')][normalize-space()='in_progress']",
  );

  const conditionSelect =
    "//div[contains(@class,'inspection-item')][.//span[contains(normalize-space(),'Condition')]]//select";
  await selectOptionXpath(sessionId, conditionSelect, 'damaged');

  const notesInput =
    "//div[contains(@class,'inspection-item')][.//span[contains(normalize-space(),'Damage notes')]]//input[@type='text']";
  await waitForElement(sessionId, 'xpath', notesInput);
  await typeXpath(sessionId, notesInput, 'Window scratch');

  await clickAndDismissConfirm(
    sessionId,
    "//a[normalize-space()='Timeline']",
    'This Inspection section has unsaved changes. Leave and discard them?',
  );
  assertEqual(
    await currentUrl(sessionId),
    inspectionUrl,
    'Dirty Inspection navigation remains blocked',
  );
  assertEqual(
    await elementValueXpath(sessionId, notesInput),
    'Window scratch',
    'Dirty Inspection answer after cancelled navigation',
  );

  await clickXpath(
    sessionId,
    "//button[normalize-space()='Save section']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[contains(normalize-space(),'Section matches canonical server state')]",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//a[contains(@class,'inspection-section-link')][.//small[normalize-space()='revision 1']]",
  );

  await typeXpath(sessionId, notesInput, 'conflict-edit');
  await clickXpath(
    sessionId,
    "//button[normalize-space()='Save section']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[contains(normalize-space(),'This section changed on the server. Your local answers are still visible.')]",
  );
  assertEqual(
    await elementValueXpath(sessionId, notesInput),
    'conflict-edit',
    'Local Inspection draft survives section revision conflict',
  );
  assertEqual(
    await currentUrl(sessionId),
    inspectionUrl,
    'Inspection conflict keeps working URL context',
  );

  process.stdout.write(
    'Browser workflow PASS: Party + Property + Unit + Space setup → existing Contracts/documents → Inspection Start/edit/save/conflict\n',
  );
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
  if (logs.length > 0) {
    process.stderr.write(logs.join(''));
  }
  process.exitCode = 1;
} finally {
  if (sessionId) {
    try {
      await webdriver(`/session/${sessionId}`, { method: 'DELETE' });
    } catch {}
  }
  stop(driver);
  stop(vite);
}

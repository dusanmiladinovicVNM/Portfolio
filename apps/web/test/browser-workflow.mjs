import { spawn } from 'node:child_process';
import { rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const vitePort = 4174;
const driverPort = 9515;
const baseUrl = `http://127.0.0.1:${vitePort}`;
const driverUrl = `http://127.0.0.1:${driverPort}`;
const propertyId = '11111111-1111-4111-8111-111111111111';
const unitId = '22222222-2222-4222-8222-222222222222';
const tenancyId = '33333333-3333-4333-8333-333333333333';
const landlordPartyId = '88888888-8888-4888-8888-888888888888';
const tenantPartyId = '99999999-9999-4999-8999-999999999999';
const agreementId = '55555555-5555-4555-8555-555555555555';
const amendmentId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const inspectionId = 'a1000000-0000-4000-8000-000000000001';
const inspectionSectionId = 'a1000000-0000-4000-8000-000000000003';
const setupPropertyId = 'b1000000-0000-4000-8000-000000000001';
const setupUnitId = 'b1000000-0000-4000-8000-000000000002';
const setupSpaceId = 'b1000000-0000-4000-8000-000000000003';
const setupDestinationUnitId = 'c1000000-0000-4000-8000-000000000001';
const setupDestinationSpaceId = 'c1000000-0000-4000-8000-000000000002';
const setupTenancyId = 'b1000000-0000-4000-8000-000000000007';
const setupSignedAgreementId = 'b1000000-0000-4000-8000-000000000010';
const setupSignedAmendmentId = 'b1000000-0000-4000-8000-000000000019';
const setupReplacementAgreementId = 'b1000000-0000-4000-8000-000000000011';
const setupAmendmentDocumentId = 'b1000000-0000-4000-8000-000000000023';
const setupAgreementDocumentId = 'b1000000-0000-4000-8000-000000000024';
const setupAmendmentDocumentVersionId = 'b1000000-0000-4000-8000-000000000025';
const setupAgreementDocumentVersionId = 'b1000000-0000-4000-8000-000000000026';
const setupAssetId = 'b1000000-0000-4000-8000-000000000029';
const setupReplacementAssetId = 'b1000000-0000-4000-8000-000000000030';

const amendmentSignedFilePath = join(
  tmpdir(),
  'portfolio-amendment-signed-original.pdf',
);
const agreementSignedFilePath = join(
  tmpdir(),
  'portfolio-agreement-signed-original.pdf',
);

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

async function setFileXpath(sessionId, xpath, filePath) {
  const id = await waitForElement(sessionId, 'xpath', xpath);
  await webdriver(`/session/${sessionId}/element/${id}/value`, {
    method: 'POST',
    body: { text: filePath, value: [...filePath] },
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

async function setInputValueXpath(sessionId, xpath, value) {
  const id = await waitForElement(sessionId, 'xpath', xpath);
  await webdriver(`/session/${sessionId}/execute/sync`, {
    method: 'POST',
    body: {
      script:
        'const element = arguments[0];' +
        'element.value = arguments[1];' +
        'element.dispatchEvent(new Event("input", { bubbles: true }));' +
        'element.dispatchEvent(new Event("change", { bubbles: true }));' +
        'return element.value;',
      args: [
        { 'element-6066-11e4-a52e-4f735466cecf': id },
        value,
      ],
    },
  });
}

async function setReactInputValueXpath(sessionId, xpath, value) {
  const id = await waitForElement(sessionId, 'xpath', xpath);
  await webdriver(`/session/${sessionId}/execute/sync`, {
    method: 'POST',
    body: {
      script:
        'const element = arguments[0];' +
        'const setter = Object.getOwnPropertyDescriptor(' +
        'HTMLInputElement.prototype, "value").set;' +
        'setter.call(element, arguments[1]);' +
        'element.dispatchEvent(new Event("input", { bubbles: true }));' +
        'element.dispatchEvent(new Event("change", { bubbles: true }));' +
        'return element.value;',
      args: [
        { 'element-6066-11e4-a52e-4f735466cecf': id },
        value,
      ],
    },
  });
}

async function elementValueXpath(sessionId, xpath) {
  const id = await waitForElement(sessionId, 'xpath', xpath);
  return webdriver(
    `/session/${sessionId}/element/${id}/property/value`,
  );
}

async function elementDisabledXpath(sessionId, xpath) {
  const id = await waitForElement(sessionId, 'xpath', xpath);
  return webdriver(
    `/session/${sessionId}/element/${id}/property/disabled`,
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

async function waitForScriptTruthy(
  sessionId,
  script,
  label,
  timeoutMs = 10000,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await executeScript(sessionId, script)) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Timed out waiting for ' + label + '.');
}

async function navigateWithPopState(sessionId, path) {
  const serialized = JSON.stringify(path);
  await executeScript(
    sessionId,
    'window.history.pushState(null, "", ' + serialized + ');' +
      'window.dispatchEvent(new PopStateEvent("popstate"));' +
      'return true;',
  );
}

async function elementExistsXpath(sessionId, xpath) {
  try {
    await webdriver(`/session/${sessionId}/element`, {
      method: 'POST',
      body: { using: 'xpath', value: xpath },
    });
    return true;
  } catch {
    return false;
  }
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
    writeFile(
      amendmentSignedFilePath,
      new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52, 10, 65, 77, 68]),
    ),
    writeFile(
      agreementSignedFilePath,
      new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52, 10, 65, 71, 82]),
    ),
  ]);

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
  await waitForElement(
    sessionId,
    'xpath',
    "//article[contains(@class,'party-card')][.//h3[normalize-space()='Browser Landlord Ltd']]",
  );
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
  await waitForElement(
    sessionId,
    'xpath',
    "//*[normalize-space()='No Spaces defined for this Unit.']",
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

  await clickXpath(sessionId, "//a[normalize-space()='Tenancies']");
  await waitForElement(
    sessionId,
    'xpath',
    "//*[normalize-space()='No Tenancy records exist for this Unit.']",
  );
  const setupTenancyUrl =
    baseUrl +
    '/properties/' +
    setupPropertyId +
    '/units/' +
    setupUnitId +
    '?tab=tenancies&asOf=2025-06-30';
  assertEqual(
    await currentUrl(sessionId),
    setupTenancyUrl,
    'Setup Unit Tenancies URL',
  );

  await typeXpath(
    sessionId,
    "//form[@data-tenancy-form='create']//input[@name='code']",
    'TEN-SETUP-BRW',
  );
  await clickXpath(
    sessionId,
    "//form[@data-tenancy-form='create']//button[normalize-space()='Create Tenancy']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//article[contains(@class,'tenancy-card')][.//span[normalize-space()='TEN-SETUP-BRW']][.//span[contains(@class,'status-chip') and normalize-space()='draft']]",
  );

  await selectOptionXpath(
    sessionId,
    "//article[.//span[normalize-space()='TEN-SETUP-BRW']]//form[@data-tenancy-form='party']//select[@name='partyId']",
    tenantPartyId,
  );
  await clickXpath(
    sessionId,
    "//article[.//span[normalize-space()='TEN-SETUP-BRW']]//form[@data-tenancy-form='party']//input[@name='isPrimary']",
  );
  await clickXpath(
    sessionId,
    "//article[.//span[normalize-space()='TEN-SETUP-BRW']]//form[@data-tenancy-form='party']//button[normalize-space()='Attach Party']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//article[.//span[normalize-space()='TEN-SETUP-BRW']]//*[normalize-space()='Browser Tenant']",
  );

  await setInputValueXpath(
    sessionId,
    "//article[.//span[normalize-space()='TEN-SETUP-BRW']]//form[@data-tenancy-form='plan']//input[@name='plannedStart']",
    '2026-10-01',
  );
  await setInputValueXpath(
    sessionId,
    "//article[.//span[normalize-space()='TEN-SETUP-BRW']]//form[@data-tenancy-form='plan']//input[@name='plannedEnd']",
    '2027-09-30',
  );
  await clickXpath(
    sessionId,
    "//article[.//span[normalize-space()='TEN-SETUP-BRW']]//form[@data-tenancy-form='plan']//button[normalize-space()='Plan Tenancy']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//article[.//span[normalize-space()='TEN-SETUP-BRW']]//span[contains(@class,'status-chip') and normalize-space()='planned']",
  );

  await setInputValueXpath(
    sessionId,
    "//article[.//span[normalize-space()='TEN-SETUP-BRW']]//form[@data-tenancy-form='activate']//input[@name='actualStart']",
    '2026-10-01',
  );
  await executeScript(
    sessionId,
    'window.__portfolioHoldTenancyMutation = true; return true;',
  );
  await clickXpath(
    sessionId,
    "//article[.//span[normalize-space()='TEN-SETUP-BRW']]//form[@data-tenancy-form='activate']//button[normalize-space()='Activate Tenancy']",
  );
  await waitForScriptTruthy(
    sessionId,
    'return window.__portfolioPendingTenancyMutation === true;',
    'held Tenancy activation',
  );

  const existingUnitTenanciesPath =
    '/properties/' + propertyId +
    '/units/' + unitId +
    '?tab=tenancies&asOf=2025-06-30';
  await navigateWithPopState(sessionId, existingUnitTenanciesPath);
  await waitForElement(
    sessionId,
    'xpath',
    "//article[contains(@class,'tenancy-card')][.//span[normalize-space()='TEN-BRW']]",
  );
  assertEqual(
    await executeScript(
      sessionId,
      'return window.__portfolioReleaseTenancyMutation();',
    ),
    true,
    'Release held Tenancy activation',
  );
  await new Promise((resolve) => setTimeout(resolve, 150));
  assertEqual(
    await currentUrl(sessionId),
    baseUrl + existingUnitTenanciesPath,
    'Late Tenancy completion keeps new Unit owner',
  );
  assertEqual(
    await elementExistsXpath(
      sessionId,
      "//article[contains(@class,'tenancy-card')][.//span[normalize-space()='TEN-SETUP-BRW']]",
    ),
    false,
    'Late Tenancy completion cannot mutate the new Unit workspace',
  );

  await navigateWithPopState(
    sessionId,
    '/properties/' + setupPropertyId +
      '/units/' + setupUnitId +
      '?tab=tenancies&asOf=2025-06-30',
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//article[.//span[normalize-space()='TEN-SETUP-BRW']]//span[contains(@class,'status-chip') and normalize-space()='active']",
  );

  await clickXpath(sessionId, "//a[normalize-space()='Contracts']");
  await waitForElement(
    sessionId,
    'xpath',
    "//h2[normalize-space()='Select the lifecycle record']",
  );
  await clickXpath(
    sessionId,
    "//a[contains(@class,'selection-card')][.//strong[normalize-space()='TEN-SETUP-BRW']]",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//form[@data-contract-form='agreement-create']",
  );

  const agreementCreateForm =
    "//form[@data-contract-form='agreement-create']";
  await typeXpath(
    sessionId,
    agreementCreateForm + "//input[@name='code']",
    'AGR-CANCEL-BRW',
  );
  await setInputValueXpath(
    sessionId,
    agreementCreateForm + "//input[@name='effectiveFrom']",
    '2026-10-01',
  );
  await selectOptionXpath(
    sessionId,
    agreementCreateForm + "//select[@name='landlordPartyId']",
    landlordPartyId,
  );
  await clickXpath(
    sessionId,
    agreementCreateForm + "//button[normalize-space()='Create Agreement draft']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//a[contains(@class,'agreement-card')][.//span[normalize-space()='AGR-CANCEL-BRW']][.//span[contains(@class,'status-chip') and normalize-space()='draft']]",
  );
  await clickXpath(
    sessionId,
    "//section[contains(@class,'contract-admin-panel')]//button[normalize-space()='Cancel Agreement']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//a[contains(@class,'agreement-card')][.//span[normalize-space()='AGR-CANCEL-BRW']][.//span[contains(@class,'status-chip') and normalize-space()='cancelled']]",
  );

  await typeXpath(
    sessionId,
    agreementCreateForm + "//input[@name='code']",
    'AGR-SETUP-BRW',
  );
  await setInputValueXpath(
    sessionId,
    agreementCreateForm + "//input[@name='effectiveFrom']",
    '2026-10-01',
  );
  await selectOptionXpath(
    sessionId,
    agreementCreateForm + "//select[@name='landlordPartyId']",
    landlordPartyId,
  );
  await clickXpath(
    sessionId,
    agreementCreateForm + "//button[normalize-space()='Create Agreement draft']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//a[contains(@class,'agreement-card')][.//span[normalize-space()='AGR-SETUP-BRW']][.//span[contains(@class,'status-chip') and normalize-space()='draft']]",
  );

  const agreementSignForm =
    "//form[@data-contract-form='agreement-sign']";
  await setInputValueXpath(
    sessionId,
    agreementSignForm + "//input[@name='signedAt']",
    '2026-09-20',
  );
  await typeXpath(
    sessionId,
    agreementSignForm + "//input[@name='baseRent']",
    '1000.00',
  );
  await typeXpath(
    sessionId,
    agreementSignForm + "//input[@name='serviceCharge']",
    '150.00',
  );
  await executeScript(
    sessionId,
    'window.__portfolioHoldContractMutation = true; return true;',
  );
  await clickXpath(
    sessionId,
    agreementSignForm + "//button[normalize-space()='Sign Agreement']",
  );
  await waitForScriptTruthy(
    sessionId,
    'return window.__portfolioPendingContractMutation === true;',
    'held Agreement sign',
  );

  const existingContractPath =
    '/properties/' + propertyId +
    '/units/' + unitId +
    '?tab=contracts&tenancyId=' + tenancyId +
    '&agreementId=' + agreementId +
    '&asOf=2025-06-30';
  await navigateWithPopState(sessionId, existingContractPath);
  await waitForElement(
    sessionId,
    'xpath',
    "//a[contains(@class,'agreement-card')][.//span[normalize-space()='AGR-BRW']]",
  );
  assertEqual(
    await executeScript(
      sessionId,
      'return window.__portfolioReleaseContractMutation();',
    ),
    true,
    'Release held Agreement sign',
  );
  await new Promise((resolve) => setTimeout(resolve, 150));
  assertEqual(
    await currentUrl(sessionId),
    baseUrl + existingContractPath,
    'Late Agreement completion keeps new Unit owner',
  );
  assertEqual(
    await elementExistsXpath(
      sessionId,
      "//a[contains(@class,'agreement-card')][.//span[normalize-space()='AGR-SETUP-BRW']]",
    ),
    false,
    'Late Agreement completion cannot mutate the new Unit Contract workspace',
  );

  await navigateWithPopState(
    sessionId,
    '/properties/' + setupPropertyId +
      '/units/' + setupUnitId +
      '?tab=contracts&tenancyId=' + setupTenancyId +
      '&agreementId=' + setupSignedAgreementId +
      '&asOf=2025-06-30',
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//a[contains(@class,'agreement-card')][.//span[normalize-space()='AGR-SETUP-BRW']][.//span[contains(@class,'status-chip') and normalize-space()='signed']]",
  );

  await navigateWithPopState(
    sessionId,
    '/properties/' + setupPropertyId +
      '/units/' + setupUnitId +
      '?tab=contracts&tenancyId=' + setupTenancyId +
      '&agreementId=' + setupSignedAgreementId +
      '&asOf=2026-10-01',
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//section[contains(@class,'contract-terms-panel')]//h3[contains(normalize-space(),'terms from 2026-10-01')]",
  );

  const amendmentCreateForm =
    "//form[@data-contract-form='amendment-create']";
  await typeXpath(
    sessionId,
    amendmentCreateForm + "//input[@name='code']",
    'AMD-CANCEL-BRW',
  );
  await typeXpath(
    sessionId,
    amendmentCreateForm + "//input[@name='title']",
    'Cancelled adjustment',
  );
  await setInputValueXpath(
    sessionId,
    amendmentCreateForm + "//input[@name='effectiveFrom']",
    '2027-01-01',
  );
  await clickXpath(
    sessionId,
    amendmentCreateForm + "//button[normalize-space()='Create Amendment draft']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//a[contains(@class,'amendment-card')][.//strong[normalize-space()='AMD-CANCEL-BRW']]",
  );
  await clickXpath(
    sessionId,
    "//section[contains(@class,'contract-admin-panel')]//button[normalize-space()='Cancel Amendment']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//a[contains(@class,'amendment-card')][.//strong[normalize-space()='AMD-CANCEL-BRW']][.//dd[normalize-space()='Cancelled']]",
  );

  await typeXpath(
    sessionId,
    amendmentCreateForm + "//input[@name='code']",
    'AMD-SETUP-BRW',
  );
  await typeXpath(
    sessionId,
    amendmentCreateForm + "//input[@name='title']",
    'Rent adjustment',
  );
  await setInputValueXpath(
    sessionId,
    amendmentCreateForm + "//input[@name='effectiveFrom']",
    '2027-01-01',
  );
  await clickXpath(
    sessionId,
    amendmentCreateForm + "//button[normalize-space()='Create Amendment draft']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//a[contains(@class,'amendment-card')][.//strong[normalize-space()='AMD-SETUP-BRW']]",
  );

  const amendmentSignForm =
    "//form[@data-contract-form='amendment-sign']";
  await setInputValueXpath(
    sessionId,
    amendmentSignForm + "//input[@name='signedAt']",
    '2026-12-15',
  );
  await typeXpath(
    sessionId,
    amendmentSignForm + "//input[@name='baseRent']",
    '1100.00',
  );
  await typeXpath(
    sessionId,
    amendmentSignForm + "//input[@name='serviceCharge']",
    '150.00',
  );
  await clickXpath(
    sessionId,
    amendmentSignForm + "//button[normalize-space()='Sign Amendment']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//a[contains(@class,'amendment-card')][.//strong[normalize-space()='AMD-SETUP-BRW']][.//dd[normalize-space()='Signed']]",
  );

  const amendmentDocumentsSection =
    "//section[.//p[normalize-space()='Step 5 · Amendment Documents']]";
  const amendmentDocumentCreateForm =
    amendmentDocumentsSection +
    "//form[@data-signed-document-form='create']";
  const amendmentDocumentUploadForm =
    amendmentDocumentsSection +
    "//form[@data-signed-document-form='upload']";

  await waitForElement(
    sessionId,
    'xpath',
    amendmentDocumentCreateForm,
  );
  await typeXpath(
    sessionId,
    amendmentDocumentCreateForm + "//input[@name='code']",
    'DOC-AMD-SETUP-BRW',
  );
  await typeXpath(
    sessionId,
    amendmentDocumentCreateForm + "//input[@name='title']",
    'Signed amendment browser original',
  );
  await clickXpath(
    sessionId,
    amendmentDocumentCreateForm +
      "//button[normalize-space()='Create Document']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    amendmentDocumentsSection +
      "//select[@aria-label='Signed original Document']" +
      "/option[@value='" + setupAmendmentDocumentId + "']",
  );
  await selectOptionXpath(
    sessionId,
    amendmentDocumentsSection +
      "//select[@aria-label='Signed original Document']",
    setupAmendmentDocumentId,
  );
  await setFileXpath(
    sessionId,
    amendmentDocumentUploadForm + "//input[@name='file']",
    amendmentSignedFilePath,
  );
  await clickXpath(
    sessionId,
    amendmentDocumentUploadForm +
      "//button[normalize-space()='Upload version']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    amendmentDocumentsSection +
      "//select[@aria-label='Signed original Document version']" +
      "/option[@value='" + setupAmendmentDocumentVersionId + "']",
  );
  await selectOptionXpath(
    sessionId,
    amendmentDocumentsSection +
      "//select[@aria-label='Signed original Document version']",
    setupAmendmentDocumentVersionId,
  );
  await clickXpath(
    sessionId,
    amendmentDocumentsSection +
      "//button[normalize-space()='Finalize version']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    amendmentDocumentsSection +
      "//select[@aria-label='Signed original Document version']" +
      "/option[@value='" + setupAmendmentDocumentVersionId +
      "' and contains(normalize-space(),'final')]",
  );
  await clickXpath(
    sessionId,
    amendmentDocumentsSection +
      "//button[normalize-space()='Link signed original to AMD-SETUP-BRW']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    amendmentDocumentsSection +
      "//*[normalize-space()='portfolio-amendment-signed-original.pdf']",
  );
  assertEqual(
    await executeScript(
      sessionId,
      'return window.__portfolioDocumentUploadCount || 0;',
    ),
    1,
    'Amendment signed-original upload count',
  );
  assertEqual(
    await elementExistsXpath(
      sessionId,
      amendmentDocumentsSection +
        "//form[@data-signed-document-form='create']",
    ),
    false,
    'Amendment signed-original workflow closes after canonical link reread',
  );

  await navigateWithPopState(
    sessionId,
    '/properties/' + setupPropertyId +
      '/units/' + setupUnitId +
      '?tab=contracts&tenancyId=' + setupTenancyId +
      '&agreementId=' + setupSignedAgreementId +
      '&asOf=2027-01-01',
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//section[contains(@class,'contract-terms-panel')]//h3[contains(normalize-space(),'terms from 2027-01-01')]",
  );

  await selectOptionXpath(
    sessionId,
    agreementCreateForm + "//select[@name='agreementType']",
    'replacement',
  );
  await typeXpath(
    sessionId,
    agreementCreateForm + "//input[@name='code']",
    'AGR-REPLACEMENT-BRW',
  );
  await selectOptionXpath(
    sessionId,
    agreementCreateForm + "//select[@name='predecessorAgreementId']",
    setupSignedAgreementId,
  );
  await setInputValueXpath(
    sessionId,
    agreementCreateForm + "//input[@name='effectiveFrom']",
    '2027-07-01',
  );
  await selectOptionXpath(
    sessionId,
    agreementCreateForm + "//select[@name='landlordPartyId']",
    landlordPartyId,
  );
  await clickXpath(
    sessionId,
    agreementCreateForm + "//button[normalize-space()='Create Agreement draft']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//a[contains(@class,'agreement-card')][.//span[normalize-space()='AGR-REPLACEMENT-BRW']][.//span[contains(@class,'status-chip') and normalize-space()='draft']]",
  );
  assertEqual(
    await currentUrl(sessionId),
    baseUrl +
      '/properties/' + setupPropertyId +
      '/units/' + setupUnitId +
      '?tab=contracts&tenancyId=' + setupTenancyId +
      '&agreementId=' + setupReplacementAgreementId +
      '&asOf=2027-01-01',
    'Replacement Agreement deep-link',
  );

  await setInputValueXpath(
    sessionId,
    agreementSignForm + "//input[@name='signedAt']",
    '2027-06-15',
  );
  await typeXpath(
    sessionId,
    agreementSignForm + "//input[@name='baseRent']",
    '1200.00',
  );
  await typeXpath(
    sessionId,
    agreementSignForm + "//input[@name='serviceCharge']",
    '160.00',
  );
  await executeScript(
    sessionId,
    'window.__portfolioHoldContractMutation = true; return true;',
  );
  await clickXpath(
    sessionId,
    agreementSignForm + "//button[normalize-space()='Sign Agreement']",
  );
  await waitForScriptTruthy(
    sessionId,
    'return window.__portfolioPendingContractMutation === true;',
    'held replacement Agreement sign',
  );

  await setReactInputValueXpath(
    sessionId,
    "//input[@aria-label='Contract effective terms business date']",
    '2027-02-01',
  );
  await new Promise((resolve) => setTimeout(resolve, 150));

  assertEqual(
    await currentUrl(sessionId),
    baseUrl +
      '/properties/' + setupPropertyId +
      '/units/' + setupUnitId +
      '?tab=contracts&tenancyId=' + setupTenancyId +
      '&agreementId=' + setupReplacementAgreementId +
      '&asOf=2027-02-01',
    'asOf change keeps replacement Agreement owner',
  );
  assertEqual(
    await elementDisabledXpath(
      sessionId,
      agreementSignForm + "//button[normalize-space()='Sign Agreement']",
    ),
    true,
    'Held replacement sign remains serialized across asOf change',
  );
  assertEqual(
    await elementDisabledXpath(
      sessionId,
      "//section[contains(@class,'contract-admin-panel')]//button[normalize-space()='Cancel Agreement']",
    ),
    true,
    'Held replacement cancel remains serialized across asOf change',
  );

  assertEqual(
    await executeScript(
      sessionId,
      'return window.__portfolioReleaseContractMutation();',
    ),
    true,
    'Release held replacement Agreement sign',
  );

  await waitForElement(
    sessionId,
    'xpath',
    "//a[contains(@class,'agreement-card')][.//span[normalize-space()='AGR-REPLACEMENT-BRW']][.//span[contains(@class,'status-chip') and normalize-space()='signed']]",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//a[contains(@class,'agreement-card')][.//span[normalize-space()='AGR-SETUP-BRW']][.//span[contains(@class,'status-chip') and normalize-space()='superseded']]",
  );
  assertEqual(
    await elementExistsXpath(
      sessionId,
      "//form[@data-contract-form='agreement-sign']",
    ),
    false,
    'No stale draft Agreement sign form survives successful replacement sign',
  );

  const agreementDocumentsSection =
    "//section[.//p[normalize-space()='Step 3 · Agreement Documents']]";
  const agreementDocumentCreateForm =
    agreementDocumentsSection +
    "//form[@data-signed-document-form='create']";
  const agreementDocumentUploadForm =
    agreementDocumentsSection +
    "//form[@data-signed-document-form='upload']";

  await waitForElement(
    sessionId,
    'xpath',
    agreementDocumentCreateForm,
  );
  await typeXpath(
    sessionId,
    agreementDocumentCreateForm + "//input[@name='code']",
    'DOC-AGR-RECOVER-BRW',
  );
  await typeXpath(
    sessionId,
    agreementDocumentCreateForm + "//input[@name='title']",
    'Replacement signed lease recovery',
  );
  await clickXpath(
    sessionId,
    agreementDocumentCreateForm +
      "//button[normalize-space()='Create Document']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    agreementDocumentsSection +
      "//select[@aria-label='Signed original Document']" +
      "/option[@value='" + setupAgreementDocumentId + "']",
  );
  await selectOptionXpath(
    sessionId,
    agreementDocumentsSection +
      "//select[@aria-label='Signed original Document']",
    setupAgreementDocumentId,
  );
  await setFileXpath(
    sessionId,
    agreementDocumentUploadForm + "//input[@name='file']",
    agreementSignedFilePath,
  );
  await clickXpath(
    sessionId,
    agreementDocumentUploadForm +
      "//button[normalize-space()='Upload version']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    agreementDocumentsSection +
      "//select[@aria-label='Signed original Document version']" +
      "/option[@value='" + setupAgreementDocumentVersionId + "']",
  );
  await selectOptionXpath(
    sessionId,
    agreementDocumentsSection +
      "//select[@aria-label='Signed original Document version']",
    setupAgreementDocumentVersionId,
  );
  await clickXpath(
    sessionId,
    agreementDocumentsSection +
      "//button[normalize-space()='Finalize version']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    agreementDocumentsSection +
      "//select[@aria-label='Signed original Document version']" +
      "/option[@value='" + setupAgreementDocumentVersionId +
      "' and contains(normalize-space(),'final')]",
  );

  await executeScript(
    sessionId,
    'window.__portfolioFailNextSignedOriginalLink = true; return true;',
  );
  await clickXpath(
    sessionId,
    agreementDocumentsSection +
      "//button[normalize-space()='Link signed original to AGR-REPLACEMENT-BRW']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    agreementDocumentsSection +
      "//*[normalize-space()='Intentional browser-harness link failure.']",
  );
  assertEqual(
    await executeScript(
      sessionId,
      'return window.__portfolioDocumentUploadCount || 0;',
    ),
    2,
    'Agreement failed-link upload count before recovery',
  );

  const setupTenanciesRecoveryPath =
    '/properties/' + setupPropertyId +
    '/units/' + setupUnitId +
    '?tab=tenancies&asOf=2027-02-01';
  await navigateWithPopState(sessionId, setupTenanciesRecoveryPath);
  await waitForElement(
    sessionId,
    'xpath',
    "//article[.//span[normalize-space()='TEN-SETUP-BRW']]//span[contains(@class,'status-chip') and normalize-space()='active']",
  );

  const replacementContractRecoveryPath =
    '/properties/' + setupPropertyId +
    '/units/' + setupUnitId +
    '?tab=contracts&tenancyId=' + setupTenancyId +
    '&agreementId=' + setupReplacementAgreementId +
    '&asOf=2027-02-01';
  await navigateWithPopState(sessionId, replacementContractRecoveryPath);
  await waitForElement(
    sessionId,
    'xpath',
    agreementDocumentCreateForm,
  );
  await waitForElement(
    sessionId,
    'xpath',
    agreementDocumentsSection +
      "//select[@aria-label='Signed original Document']" +
      "/option[@value='" + setupAgreementDocumentId + "']",
  );
  await selectOptionXpath(
    sessionId,
    agreementDocumentsSection +
      "//select[@aria-label='Signed original Document']",
    setupAgreementDocumentId,
  );
  await waitForElement(
    sessionId,
    'xpath',
    agreementDocumentsSection +
      "//select[@aria-label='Signed original Document version']" +
      "/option[@value='" + setupAgreementDocumentVersionId +
      "' and contains(normalize-space(),'final')]",
  );
  await selectOptionXpath(
    sessionId,
    agreementDocumentsSection +
      "//select[@aria-label='Signed original Document version']",
    setupAgreementDocumentVersionId,
  );
  assertEqual(
    await executeScript(
      sessionId,
      'return window.__portfolioDocumentUploadCount || 0;',
    ),
    2,
    'Recovery remount does not re-upload finalized Agreement binary',
  );
  await clickXpath(
    sessionId,
    agreementDocumentsSection +
      "//button[normalize-space()='Link signed original to AGR-REPLACEMENT-BRW']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    agreementDocumentsSection +
      "//*[normalize-space()='portfolio-agreement-signed-original.pdf']",
  );
  assertEqual(
    await executeScript(
      sessionId,
      'return window.__portfolioDocumentUploadCount || 0;',
    ),
    2,
    'Successful recovery link reuses existing final DocumentVersion',
  );
  assertEqual(
    await elementExistsXpath(
      sessionId,
      agreementDocumentsSection +
        "//form[@data-signed-document-form='create']",
    ),
    false,
    'Agreement signed-original workflow closes after recovery link',
  );


  await navigateWithPopState(
    sessionId,
    '/properties/' + setupPropertyId +
      '/units/' + setupUnitId +
      '?tab=tenancies&asOf=2025-06-30',
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//article[.//span[normalize-space()='TEN-SETUP-BRW']]//span[contains(@class,'status-chip') and normalize-space()='active']",
  );

  await setInputValueXpath(
    sessionId,
    "//article[.//span[normalize-space()='TEN-SETUP-BRW']]//form[@data-tenancy-form='notice']//input[@name='noticeGivenAt']",
    '2027-06-01',
  );
  await setInputValueXpath(
    sessionId,
    "//article[.//span[normalize-space()='TEN-SETUP-BRW']]//form[@data-tenancy-form='notice']//input[@name='terminationEffectiveAt']",
    '2027-09-30',
  );
  await clickXpath(
    sessionId,
    "//article[.//span[normalize-space()='TEN-SETUP-BRW']]//form[@data-tenancy-form='notice']//button[normalize-space()='Give Notice']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//article[.//span[normalize-space()='TEN-SETUP-BRW']]//span[contains(@class,'status-chip') and normalize-space()='notice_given']",
  );

  await clickXpath(
    sessionId,
    "//article[.//span[normalize-space()='TEN-SETUP-BRW']]//button[normalize-space()='Mark Move-out Pending']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//article[.//span[normalize-space()='TEN-SETUP-BRW']]//span[contains(@class,'status-chip') and normalize-space()='move_out_pending']",
  );

  await setInputValueXpath(
    sessionId,
    "//article[.//span[normalize-space()='TEN-SETUP-BRW']]//form[@data-tenancy-form='end']//input[@name='actualEnd']",
    '2027-09-30',
  );
  await clickXpath(
    sessionId,
    "//article[.//span[normalize-space()='TEN-SETUP-BRW']]//form[@data-tenancy-form='end']//button[normalize-space()='End Tenancy']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//article[.//span[normalize-space()='TEN-SETUP-BRW']]//span[contains(@class,'status-chip') and normalize-space()='ended']",
  );
  assertEqual(
    await currentUrl(sessionId),
    setupTenancyUrl,
    'Tenancy lifecycle stays on setup Unit owner',
  );

  await typeXpath(
    sessionId,
    "//form[@data-tenancy-form='create']//input[@name='code']",
    'TEN-CANCEL-BRW',
  );
  await clickXpath(
    sessionId,
    "//form[@data-tenancy-form='create']//button[normalize-space()='Create Tenancy']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//article[contains(@class,'tenancy-card')][.//span[normalize-space()='TEN-CANCEL-BRW']][.//span[contains(@class,'status-chip') and normalize-space()='draft']]",
  );
  await clickXpath(
    sessionId,
    "//article[.//span[normalize-space()='TEN-CANCEL-BRW']]//button[normalize-space()='Cancel Tenancy']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//article[.//span[normalize-space()='TEN-CANCEL-BRW']]//span[contains(@class,'status-chip') and normalize-space()='cancelled']",
  );

  await clickXpath(sessionId, "//a[normalize-space()='Assets']");
  await waitForElement(
    sessionId,
    'xpath',
    "//form[@data-asset-form='create']",
  );

  const assetCreateForm = "//form[@data-asset-form='create']";
  await typeXpath(
    sessionId,
    assetCreateForm + "//input[@name='code']",
    'AST-SETUP-BRW',
  );
  await typeXpath(
    sessionId,
    assetCreateForm + "//input[@name='name']",
    'Setup Washer',
  );
  await typeXpath(
    sessionId,
    assetCreateForm + "//input[@name='manufacturer']",
    'Bosch',
  );
  await typeXpath(
    sessionId,
    assetCreateForm + "//input[@name='model']",
    'W1',
  );
  await typeXpath(
    sessionId,
    assetCreateForm +
      "//div[contains(@class,'asset-identifier-row')]//input[@placeholder='Serial / inventory tag']",
    'SN-SETUP-001',
  );
  await clickXpath(
    sessionId,
    assetCreateForm + "//button[normalize-space()='Create Asset']",
  );

  await waitForElement(
    sessionId,
    'xpath',
    "//a[contains(@class,'asset-card')][.//span[normalize-space()='AST-SETUP-BRW']][.//h3[normalize-space()='Setup Washer']]",
  );
  const createdAssetUrl =
    baseUrl +
    '/properties/' + setupPropertyId +
    '/units/' + setupUnitId +
    '?tab=assets&assetId=' + setupAssetId +
    '&asOf=2025-06-30';
  assertEqual(
    await currentUrl(sessionId),
    createdAssetUrl,
    'Created Asset deep-link',
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//section[contains(@class,'asset-admin-panel')]//h2[normalize-space()='AST-SETUP-BRW · Setup Washer']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//article[contains(@class,'asset-history-card')][.//strong[normalize-space()='Asset created']][.//span[contains(normalize-space(),'current')]]",
  );

  const assetMetadataForm = "//form[@data-asset-form='metadata']";
  await typeXpath(
    sessionId,
    assetMetadataForm + "//input[@name='name']",
    'Setup Washer 8 kg',
  );
  await typeXpath(
    sessionId,
    assetMetadataForm + "//input[@name='model']",
    'W2',
  );
  await executeScript(
    sessionId,
    'window.__portfolioHoldAssetMutation = true; return true;',
  );
  await clickXpath(
    sessionId,
    assetMetadataForm + "//button[normalize-space()='Save metadata']",
  );
  await waitForScriptTruthy(
    sessionId,
    'return window.__portfolioPendingAssetMutation === true;',
    'held Asset metadata mutation',
  );
  await clickXpath(sessionId, "//a[normalize-space()='Spaces']");
  await new Promise((resolve) => setTimeout(resolve, 150));
  assertEqual(
    await currentUrl(sessionId),
    createdAssetUrl,
    'Pending Asset write blocks tab navigation',
  );
  assertEqual(
    await executeScript(
      sessionId,
      'return window.__portfolioReleaseAssetMutation();',
    ),
    true,
    'Release held Asset metadata mutation',
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//section[contains(@class,'asset-admin-panel')]//h2[normalize-space()='AST-SETUP-BRW · Setup Washer 8 kg']",
  );

  await clickXpath(
    sessionId,
    "//section[contains(@class,'asset-admin-panel')]//button[normalize-space()='Mark inactive']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//section[contains(@class,'asset-admin-panel')]//span[contains(@class,'status-chip') and normalize-space()='inactive']",
  );
  await clickXpath(
    sessionId,
    "//section[contains(@class,'asset-admin-panel')]//button[normalize-space()='Reactivate']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//section[contains(@class,'asset-admin-panel')]//span[contains(@class,'status-chip') and normalize-space()='active']",
  );

  const assetMoveForm = "//form[@data-asset-form='move']";
  await waitForElement(
    sessionId,
    'xpath',
    assetMoveForm +
      "//select[@name='spaceId']/option[@value='" + setupSpaceId + "']",
  );
  await selectOptionXpath(
    sessionId,
    assetMoveForm + "//select[@name='spaceId']",
    setupSpaceId,
  );
  await typeXpath(
    sessionId,
    assetMoveForm + "//input[@name='reason']",
    'Moved into bedroom',
  );
  await clickXpath(
    sessionId,
    assetMoveForm + "//button[normalize-space()='Move Asset']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//a[contains(@class,'asset-card')][.//span[normalize-space()='AST-SETUP-BRW']][.//dd[normalize-space()='Setup Bedroom']]",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//article[contains(@class,'asset-history-card')][.//strong[normalize-space()='Asset created']][.//span[contains(normalize-space(),'2027-10-01T09:00:00.000Z')]]",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//article[contains(@class,'asset-history-card')][.//strong[normalize-space()='Moved']][.//span[contains(normalize-space(),'current')]][.//dd[normalize-space()='Moved into bedroom']]",
  );

  await selectOptionXpath(
    sessionId,
    assetMoveForm + "//select[@name='unitId']",
    setupDestinationUnitId,
  );
  await waitForElement(
    sessionId,
    'xpath',
    assetMoveForm +
      "//select[@name='spaceId']/option[@value='" +
      setupDestinationSpaceId +
      "']",
  );
  await selectOptionXpath(
    sessionId,
    assetMoveForm + "//select[@name='spaceId']",
    setupDestinationSpaceId,
  );
  await clearXpath(
    sessionId,
    assetMoveForm + "//input[@name='reason']",
  );
  await typeXpath(
    sessionId,
    assetMoveForm + "//input[@name='reason']",
    'Moved to destination Unit',
  );
  await executeScript(
    sessionId,
    'window.__portfolioFailNextAssetMoveAfterCommit = true; return true;',
  );
  await clickXpath(
    sessionId,
    assetMoveForm + "//button[normalize-space()='Move Asset']",
  );

  await waitForElement(
    sessionId,
    'xpath',
    "//h1[normalize-space()='Unit 2B']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//a[contains(@class,'asset-card')][.//span[normalize-space()='AST-SETUP-BRW']][.//dd[normalize-space()='Destination Living Room']]",
  );
  const destinationAssetUrl =
    baseUrl +
    '/properties/' + setupPropertyId +
    '/units/' + setupDestinationUnitId +
    '?tab=assets&assetId=' + setupAssetId +
    '&asOf=2025-06-30';
  assertEqual(
    await currentUrl(sessionId),
    destinationAssetUrl,
    'Lost move acknowledgement reconciles to canonical destination Unit owner',
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//article[contains(@class,'asset-history-card')][.//strong[normalize-space()='Moved']][.//span[contains(normalize-space(),'2027-10-01T09:00:00.000Z') and contains(normalize-space(),'2027-10-01T10:00:00.000Z')]][.//dd[normalize-space()='Moved into bedroom']]",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//article[contains(@class,'asset-history-card')][.//strong[normalize-space()='Moved']][.//span[contains(normalize-space(),'current')]][.//dd[normalize-space()='Moved to destination Unit']]",
  );

  const assetReplacementForm = "//form[@data-asset-form='replace']";
  await typeXpath(
    sessionId,
    assetReplacementForm + "//input[@name='code']",
    'AST-REPLACEMENT-BRW',
  );
  await typeXpath(
    sessionId,
    assetReplacementForm + "//input[@name='name']",
    'Setup Washer Replacement',
  );
  await typeXpath(
    sessionId,
    assetReplacementForm + "//input[@name='manufacturer']",
    'Siemens',
  );
  await typeXpath(
    sessionId,
    assetReplacementForm + "//input[@name='model']",
    'S1',
  );
  await typeXpath(
    sessionId,
    assetReplacementForm +
      "//div[contains(@class,'asset-identifier-row')]//input[@placeholder='Serial / inventory tag']",
    'SN-SETUP-002',
  );
  await executeScript(
    sessionId,
    'window.__portfolioFailNextAssetReplacementAfterCommit = true; return true;',
  );
  await clickXpath(
    sessionId,
    assetReplacementForm +
      "//button[normalize-space()='Create replacement Asset']",
  );

  await waitForElement(
    sessionId,
    'xpath',
    "//a[contains(@class,'asset-card')][.//span[normalize-space()='AST-REPLACEMENT-BRW']][.//h3[normalize-space()='Setup Washer Replacement']][.//dd[normalize-space()='Destination Living Room']]",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//section[contains(@class,'asset-admin-panel')]//h2[normalize-space()='AST-REPLACEMENT-BRW · Setup Washer Replacement']",
  );
  assertEqual(
    await currentUrl(sessionId),
    baseUrl +
      '/properties/' + setupPropertyId +
      '/units/' + setupDestinationUnitId +
      '?tab=assets&assetId=' + setupReplacementAssetId +
      '&asOf=2025-06-30',
    'Replacement successor deep-link',
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//article[contains(@class,'asset-history-card')][.//strong[normalize-space()='Replacement created']][.//span[contains(normalize-space(),'current')]]",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//section[contains(@class,'asset-admin-panel')]//dl[contains(@class,'detail-list')]//dd[normalize-space()='" + setupAssetId + "']",
  );
  assertEqual(
    await elementExistsXpath(
      sessionId,
      "//a[contains(@class,'asset-card')][.//span[normalize-space()='AST-SETUP-BRW']]",
    ),
    false,
    'Replaced predecessor leaves the current Unit registry',
  );

  await navigateWithPopState(
    sessionId,
    '/properties/' + setupPropertyId +
      '/units/' + setupUnitId +
      '?tab=assets&asOf=2025-06-30',
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//form[@data-asset-form='create']",
  );

  await clickXpath(sessionId, "//a[normalize-space()='Spaces']");
  await waitForElement(
    sessionId,
    'xpath',
    "//article[contains(@class,'space-card')][.//h3[normalize-space()='Setup Bedroom']]",
  );

  await executeScript(
    sessionId,
    'window.__portfolioHoldSpaceCreate = true; return true;',
  );
  await typeXpath(
    sessionId,
    "//form[contains(@class,'setup-form')]//input[@name='code']",
    'BED-LATE',
  );
  await typeXpath(
    sessionId,
    "//form[contains(@class,'setup-form')]//input[@name='name']",
    'Late Setup Bedroom',
  );
  await clickXpath(
    sessionId,
    "//form[contains(@class,'setup-form')]//button[normalize-space()='Create Space']",
  );
  await waitForScriptTruthy(
    sessionId,
    'return window.__portfolioPendingSpaceCreate === true;',
    'held Space create',
  );

  const existingUnitSpacesPath =
    '/properties/' + propertyId +
    '/units/' + unitId +
    '?tab=spaces&asOf=2025-06-30';
  await navigateWithPopState(sessionId, existingUnitSpacesPath);
  await waitForElement(
    sessionId,
    'xpath',
    "//h1[normalize-space()='Unit 1A']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[normalize-space()='No Spaces defined for this Unit.']",
  );
  assertEqual(
    await executeScript(
      sessionId,
      'return window.__portfolioReleaseSpaceCreate();',
    ),
    true,
    'Release held Space create',
  );
  await new Promise((resolve) => setTimeout(resolve, 150));
  assertEqual(
    await currentUrl(sessionId),
    baseUrl + existingUnitSpacesPath,
    'Late Space completion keeps new Unit owner',
  );
  assertEqual(
    await elementExistsXpath(
      sessionId,
      "//article[contains(@class,'space-card')][.//h3[normalize-space()='Late Setup Bedroom']]",
    ),
    false,
    'Late Space completion cannot mutate the new Unit workspace',
  );

  const setupPropertyPath =
    '/properties/' + setupPropertyId + '?asOf=2025-06-30';
  await navigateWithPopState(sessionId, setupPropertyPath);
  await waitForElement(
    sessionId,
    'xpath',
    "//h1[normalize-space()='Setup Browser Property']",
  );

  await executeScript(
    sessionId,
    'window.__portfolioHoldUnitCreate = true; return true;',
  );
  await typeXpath(
    sessionId,
    "//form[contains(@class,'setup-form')]//input[@name='code']",
    'UNIT-LATE',
  );
  await typeXpath(
    sessionId,
    "//form[contains(@class,'setup-form')]//input[@name='unitNumber']",
    '9Z',
  );
  await clickXpath(
    sessionId,
    "//form[contains(@class,'setup-form')]//button[normalize-space()='Create Unit']",
  );
  await waitForScriptTruthy(
    sessionId,
    'return window.__portfolioPendingUnitCreate === true;',
    'held Unit create',
  );

  const existingPropertyPath =
    '/properties/' + propertyId + '?asOf=2025-06-30';
  await navigateWithPopState(sessionId, existingPropertyPath);
  await waitForElement(
    sessionId,
    'xpath',
    "//h1[normalize-space()='Browser Test Property']",
  );
  assertEqual(
    await executeScript(
      sessionId,
      'return window.__portfolioReleaseUnitCreate();',
    ),
    true,
    'Release held Unit create',
  );
  await new Promise((resolve) => setTimeout(resolve, 150));
  assertEqual(
    await currentUrl(sessionId),
    baseUrl + existingPropertyPath,
    'Late Unit completion keeps new Property owner',
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//h1[normalize-space()='Browser Test Property']",
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
    'Browser workflow PASS: Core setup + route-owner late-completion guards → existing Contracts/documents → Inspection workflow\n',
  );
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
  if (logs.length > 0) {
    process.stderr.write(logs.join(''));
  }
  process.exitCode = 1;
} finally {
  await Promise.all([
    rm(amendmentSignedFilePath, { force: true }),
    rm(agreementSignedFilePath, { force: true }),
  ]);
  if (sessionId) {
    try {
      await webdriver(`/session/${sessionId}`, { method: 'DELETE' });
    } catch {}
  }
  stop(driver);
  stop(vite);
}

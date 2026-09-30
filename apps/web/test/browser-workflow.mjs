import { spawn } from 'node:child_process';
import { rm, truncate, writeFile } from 'node:fs/promises';
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
const historicalServiceProviderPartyId =
  'e1000000-0000-4000-8000-000000000001';
const agreementId = '55555555-5555-4555-8555-555555555555';
const amendmentId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const inspectionId = 'a1000000-0000-4000-8000-000000000001';
const inspectionSchemaVersionId = 'a1000000-0000-4000-8000-000000000002';
const inspectionSectionId = 'a1000000-0000-4000-8000-000000000003';
const inspectionSectionInstanceId =
  'a1000000-0000-4000-8000-000000000024';
const setupOrchestrationInspectionSectionInstanceId =
  'b1000000-0000-4000-8000-000000000062';
const inspectionHallwayInstanceId =
  'a9000000-0000-4000-8000-000000000003';
const inspectionLivingRoomInstanceId =
  'a9000000-0000-4000-8000-000000000004';
const inspectionBedroomInstanceId =
  'a9000000-0000-4000-8000-000000000005';
const inspectionKitchenInstanceId =
  'a9000000-0000-4000-8000-000000000006';
const inspectionBathroomInstanceId =
  'a9000000-0000-4000-8000-000000000007';
const inspectionRoomItemId =
  'a9000000-0000-4000-8000-000000000002';
const inspectionNotesItemId = 'a1000000-0000-4000-8000-000000000005';
const inspectionUserId = 'a1000000-0000-4000-8000-000000000006';
const setupPropertyId = 'b1000000-0000-4000-8000-000000000001';
const setupUnitId = 'b1000000-0000-4000-8000-000000000002';
const setupSpaceId = 'b1000000-0000-4000-8000-000000000003';
const setupBathroomSpaceId = 'b1000000-0000-4000-8000-000000000083';
const setupHallSpaceId = 'b1000000-0000-4000-8000-000000000080';
const setupKitchenSpaceId = 'b1000000-0000-4000-8000-000000000082';
const setupDestinationUnitId = 'c1000000-0000-4000-8000-000000000001';
const setupDestinationSpaceId = 'c1000000-0000-4000-8000-000000000002';
const setupRecoveryPropertyId = 'c2000000-0000-4000-8000-000000000001';
const setupRecoveryUnitId = 'c2000000-0000-4000-8000-000000000002';
const setupRecoverySpaceId = 'c2000000-0000-4000-8000-000000000003';
const orchestrationPropertyId = 'd2000000-0000-4000-8000-000000000001';
const orchestrationUnitId = 'd2000000-0000-4000-8000-000000000002';
const setupPartyId = 'b1000000-0000-4000-8000-000000000004';
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
const setupOvenAssetId = 'b1000000-0000-4000-8000-000000000085';
const setupSmokeDetectorAssetId = 'b1000000-0000-4000-8000-000000000086';
const setupMeterId = 'b1000000-0000-4000-8000-000000000038';
const setupWaterMeterId = 'b1000000-0000-4000-8000-000000000091';
const setupAccessItemId = 'b1000000-0000-4000-8000-000000000068';
const setupEntryCardId = 'b1000000-0000-4000-8000-000000000092';
const setupHallKeyId = 'b1000000-0000-4000-8000-000000000093';
const setupMeterMoveInReadingId = 'b1000000-0000-4000-8000-000000000039';
const setupMeterMoveOutReadingId = 'b1000000-0000-4000-8000-000000000040';
const setupInspectionFindingId = 'b1000000-0000-4000-8000-000000000044';
const setupMaintenanceIssueId = 'b1000000-0000-4000-8000-000000000045';
const setupOvenMaintenanceIssueId = 'b1000000-0000-4000-8000-000000000100';
const setupSmokeMaintenanceIssueId = 'b1000000-0000-4000-8000-000000000101';
const setupMaintenanceWorkOrderId = 'b1000000-0000-4000-8000-000000000046';
const setupOvenMaintenanceWorkOrderId = 'b1000000-0000-4000-8000-000000000102';
const setupSmokeMaintenanceWorkOrderId = 'b1000000-0000-4000-8000-000000000103';
const setupServiceEventId = 'b1000000-0000-4000-8000-000000000047';
const setupWarrantyId = 'b1000000-0000-4000-8000-000000000057';
const setupWarrantyClaimId = 'b1000000-0000-4000-8000-000000000058';
const setupServicePlanId = 'b1000000-0000-4000-8000-000000000059';
const setupStandaloneServiceEventId =
  'b1000000-0000-4000-8000-000000000060';
const setupOrchestrationInspectionId =
  'b1000000-0000-4000-8000-000000000049';

const amendmentSignedFilePath = join(
  tmpdir(),
  'portfolio-amendment-signed-original.pdf',
);
const agreementSignedFilePath = join(
  tmpdir(),
  'portfolio-agreement-signed-original.pdf',
);
const inspectionEvidencePhotoPath = join(
  tmpdir(),
  'portfolio-inspection-window-photo.jpg',
);
const oversizedInspectionEvidencePhotoPath = join(
  tmpdir(),
  'portfolio-inspection-oversized-photo.jpg',
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

  let diagnostic = '';
  try {
    const [url, bodyText] = await Promise.all([
      currentUrl(sessionId),
      executeScript(
        sessionId,
        'return document.body ? document.body.innerText.slice(0, 4000) : "";',
      ),
    ]);
    diagnostic = ` URL=${url} BODY=${JSON.stringify(bodyText)}`;
  } catch {
    // Keep the original WebDriver failure when diagnostics are unavailable.
  }

  throw new Error(
    `Timed out waiting for ${using}=${value}. Last error: ${lastError}.${diagnostic}`,
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

async function drawSignaturePadXpath(sessionId, xpath) {
  const id = await waitForElement(sessionId, 'xpath', xpath);
  return webdriver(`/session/${sessionId}/execute/sync`, {
    method: 'POST',
    body: {
      script:
        'const canvas = arguments[0];' +
        'const rect = canvas.getBoundingClientRect();' +
        'const points = [[.15,.62],[.28,.35],[.4,.66],[.55,.28],[.72,.58],[.84,.4]];' +
        'const event = (type, point, buttons) => canvas.dispatchEvent(new PointerEvent(type, {' +
        'bubbles:true,cancelable:true,pointerId:7,pointerType:"pen",isPrimary:true,button:0,buttons,' +
        'clientX:rect.left + rect.width * point[0],clientY:rect.top + rect.height * point[1]}));' +
        'event("pointerdown", points[0], 1);' +
        'for (let i=1;i<points.length;i+=1) event("pointermove", points[i], 1);' +
        'event("pointerup", points[points.length-1], 0);' +
        'return true;',
      args: [{ 'element-6066-11e4-a52e-4f735466cecf': id }],
    },
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

async function clickAndAcceptConfirm(sessionId, xpath, expectedText) {
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
  assertEqual(text, expectedText, 'Confirmation text');
  await webdriver(`/session/${sessionId}/alert/accept`, {
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
    writeFile(
      inspectionEvidencePhotoPath,
      new Uint8Array([255, 216, 255, 224, 0, 16, 74, 70, 73, 70, 255, 217]),
    ),
    writeFile(
      oversizedInspectionEvidencePhotoPath,
      new Uint8Array(),
    ),
  ]);
  await truncate(
    oversizedInspectionEvidencePhotoPath,
    32 * 1024 * 1024 + 1,
  );

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
    "//h1[normalize-space()='Portfolio']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//a[normalize-space()='Skip to main content']",
  );
  await assertActiveHeading(sessionId, 'Portfolio', 'Dashboard focus');
  await waitForElement(
    sessionId,
    'xpath',
    "//h2[normalize-space()='Occupancy as of 30.06.2025']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[@data-portfolio-section='occupancy']//*[contains(normalize-space(),'current Property and Unit master inventory')]",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[@data-portfolio-section='properties']//span[contains(@class,'section-note') and contains(normalize-space(),'Occupancy · as of 30.06.2025 · Maintenance · current')]",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[@data-portfolio-section='properties']//th[normalize-space()='Units now']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[@data-portfolio-section='properties']//th[normalize-space()='Open issues now']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[normalize-space()='No attributed costs through 30.06.2025.']",
  );
  assertEqual(
    await executeScript(
      sessionId,
      "return document.querySelector('[data-portfolio-setup]').open;",
    ),
    false,
    'Portfolio setup is collapsed by default',
  );
  assertEqual(
    await executeScript(
      sessionId,
      "return document.querySelector('[data-portfolio-setup] form').checkVisibility();",
    ),
    false,
    'Collapsed Portfolio setup form is not visible',
  );
  assertEqual(
    await executeScript(
      sessionId,
      "return Array.from(document.querySelectorAll('[data-portfolio-section]')).map((element) => element.dataset.portfolioSection).join(',');",
    ),
    'attention,occupancy,properties,costs',
    'Portfolio Overview prioritizes operations before reporting and costs',
  );
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
  await waitForElement(
    sessionId,
    'xpath',
    "//p[contains(@class,'header-note') and contains(normalize-space(),'Reporting context remains 30.06.2025.')]",
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

  await waitForElement(
    sessionId,
    'xpath',
    "//aside//a[normalize-space()='Inspection schemas']",
  );
  await clickXpath(
    sessionId,
    "//aside//a[normalize-space()='Inspection schemas']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//h1[normalize-space()='Inspection Schema Builder']",
  );
  assertEqual(
    await currentUrl(sessionId),
    baseUrl + '/inspection-schemas?asOf=2025-06-30',
    'Inspection Schema Builder URL',
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//button[contains(@class,'schema-version-card')][.//strong[normalize-space()='Browser move-in inspection']]",
  );
  await clickXpath(
    sessionId,
    "//button[normalize-space()='Duplicate as new draft']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//h2[normalize-space()='Build Inspection schema']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//article[contains(@class,'schema-item-editor')][.//input[@value='damage_notes']]//strong[normalize-space()='Visibility']",
  );
  await typeXpath(
    sessionId,
    "//label[normalize-space()='Title']//input",
    'Browser move-in inspection revised',
  );
  await clickXpath(
    sessionId,
    "//button[normalize-space()='Add section']",
  );
  await typeXpath(
    sessionId,
    "(//article[contains(@class,'schema-section-editor')])[last()]//label[normalize-space()='Section title']//input",
    'Bathroom checks',
  );
  await typeXpath(
    sessionId,
    "(//article[contains(@class,'schema-section-editor')])[last()]//label[normalize-space()='Stable section key']//input",
    'bathroom_checks',
  );
  await selectOptionXpath(
    sessionId,
    "(//article[contains(@class,'schema-section-editor')])[last()]//select[@aria-label='Section scope']",
    'space',
  );
  await clickXpath(
    sessionId,
    "(//article[contains(@class,'schema-section-editor')])[last()]//fieldset[contains(@class,'schema-space-types')]//label[contains(normalize-space(),'Bathroom')]//input",
  );
  await typeXpath(
    sessionId,
    "(//article[contains(@class,'schema-section-editor')])[last()]//label[normalize-space()='Field label']//input",
    'Bathroom note',
  );
  await typeXpath(
    sessionId,
    "(//article[contains(@class,'schema-section-editor')])[last()]//label[normalize-space()='Stable field key']//input",
    'bathroom_note',
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[contains(@class,'schema-builder-valid') and contains(normalize-space(),'Draft passes client structural validation')]",
  );

  const schemaCreatesBefore = await executeScript(
    sessionId,
    'return window.__portfolioInspectionSchemaCreateCount || 0;',
  );
  await executeScript(
    sessionId,
    'window.__portfolioFailNextInspectionSchemaCreateAfterCommit = true;' +
      'window.__portfolioFailNextInspectionSchemaListRead = true;' +
      'return true;',
  );
  await clickXpath(
    sessionId,
    "//button[normalize-space()='Save draft version']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[contains(normalize-space(),'Schema save outcome is ambiguous and the canonical reread failed:')]",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[@data-schema-create-ambiguity]",
  );
  assertEqual(
    await elementDisabledXpath(
      sessionId,
      "//button[normalize-space()='Save draft version']",
    ),
    true,
    'Ambiguous Schema Builder create pauses retry until operator verification',
  );
  assertEqual(
    await executeScript(
      sessionId,
      'return window.__portfolioInspectionSchemaCreateCount || 0;',
    ),
    schemaCreatesBefore + 1,
    'Ambiguous Schema Builder create never auto-retries POST when canonical reread also fails',
  );
  assertEqual(
    await elementExistsXpath(
      sessionId,
      "//button[contains(@class,'schema-version-card')][.//small[contains(normalize-space(),'v2')]]",
    ),
    false,
    'Failed canonical reread leaves the rendered version list unchanged',
  );

  await clickXpath(
    sessionId,
    "//aside[contains(@class,'schema-version-sidebar')]//button[normalize-space()='Refresh']",
  );
  const createdDraftCard =
    "//button[contains(@class,'schema-version-card')][.//small[contains(normalize-space(),'v2')]][.//span[normalize-space()='draft']]";
  await waitForElement(
    sessionId,
    'xpath',
    createdDraftCard,
  );
  assertEqual(
    await elementDisabledXpath(
      sessionId,
      "//button[normalize-space()='Save draft version']",
    ),
    true,
    'Successful later canonical refresh does not silently clear create ambiguity',
  );
  assertEqual(
    await executeScript(
      sessionId,
      'return window.__portfolioInspectionSchemaCreateCount || 0;',
    ),
    schemaCreatesBefore + 1,
    'Operator verification refresh does not create another schema version',
  );
  await clickAndAcceptConfirm(
    sessionId,
    createdDraftCard,
    'Discard the current unsaved Inspection schema draft?',
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//section[contains(@class,'schema-canonical-heading')][.//h2[normalize-space()='Browser move-in inspection revised']]//span[normalize-space()='draft']",
  );

  const schemaPublishesBefore = await executeScript(
    sessionId,
    'return window.__portfolioInspectionSchemaPublishCount || 0;',
  );
  await executeScript(
    sessionId,
    'window.__portfolioFailNextInspectionSchemaPublishAfterCommit = true;' +
      'window.__portfolioFailNextInspectionSchemaExactRead = true;' +
      'return true;',
  );
  await clickXpath(
    sessionId,
    "//button[normalize-space()='Publish this draft']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[contains(normalize-space(),'Publish outcome is ambiguous and exact schema reread failed:')]",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[@data-schema-publish-ambiguity]",
  );
  assertEqual(
    await elementDisabledXpath(
      sessionId,
      "//button[normalize-space()='Publish this draft']",
    ),
    true,
    'Ambiguous publish remains blocked when exact recovery reread fails',
  );
  assertEqual(
    await executeScript(
      sessionId,
      'return window.__portfolioInspectionSchemaPublishCount || 0;',
    ),
    schemaPublishesBefore + 1,
    'Ambiguous publish failure path sends exactly one publish POST',
  );

  await clickXpath(
    sessionId,
    "//button[normalize-space()='Check exact publish status']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[contains(normalize-space(),'MOVE-IN-BRW v2 publish was recovered from the exact canonical version.')]",
  );
  assertEqual(
    await executeScript(
      sessionId,
      'return window.__portfolioInspectionSchemaPublishCount || 0;',
    ),
    schemaPublishesBefore + 1,
    'Exact publish recovery reread never sends another publish POST',
  );
  assertEqual(
    await elementExistsXpath(
      sessionId,
      "//button[normalize-space()='Publish this draft']",
    ),
    false,
    'Exact published recovery clears retry action',
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//button[contains(@class,'schema-version-card')][.//small[contains(normalize-space(),'v2')]][.//span[normalize-space()='published']]",
  );

  await clickXpath(
    sessionId,
    "//button[normalize-space()='Duplicate as new draft']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//h2[normalize-space()='Build Inspection schema']",
  );
  await typeXpath(
    sessionId,
    "//label[normalize-space()='Title']//input",
    'Browser move-in inspection acknowledged write',
  );

  const acknowledgedCreateCountBefore = await executeScript(
    sessionId,
    'return window.__portfolioInspectionSchemaCreateCount || 0;',
  );
  await executeScript(
    sessionId,
    'window.__portfolioFailNextInspectionSchemaListRead = true; return true;',
  );
  await clickXpath(
    sessionId,
    "//button[normalize-space()='Save draft version']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[contains(normalize-space(),'Schema draft was saved as MOVE-IN-BRW v3, but the version-list refresh failed:')]",
  );
  assertEqual(
    await executeScript(
      sessionId,
      'return window.__portfolioInspectionSchemaCreateCount || 0;',
    ),
    acknowledgedCreateCountBefore + 1,
    'Acknowledged Schema Builder create stays exactly one POST when post-write refresh fails',
  );
  assertEqual(
    await elementExistsXpath(
      sessionId,
      "//button[normalize-space()='Save draft version']",
    ),
    false,
    'Acknowledged create closes the local writable draft before best-effort refresh',
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//section[contains(@class,'schema-canonical-heading')][.//h2[normalize-space()='Browser move-in inspection acknowledged write']]//span[normalize-space()='draft']",
  );

  await clickXpath(
    sessionId,
    "//aside[contains(@class,'schema-version-sidebar')]//button[normalize-space()='Refresh']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//button[contains(@class,'schema-version-card')][.//small[contains(normalize-space(),'v3')]][.//span[normalize-space()='draft']]",
  );
  assertEqual(
    await executeScript(
      sessionId,
      'return window.__portfolioInspectionSchemaCreateCount || 0;',
    ),
    acknowledgedCreateCountBefore + 1,
    'Later reconciliation cannot create v4 from the acknowledged v3 save',
  );

  const acknowledgedPublishCountBefore = await executeScript(
    sessionId,
    'return window.__portfolioInspectionSchemaPublishCount || 0;',
  );
  await executeScript(
    sessionId,
    'window.__portfolioFailNextInspectionSchemaListRead = true; return true;',
  );
  await clickXpath(
    sessionId,
    "//button[normalize-space()='Publish this draft']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[contains(normalize-space(),'Schema MOVE-IN-BRW v3 was published, but the version-list refresh failed:')]",
  );
  assertEqual(
    await executeScript(
      sessionId,
      'return window.__portfolioInspectionSchemaPublishCount || 0;',
    ),
    acknowledgedPublishCountBefore + 1,
    'Acknowledged publish stays exactly one POST when post-write refresh fails',
  );
  assertEqual(
    await elementExistsXpath(
      sessionId,
      "//button[normalize-space()='Publish this draft']",
    ),
    false,
    'Acknowledged publish immediately replaces local draft status with published',
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//section[contains(@class,'schema-canonical-heading')][.//h2[normalize-space()='Browser move-in inspection acknowledged write']]//span[normalize-space()='published']",
  );
  await clickXpath(
    sessionId,
    "//aside[contains(@class,'schema-version-sidebar')]//button[normalize-space()='Refresh']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//button[contains(@class,'schema-version-card')][.//small[contains(normalize-space(),'v3')]][.//span[normalize-space()='published']]",
  );

  await clickXpath(sessionId, "//aside//a[normalize-space()='Overview']");
  await waitForElement(
    sessionId,
    'xpath',
    "//h1[normalize-space()='Portfolio']",
  );
  assertEqual(
    await executeScript(
      sessionId,
      "return document.querySelector('[data-portfolio-setup]').open;",
    ),
    false,
    'Returning to Portfolio keeps setup collapsed',
  );
  await clickXpath(
    sessionId,
    "//details[@data-portfolio-setup]/summary",
  );
  assertEqual(
    await executeScript(
      sessionId,
      "return document.querySelector('[data-portfolio-setup]').open;",
    ),
    true,
    'Portfolio setup opens only on operator request',
  );
  assertEqual(
    await executeScript(
      sessionId,
      "return document.querySelector('[data-portfolio-setup] form').checkVisibility();",
    ),
    true,
    'Expanded Portfolio setup form is visible',
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
    '4',
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

  const setupSpaceForm = "//form[contains(@class,'setup-form')]";
  const additionalSpaces = [
    {
      code: 'HALL-SETUP',
      name: 'Entrance Hall',
      type: 'hall',
      area: '7',
      order: '1',
    },
    {
      code: 'LIV-SETUP',
      name: 'Living Room',
      type: 'living_room',
      area: '24',
      order: '2',
    },
    {
      code: 'KIT-SETUP',
      name: 'Kitchen',
      type: 'kitchen',
      area: '9.5',
      order: '3',
    },
    {
      code: 'BATH-SETUP',
      name: 'Bathroom',
      type: 'bathroom',
      area: '6.5',
      order: '5',
    },
  ];

  for (const space of additionalSpaces) {
    await typeXpath(
      sessionId,
      setupSpaceForm + "//input[@name='code']",
      space.code,
    );
    await typeXpath(
      sessionId,
      setupSpaceForm + "//input[@name='name']",
      space.name,
    );
    await selectOptionXpath(
      sessionId,
      setupSpaceForm + "//select[@name='spaceType']",
      space.type,
    );
    await typeXpath(
      sessionId,
      setupSpaceForm + "//input[@name='areaM2']",
      space.area,
    );
    await typeXpath(
      sessionId,
      setupSpaceForm + "//input[@name='sortOrder']",
      space.order,
    );
    await clickXpath(
      sessionId,
      setupSpaceForm + "//button[normalize-space()='Create Space']",
    );
    await waitForElement(
      sessionId,
      'xpath',
      "//article[contains(@class,'space-card')][.//h3[normalize-space()='" +
        space.name +
        "']]",
    );
  }

  await waitForElement(
    sessionId,
    'xpath',
    "//section[.//h2[normalize-space()='Spaces']]//span[contains(@class,'section-note') and normalize-space()='5 records']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//article[contains(@class,'space-card')][.//span[normalize-space()='HALL-SETUP']][.//h3[normalize-space()='Entrance Hall']][.//span[contains(normalize-space(),'hall')]][.//span[contains(normalize-space(),'order 1')]]",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//article[contains(@class,'space-card')][.//span[normalize-space()='LIV-SETUP']][.//h3[normalize-space()='Living Room']][.//span[contains(normalize-space(),'living room')]][.//span[contains(normalize-space(),'order 2')]]",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//article[contains(@class,'space-card')][.//span[normalize-space()='KIT-SETUP']][.//h3[normalize-space()='Kitchen']][.//span[contains(normalize-space(),'order 3')]]",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//article[contains(@class,'space-card')][.//span[normalize-space()='BED-SETUP']][.//h3[normalize-space()='Setup Bedroom']][.//span[contains(normalize-space(),'order 4')]]",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//article[contains(@class,'space-card')][.//span[normalize-space()='BATH-SETUP']][.//h3[normalize-space()='Bathroom']][.//span[contains(normalize-space(),'order 5')]]",
  );

  await clickXpath(sessionId, "//*[@data-unit-dossier-navigation]//a[.//span[normalize-space()='Tenancies']]");
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
  await waitForElement(
    sessionId,
    'xpath',
    "//span[contains(@class,'section-note') and contains(normalize-space(),'reporting context 30.06.2025 is preserved')]",
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

  await clickXpath(sessionId, "//*[@data-unit-dossier-navigation]//a[.//span[normalize-space()='Keys']]");
  const accessCreateForm = "//form[@data-access-item-form='create']";
  await waitForElement(sessionId, 'xpath', accessCreateForm);
  assertEqual(
    await currentUrl(sessionId),
    baseUrl +
      '/properties/' + setupPropertyId +
      '/units/' + setupUnitId +
      '?tab=keys&asOf=2025-06-30',
    'Setup Unit Keys URL',
  );
  await typeXpath(
    sessionId,
    accessCreateForm + "//input[@name='code']",
    'KEY-SETUP-BRW',
  );
  await typeXpath(
    sessionId,
    accessCreateForm + "//input[@name='label']",
    'Apartment entrance key',
  );
  await selectOptionXpath(
    sessionId,
    accessCreateForm + "//select[@name='spaceId']",
    setupSpaceId,
  );
  await executeScript(
    sessionId,
    'window.__portfolioFailNextAccessItemCreateAfterCommit = true; return true;',
  );
  await clickXpath(
    sessionId,
    accessCreateForm + "//button[normalize-space()='Create AccessItem']",
  );
  const accessCard =
    "//article[contains(@class,'access-item-card')][@data-access-item-code='KEY-SETUP-BRW']";
  await waitForElement(
    sessionId,
    'xpath',
    accessCard + "//h3[normalize-space()='Apartment entrance key']",
  );
  assertEqual(
    await elementExistsXpath(
      sessionId,
      "//*[contains(normalize-space(),'AccessItem creation outcome is unconfirmed')]",
    ),
    false,
    'Committed AccessItem create is reconciled after acknowledgement loss',
  );
  await waitForElement(
    sessionId,
    'xpath',
    accessCard + "//*[contains(normalize-space(),'Setup Bedroom')]",
  );

  assertEqual(
    await executeScript(
      sessionId,
      'return window.__portfolioSimulateAccessItemAvailabilityCycle();',
    ),
    true,
    'Simulate unseen AccessItem issue-return cycle',
  );
  assertEqual(
    await executeScript(
      sessionId,
      'return window.__portfolioAccessItemTransactionCount();',
    ),
    2,
    'Unseen availability cycle has two canonical events',
  );

  const accessIssueForm =
    accessCard + "//form[@data-access-item-form='issue']";
  await selectOptionXpath(
    sessionId,
    accessIssueForm + "//select[@name='tenancyId']",
    setupTenancyId,
  );
  await setInputValueXpath(
    sessionId,
    accessIssueForm + "//input[@name='date']",
    '2026-10-01',
  );
  await setInputValueXpath(
    sessionId,
    accessIssueForm + "//input[@name='time']",
    '10:00',
  );
  await typeXpath(
    sessionId,
    accessIssueForm + "//input[@name='note']",
    'Move-in handover',
  );
  await clickXpath(
    sessionId,
    accessIssueForm + "//button[normalize-space()='Issue AccessItem']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[contains(normalize-space(),'This AccessItem changed on the server')]",
  );
  assertEqual(
    await executeScript(
      sessionId,
      'return window.__portfolioAccessItemTransactionCount();',
    ),
    2,
    'Stale issue appends no transaction after unseen issue-return cycle',
  );
  await waitForElement(
    sessionId,
    'xpath',
    accessCard + "//span[contains(@class,'status-chip') and normalize-space()='available']",
  );

  await selectOptionXpath(
    sessionId,
    accessIssueForm + "//select[@name='tenancyId']",
    setupTenancyId,
  );
  await setInputValueXpath(
    sessionId,
    accessIssueForm + "//input[@name='date']",
    '2026-10-01',
  );
  await setInputValueXpath(
    sessionId,
    accessIssueForm + "//input[@name='time']",
    '10:00',
  );
  await typeXpath(
    sessionId,
    accessIssueForm + "//input[@name='note']",
    'Move-in handover after refresh',
  );
  await clickXpath(
    sessionId,
    accessIssueForm + "//button[normalize-space()='Issue AccessItem']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    accessCard + "//span[contains(@class,'status-chip') and normalize-space()='issued']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    accessCard + "//*[contains(normalize-space(),'TEN-SETUP-BRW')]",
  );

  assertEqual(
    await executeScript(
      sessionId,
      'return window.__portfolioSimulateAccessItemHandoff();',
    ),
    true,
    'Simulate concurrent handoff from TEN-SETUP-BRW to TEN-CONCURRENT-1',
  );
  const beforeStaleReturnCount = await executeScript(
    sessionId,
    'return window.__portfolioAccessItemTransactionCount();',
  );
  const staleReturnForm =
    accessCard + "//form[@data-access-item-form='return']";
  await setInputValueXpath(
    sessionId,
    staleReturnForm + "//input[@name='date']",
    '2026-10-02',
  );
  await setInputValueXpath(
    sessionId,
    staleReturnForm + "//input[@name='time']",
    '09:00',
  );
  await typeXpath(
    sessionId,
    staleReturnForm + "//input[@name='note']",
    'Stale TEN-A return must not affect TEN-B',
  );
  await clickXpath(
    sessionId,
    staleReturnForm + "//button[normalize-space()='Record return']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[contains(normalize-space(),'This AccessItem changed on the server')]",
  );
  assertEqual(
    await executeScript(
      sessionId,
      'return window.__portfolioAccessItemTransactionCount();',
    ),
    beforeStaleReturnCount,
    'Stale return appends no transaction for the newer holder',
  );
  await waitForElement(
    sessionId,
    'xpath',
    accessCard + "//*[contains(normalize-space(),'TEN-CONCURRENT-1')]",
  );

  const accessLossForm =
    accessCard + "//form[@data-access-item-form='loss']";
  assertEqual(
    await executeScript(
      sessionId,
      'return window.__portfolioSimulateAccessItemHandoff();',
    ),
    true,
    'Simulate concurrent handoff from TEN-CONCURRENT-1 to TEN-CONCURRENT-2',
  );
  const beforeStaleLossCount = await executeScript(
    sessionId,
    'return window.__portfolioAccessItemTransactionCount();',
  );
  await setInputValueXpath(
    sessionId,
    accessLossForm + "//input[@name='date']",
    '2026-10-02',
  );
  await setInputValueXpath(
    sessionId,
    accessLossForm + "//input[@name='time']",
    '10:00',
  );
  await typeXpath(
    sessionId,
    accessLossForm + "//input[@name='note']",
    'Tenant reported key missing',
  );
  await clickXpath(
    sessionId,
    accessLossForm + "//button[normalize-space()='Report lost']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[contains(normalize-space(),'This AccessItem changed on the server')]",
  );
  assertEqual(
    await executeScript(
      sessionId,
      'return window.__portfolioAccessItemTransactionCount();',
    ),
    beforeStaleLossCount,
    'Stale lost appends no transaction for the newer holder',
  );
  await waitForElement(
    sessionId,
    'xpath',
    accessCard + "//*[contains(normalize-space(),'TEN-CONCURRENT-2')]",
  );

  const freshLossForm =
    accessCard + "//form[@data-access-item-form='loss']";
  await setInputValueXpath(
    sessionId,
    freshLossForm + "//input[@name='date']",
    '2026-10-02',
  );
  await setInputValueXpath(
    sessionId,
    freshLossForm + "//input[@name='time']",
    '10:30',
  );
  await typeXpath(
    sessionId,
    freshLossForm + "//input[@name='note']",
    'Current holder reported key missing',
  );
  await clickXpath(
    sessionId,
    freshLossForm + "//button[normalize-space()='Report lost']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    accessCard + "//span[contains(@class,'status-chip') and normalize-space()='lost']",
  );

  const accessReturnForm =
    accessCard + "//form[@data-access-item-form='return']";
  await setInputValueXpath(
    sessionId,
    accessReturnForm + "//input[@name='date']",
    '2026-10-03',
  );
  await setInputValueXpath(
    sessionId,
    accessReturnForm + "//input[@name='time']",
    '10:00',
  );
  await typeXpath(
    sessionId,
    accessReturnForm + "//input[@name='note']",
    'Recovered and returned',
  );
  await clickXpath(
    sessionId,
    accessReturnForm + "//button[normalize-space()='Record return']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    accessCard + "//span[contains(@class,'status-chip') and normalize-space()='available']",
  );

  const accessRetireForm =
    accessCard + "//form[@data-access-item-form='retire']";
  await typeXpath(
    sessionId,
    accessRetireForm + "//input[@name='retirementReason']",
    'Lock cylinder replaced',
  );
  await clickXpath(
    sessionId,
    accessRetireForm + "//button[normalize-space()='Retire AccessItem']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    accessCard + "//span[contains(@class,'status-chip') and normalize-space()='retired']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    accessCard + "//*[contains(normalize-space(),'Lock cylinder replaced')]",
  );

  await typeXpath(
    sessionId,
    accessCreateForm + "//input[@name='code']",
    'CARD-ENTRY-BRW',
  );
  await selectOptionXpath(
    sessionId,
    accessCreateForm + "//select[@name='kind']",
    'card',
  );
  await typeXpath(
    sessionId,
    accessCreateForm + "//input[@name='label']",
    'Building entrance card',
  );
  await clickXpath(
    sessionId,
    accessCreateForm + "//button[normalize-space()='Create AccessItem']",
  );

  const entryCard =
    "//article[contains(@class,'access-item-card')][@data-access-item-code='CARD-ENTRY-BRW']";
  await waitForElement(
    sessionId,
    'xpath',
    entryCard + "//h3[normalize-space()='Building entrance card']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    entryCard + "//*[contains(normalize-space(),'Unit-wide')]",
  );
  assertEqual(
    await executeScript(
      sessionId,
      "return window.__portfolioAccessItemTransactionCountFor('" +
        setupEntryCardId +
        "');",
    ),
    0,
    'New entrance card starts with independent empty custody ledger',
  );

  const entryCardIssueForm =
    entryCard + "//form[@data-access-item-form='issue']";
  await selectOptionXpath(
    sessionId,
    entryCardIssueForm + "//select[@name='tenancyId']",
    setupTenancyId,
  );
  await setInputValueXpath(
    sessionId,
    entryCardIssueForm + "//input[@name='date']",
    '2026-10-04',
  );
  await setInputValueXpath(
    sessionId,
    entryCardIssueForm + "//input[@name='time']",
    '11:00',
  );
  await typeXpath(
    sessionId,
    entryCardIssueForm + "//input[@name='note']",
    'Building access card issued separately',
  );
  await clickXpath(
    sessionId,
    entryCardIssueForm + "//button[normalize-space()='Issue AccessItem']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    entryCard + "//span[contains(@class,'status-chip') and normalize-space()='issued']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    entryCard + "//*[contains(normalize-space(),'TEN-SETUP-BRW')]",
  );
  assertEqual(
    await executeScript(
      sessionId,
      "return window.__portfolioAccessItemTransactionCountFor('" +
        setupEntryCardId +
        "');",
    ),
    1,
    'Entrance card custody sequence starts at one independently',
  );

  await typeXpath(
    sessionId,
    accessCreateForm + "//input[@name='code']",
    'KEY-HALL-BRW',
  );
  await typeXpath(
    sessionId,
    accessCreateForm + "//input[@name='label']",
    'Entrance Hall spare key',
  );
  await selectOptionXpath(
    sessionId,
    accessCreateForm + "//select[@name='spaceId']",
    setupHallSpaceId,
  );
  await clickXpath(
    sessionId,
    accessCreateForm + "//button[normalize-space()='Create AccessItem']",
  );

  const hallKey =
    "//article[contains(@class,'access-item-card')][@data-access-item-code='KEY-HALL-BRW']";
  await waitForElement(
    sessionId,
    'xpath',
    hallKey + "//h3[normalize-space()='Entrance Hall spare key']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    hallKey + "//*[contains(normalize-space(),'Entrance Hall')]",
  );
  await waitForElement(
    sessionId,
    'xpath',
    hallKey + "//span[contains(@class,'status-chip') and normalize-space()='available']",
  );
  assertEqual(
    await executeScript(
      sessionId,
      "return window.__portfolioAccessItemTransactionCountFor('" +
        setupHallKeyId +
        "');",
    ),
    0,
    'Space-scoped spare key has independent empty custody ledger',
  );

  await waitForElement(
    sessionId,
    'xpath',
    accessCard + "//span[contains(@class,'status-chip') and normalize-space()='retired']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    entryCard + "//span[contains(@class,'status-chip') and normalize-space()='issued']",
  );

  await clickXpath(sessionId, "//*[@data-unit-dossier-navigation]//a[.//span[normalize-space()='Tenancies']]");

  await typeXpath(
    sessionId,
    "//form[@data-tenancy-form='create']//input[@name='code']",
    'TEN-LU-EMPTY-BRW',
  );
  await clickXpath(
    sessionId,
    "//form[@data-tenancy-form='create']//button[normalize-space()='Create Tenancy']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//article[contains(@class,'tenancy-card')][.//span[normalize-space()='TEN-LU-EMPTY-BRW']][.//span[contains(@class,'status-chip') and normalize-space()='draft']]",
  );

  await clickXpath(sessionId, "//*[@data-unit-dossier-navigation]//a[.//span[normalize-space()='Contracts']]");
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
    "//a[contains(@class,'selection-card')][.//strong[normalize-space()='TEN-SETUP-BRW']][.//small[normalize-space()='01.10.2026 → open']]",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//section[contains(@class,'contract-terms-panel')]//h3[contains(normalize-space(),'terms from 01.10.2026')]",
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
    "//section[.//p[normalize-space()='Step 6 · Amendment Documents']]";
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
    "//section[contains(@class,'contract-terms-panel')]//h3[contains(normalize-space(),'terms from 01.01.2027')]",
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

  const luzernerForm =
    "//*[@data-luzerner-lease-form='" + setupReplacementAgreementId + "']";
  await waitForElement(
    sessionId,
    'xpath',
    luzernerForm + "//h2[normalize-space()='Contract form data']",
  );
  await typeXpath(
    sessionId,
    luzernerForm + "//label[normalize-space()='EWID']//input",
    '30123456',
  );
  await typeXpath(
    sessionId,
    luzernerForm + "//label[normalize-space()='EGID']//input",
    '191234567',
  );
  await setInputValueXpath(
    sessionId,
    luzernerForm + "//label[normalize-space()='Mietantritt']//input",
    '2027-07-01',
  );
  await selectOptionXpath(
    sessionId,
    luzernerForm + "//label[contains(normalize-space(.),'Benutzungsart')]//select",
    'apartment',
  );
  await selectOptionXpath(
    sessionId,
    luzernerForm + "//label[contains(normalize-space(.),'Mietdauer')]//select",
    'indefinite',
  );
  await selectOptionXpath(
    sessionId,
    luzernerForm + "//label[contains(normalize-space(.),'Kündigungstermine')]//select",
    'monthly_except_december',
  );
  await selectOptionXpath(
    sessionId,
    luzernerForm + "//label[contains(normalize-space(.),'Kündigungsfristen')]//select",
    'residential_3_months',
  );
  await typeXpath(
    sessionId,
    luzernerForm +
      "//label[normalize-space()='Netto-Mietzins Wohnung / Gewerberaum CHF']//input",
    '1200.00',
  );
  await selectOptionXpath(
    sessionId,
    luzernerForm +
      "//label[.//span[normalize-space()='Heiz- und Warmwasserkosten (VMWG Art. 5)']]//select",
    'advance',
  );
  await typeXpath(
    sessionId,
    luzernerForm +
      "//label[normalize-space()='Nebenkosten Akonto CHF']//input",
    '160.00',
  );
  await selectOptionXpath(
    sessionId,
    luzernerForm + "//label[contains(normalize-space(.),'Zahlbar im Voraus')]//select",
    'monthly',
  );
  await selectOptionXpath(
    sessionId,
    luzernerForm + "//label[contains(normalize-space(.),'Mietzinsanpassung')]//select",
    'termination_date',
  );
  await typeXpath(
    sessionId,
    luzernerForm + "//label[normalize-space()='Monate im Voraus']//input",
    '3',
  );
  await selectOptionXpath(
    sessionId,
    luzernerForm +
      "//label[contains(normalize-space(.),'Stichtag Nebenkostenabrechnung')]//select",
    'december_31',
  );
  await typeXpath(
    sessionId,
    luzernerForm +
      "//label[contains(normalize-space(.),'Besondere Bestimmungen')]//textarea",
    'Browser canonical Luzerner provision.',
  );
  await typeXpath(
    sessionId,
    luzernerForm + "//label[normalize-space()='Ort']//input",
    'Luzern',
  );
  await setInputValueXpath(
    sessionId,
    luzernerForm + "//label[normalize-space()='Datum']//input",
    '2027-06-15',
  );

  await waitForElement(
    sessionId,
    'xpath',
    agreementSignForm +
      "//button[normalize-space()='Sign Agreement' and @disabled]",
  );
  await waitForElement(
    sessionId,
    'xpath',
    agreementCreateForm +
      "//button[normalize-space()='Create Agreement draft' and @disabled]",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[contains(normalize-space(),'Save or resolve the current Luzerner contract form before changing legal records.')]",
  );

  await clickAndDismissConfirm(
    sessionId,
    "//*[@data-unit-dossier-navigation]//a[.//span[normalize-space()='Timeline']]",
    'This Luzerner contract form has unsaved changes. Leave and discard them?',
  );
  assertEqual(
    await currentUrl(sessionId),
    baseUrl +
      '/properties/' + setupPropertyId +
      '/units/' + setupUnitId +
      '?tab=contracts&tenancyId=' + setupTenancyId +
      '&agreementId=' + setupReplacementAgreementId +
      '&asOf=2027-01-01',
    'Dirty Luzerner form blocks dossier navigation when discard is cancelled',
  );
  assertEqual(
    await elementValueXpath(
      sessionId,
      luzernerForm +
        "//label[contains(normalize-space(.),'Besondere Bestimmungen')]//textarea",
    ),
    'Browser canonical Luzerner provision.',
    'Dirty Luzerner draft survives cancelled navigation',
  );

  const luzernerPutsBefore = await executeScript(
    sessionId,
    'return window.__portfolioLuzernerFormPutCount || 0;',
  );
  await clickXpath(
    sessionId,
    luzernerForm +
      "//button[normalize-space()='Save Luzerner contract data']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    luzernerForm +
      "//*[contains(normalize-space(),'Luzerner Mietvertrag data saved as revision 1.')]",
  );
  assertEqual(
    await executeScript(
      sessionId,
      'return window.__portfolioLuzernerFormPutCount || 0;',
    ),
    luzernerPutsBefore + 1,
    'Initial Luzerner form save issues one canonical PUT',
  );
  await waitForElement(
    sessionId,
    'xpath',
    agreementSignForm +
      "//button[normalize-space()='Sign Agreement' and not(@disabled)]",
  );
  await waitForElement(
    sessionId,
    'xpath',
    agreementCreateForm +
      "//button[normalize-space()='Create Agreement draft' and not(@disabled)]",
  );

  const luzernerPdfPreviewsBefore = await executeScript(
    sessionId,
    'return window.__portfolioLuzernerPdfPreviewCount || 0;',
  );
  await clickXpath(
    sessionId,
    luzernerForm + "//button[normalize-space()='Generate PDF preview']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    luzernerForm +
      "//*[contains(normalize-space(),'PDF generated from canonical revision 1.')]",
  );
  await waitForElement(
    sessionId,
    'xpath',
    luzernerForm + "//a[normalize-space()='Open generated PDF']",
  );
  assertEqual(
    await executeScript(
      sessionId,
      'return window.__portfolioLuzernerPdfPreviewCount || 0;',
    ),
    luzernerPdfPreviewsBefore + 1,
    'Saved canonical Luzerner form produces exactly one PDF preview request',
  );
  assertEqual(
    await elementExistsXpath(
      sessionId,
      luzernerForm + "//button[normalize-space()='Store generated contract PDF']",
    ),
    false,
    'Draft Agreement does not expose final Luzerner Document storage',
  );

  await typeXpath(
    sessionId,
    luzernerForm +
      "//label[contains(normalize-space(.),'Besondere Bestimmungen')]//textarea",
    'Discard this temporary Luzerner edit.',
  );
  await waitForElement(
    sessionId,
    'xpath',
    agreementCreateForm +
      "//button[normalize-space()='Create Agreement draft' and @disabled]",
  );
  await clickAndAcceptConfirm(
    sessionId,
    "//a[contains(@class,'selection-card')][.//strong[normalize-space()='TEN-LU-EMPTY-BRW']]",
    'This Luzerner contract form has unsaved changes. Leave and discard them?',
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//a[contains(@class,'selection-card')][@aria-current='page'][.//strong[normalize-space()='TEN-LU-EMPTY-BRW']]",
  );
  await waitForElement(
    sessionId,
    'xpath',
    agreementCreateForm,
  );
  assertEqual(
    await elementExistsXpath(
      sessionId,
      "//*[contains(normalize-space(),'Save or resolve the current Luzerner contract form before changing legal records.')]",
    ),
    false,
    'Accepted Luzerner discard clears stale legal-write warning on the new Tenancy owner',
  );
  assertEqual(
    await elementDisabledXpath(
      sessionId,
      agreementCreateForm +
        "//button[normalize-space()='Create Agreement draft']",
    ),
    false,
    'Accepted Luzerner discard releases Create Agreement on a Tenancy without an Agreement',
  );
  assertEqual(
    await elementExistsXpath(
      sessionId,
      "//*[@data-luzerner-lease-form]",
    ),
    false,
    'Tenancy without a selected Agreement has no Luzerner editor owner',
  );

  await clickXpath(
    sessionId,
    "//a[contains(@class,'selection-card')][.//strong[normalize-space()='TEN-SETUP-BRW']]",
  );
  const replacementAgreementCard =
    "//a[contains(@class,'agreement-card')][.//span[normalize-space()='AGR-REPLACEMENT-BRW']]";
  await waitForElement(sessionId, 'xpath', replacementAgreementCard);
  await clickXpath(sessionId, replacementAgreementCard);
  await waitForElement(
    sessionId,
    'xpath',
    luzernerForm + "//h2[normalize-space()='Contract form data']",
  );
  assertEqual(
    await elementValueXpath(
      sessionId,
      luzernerForm +
        "//label[contains(normalize-space(.),'Besondere Bestimmungen')]//textarea",
    ),
    'Browser canonical Luzerner provision.',
    'Accepted owner change discards only the local Luzerner draft and reloads canonical data',
  );

  await typeXpath(
    sessionId,
    luzernerForm +
      "//label[contains(normalize-space(.),'Besondere Bestimmungen')]//textarea",
    'Browser canonical Luzerner provision revised.',
  );
  await executeScript(
    sessionId,
    'window.__portfolioFailNextLuzernerFormSaveAfterCommit = true; return true;',
  );
  await clickXpath(
    sessionId,
    luzernerForm +
      "//button[normalize-space()='Save Luzerner contract data']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    luzernerForm +
      "//*[contains(normalize-space(),'Saved state recovered at revision 2 after an uncertain acknowledgement.')]",
  );
  assertEqual(
    await executeScript(
      sessionId,
      'return window.__portfolioLuzernerFormPutCount || 0;',
    ),
    luzernerPutsBefore + 2,
    'Ambiguous Luzerner save recovers by exact reread without duplicate PUT',
  );
  assertEqual(
    await elementDisabledXpath(
      sessionId,
      luzernerForm +
        "//button[normalize-space()='Save Luzerner contract data']",
    ),
    true,
    'Recovered canonical Luzerner form is clean after exact reread',
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
    "//section[.//p[normalize-space()='Step 4 · Agreement Documents']]";
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
  await waitForElement(
    sessionId,
    'xpath',
    luzernerForm +
      "//button[normalize-space()='Store generated contract PDF' and not(@disabled)]",
  );
  assertEqual(
    await executeScript(
      sessionId,
      'return window.__portfolioLuzernerFinalDocumentCount || 0;',
    ),
    0,
    'Signed original does not occupy the generated-contract slot',
  );
  await clickXpath(
    sessionId,
    luzernerForm +
      "//button[normalize-space()='Store generated contract PDF' and not(@disabled)]",
  );
  await waitForElement(
    sessionId,
    'xpath',
    agreementDocumentsSection +
      "//*[normalize-space()='mietvertrag-AGR-REPLACEMENT-BRW.pdf']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    luzernerForm +
      "//button[normalize-space()='Generated contract PDF stored' and @disabled]",
  );
  assertEqual(
    await executeScript(
      sessionId,
      'return window.__portfolioLuzernerFinalDocumentCount || 0;',
    ),
    1,
    'Generated contract is stored exactly once alongside the signed original',
  );
  await waitForElement(
    sessionId,
    'xpath',
    agreementDocumentsSection +
      "//*[normalize-space()='portfolio-agreement-signed-original.pdf']",
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

  await clickXpath(sessionId, "//*[@data-unit-dossier-navigation]//a[.//span[normalize-space()='Meters']]");
  await waitForElement(
    sessionId,
    'xpath',
    "//form[@data-meter-form='create']",
  );

  const meterCreateForm = "//form[@data-meter-form='create']";
  await typeXpath(
    sessionId,
    meterCreateForm + "//input[@name='code']",
    'MTR-SETUP-BRW',
  );
  await typeXpath(
    sessionId,
    meterCreateForm + "//input[@name='serialNumber']",
    'SN-MTR-SETUP-001',
  );
  await typeXpath(
    sessionId,
    meterCreateForm + "//input[@name='label']",
    'Main electricity meter',
  );
  await setInputValueXpath(
    sessionId,
    meterCreateForm + "//input[@name='installedDate']",
    '2026-09-01',
  );
  await setInputValueXpath(
    sessionId,
    meterCreateForm + "//input[@name='installedTime']",
    '08:00',
  );
  await clickXpath(
    sessionId,
    meterCreateForm + "//button[normalize-space()='Create Meter']",
  );

  const createdMeterUrl =
    baseUrl +
    '/properties/' + setupPropertyId +
    '/units/' + setupUnitId +
    '?tab=meters&meterId=' + setupMeterId +
    '&asOf=2025-06-30';
  await waitForElement(
    sessionId,
    'xpath',
    "//a[contains(@class,'meter-card')][.//span[normalize-space()='MTR-SETUP-BRW']][.//h3[normalize-space()='Main electricity meter']][.//dt[normalize-space()='Utility']/following-sibling::dd[normalize-space()='Electricity']][.//dt[normalize-space()='Unit']/following-sibling::dd[normalize-space()='kwh']][.//dt[normalize-space()='Space']/following-sibling::dd[normalize-space()='Unit level']]",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//section[contains(@class,'meter-admin-panel')]//h2[normalize-space()='MTR-SETUP-BRW · Main electricity meter']",
  );
  assertEqual(
    await currentUrl(sessionId),
    createdMeterUrl,
    'Created Meter deep-link',
  );

  const meterLabelForm = "//form[@data-meter-form='label']";
  await clearXpath(
    sessionId,
    meterLabelForm + "//input[@name='label']",
  );
  await typeXpath(
    sessionId,
    meterLabelForm + "//input[@name='label']",
    'Main electricity register',
  );
  await executeScript(
    sessionId,
    'window.__portfolioHoldMeterMutation = true; return true;',
  );
  await clickXpath(
    sessionId,
    meterLabelForm + "//button[normalize-space()='Save label']",
  );
  await waitForScriptTruthy(
    sessionId,
    'return window.__portfolioPendingMeterMutation === true;',
    'held Meter label mutation',
  );
  await clickXpath(sessionId, "//*[@data-unit-dossier-navigation]//a[.//span[normalize-space()='Assets']]");
  await new Promise((resolve) => setTimeout(resolve, 150));
  assertEqual(
    await currentUrl(sessionId),
    createdMeterUrl,
    'Pending Meter write blocks tab navigation',
  );
  assertEqual(
    await executeScript(
      sessionId,
      'return window.__portfolioReleaseMeterMutation();',
    ),
    true,
    'Release held Meter label mutation',
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//section[contains(@class,'meter-admin-panel')]//h2[normalize-space()='MTR-SETUP-BRW · Main electricity register']",
  );

  const meterReadingForm = "//form[@data-meter-form='reading']";
  await typeXpath(
    sessionId,
    meterReadingForm + "//input[@name='value']",
    '100',
  );
  await setInputValueXpath(
    sessionId,
    meterReadingForm + "//input[@name='readDate']",
    '2026-10-01',
  );
  await setInputValueXpath(
    sessionId,
    meterReadingForm + "//input[@name='readTime']",
    '08:00',
  );
  await typeXpath(
    sessionId,
    meterReadingForm + "//input[@name='note']",
    'Move in reading',
  );
  await executeScript(
    sessionId,
    'window.__portfolioFailNextMeterReadingAfterCommit = true; return true;',
  );
  await clickXpath(
    sessionId,
    meterReadingForm + "//button[normalize-space()='Record Reading']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//article[contains(@class,'meter-reading-card')][.//span[normalize-space()='01.10.2026 08:00']][.//h4[normalize-space()='100 kwh']][.//p[normalize-space()='Move in reading']]",
  );

  const meterBoundaryForm = "//form[@data-meter-form='boundary']";
  await waitForElement(
    sessionId,
    'xpath',
    meterBoundaryForm +
      "//select[@name='readingId']/option[@value='" +
      setupMeterMoveInReadingId +
      "']",
  );
  await selectOptionXpath(
    sessionId,
    meterBoundaryForm + "//select[@name='readingId']",
    setupMeterMoveInReadingId,
  );
  await waitForElement(
    sessionId,
    'xpath',
    meterBoundaryForm +
      "//select[@name='tenancyId']/option[@value='" +
      setupTenancyId +
      "']",
  );
  await selectOptionXpath(
    sessionId,
    meterBoundaryForm + "//select[@name='tenancyId']",
    setupTenancyId,
  );
  await executeScript(
    sessionId,
    'window.__portfolioFailNextMeterBoundaryAfterCommit = true; return true;',
  );
  await clickXpath(
    sessionId,
    meterBoundaryForm + "//button[normalize-space()='Link boundary']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//article[contains(@class,'meter-reading-card')][.//span[normalize-space()='01.10.2026 08:00']]//li[normalize-space()='Move in · TEN-SETUP-BRW']",
  );

  await typeXpath(
    sessionId,
    meterReadingForm + "//input[@name='value']",
    '140',
  );
  await setInputValueXpath(
    sessionId,
    meterReadingForm + "//input[@name='readDate']",
    '2027-09-30',
  );
  await setInputValueXpath(
    sessionId,
    meterReadingForm + "//input[@name='readTime']",
    '08:00',
  );
  await typeXpath(
    sessionId,
    meterReadingForm + "//input[@name='note']",
    'Move out reading',
  );
  await clickXpath(
    sessionId,
    meterReadingForm + "//button[normalize-space()='Record Reading']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//article[contains(@class,'meter-reading-card')][.//span[normalize-space()='30.09.2027 08:00']][.//h4[normalize-space()='140 kwh']][.//p[normalize-space()='Move out reading']]",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//table//tr[.//td[normalize-space()='100.000000']][.//td[normalize-space()='140.000000']][.//td[normalize-space()='40 kwh']][.//td[normalize-space()='Continuous']]",
  );

  await selectOptionXpath(
    sessionId,
    meterBoundaryForm + "//select[@name='readingId']",
    setupMeterMoveOutReadingId,
  );
  await selectOptionXpath(
    sessionId,
    meterBoundaryForm + "//select[@name='boundaryType']",
    'move_out',
  );
  await waitForElement(
    sessionId,
    'xpath',
    meterBoundaryForm +
      "//select[@name='tenancyId']/option[@value='" +
      setupTenancyId +
      "']",
  );
  await selectOptionXpath(
    sessionId,
    meterBoundaryForm + "//select[@name='tenancyId']",
    setupTenancyId,
  );
  await clickXpath(
    sessionId,
    meterBoundaryForm + "//button[normalize-space()='Link boundary']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//article[contains(@class,'meter-reading-card')][.//span[normalize-space()='30.09.2027 08:00']]//li[normalize-space()='Move out · TEN-SETUP-BRW']",
  );

  const meterRetireForm = "//form[@data-meter-form='retire']";
  await setInputValueXpath(
    sessionId,
    meterRetireForm + "//input[@name='retiredDate']",
    '2027-10-01',
  );
  await setInputValueXpath(
    sessionId,
    meterRetireForm + "//input[@name='retiredTime']",
    '10:00',
  );
  await typeXpath(
    sessionId,
    meterRetireForm + "//input[@name='retirementReason']",
    'Meter replaced after tenancy',
  );
  await clickXpath(
    sessionId,
    meterRetireForm + "//button[normalize-space()='Retire Meter']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//section[contains(@class,'meter-admin-panel')]//span[contains(@class,'status-chip') and normalize-space()='retired']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//section[contains(@class,'meter-admin-panel')]//dd[normalize-space()='Meter replaced after tenancy']",
  );

  await typeXpath(
    sessionId,
    meterCreateForm + "//input[@name='code']",
    'MTR-WATER-BRW',
  );
  await typeXpath(
    sessionId,
    meterCreateForm + "//input[@name='serialNumber']",
    'SN-WATER-SETUP-001',
  );
  await selectOptionXpath(
    sessionId,
    meterCreateForm + "//label[starts-with(normalize-space(.),'Utility')]//select",
    'water',
  );
  await waitForElement(
    sessionId,
    'xpath',
    meterCreateForm + "//label[starts-with(normalize-space(.),'Measurement unit')]//select/option[@value='m3']",
  );
  await selectOptionXpath(
    sessionId,
    meterCreateForm + "//label[starts-with(normalize-space(.),'Measurement unit')]//select",
    'm3',
  );
  await typeXpath(
    sessionId,
    meterCreateForm + "//input[@name='label']",
    'Bathroom water meter',
  );
  await selectOptionXpath(
    sessionId,
    meterCreateForm + "//select[@name='spaceId']",
    setupBathroomSpaceId,
  );
  await setInputValueXpath(
    sessionId,
    meterCreateForm + "//input[@name='installedDate']",
    '2026-09-01',
  );
  await setInputValueXpath(
    sessionId,
    meterCreateForm + "//input[@name='installedTime']",
    '08:30',
  );
  await clickXpath(
    sessionId,
    meterCreateForm + "//button[normalize-space()='Create Meter']",
  );

  await waitForElement(
    sessionId,
    'xpath',
    "//a[contains(@class,'meter-card')][.//span[normalize-space()='MTR-WATER-BRW']][.//h3[normalize-space()='Bathroom water meter']][.//dt[normalize-space()='Serial']/following-sibling::dd[normalize-space()='SN-WATER-SETUP-001']][.//dt[normalize-space()='Utility']/following-sibling::dd[normalize-space()='Water']][.//dt[normalize-space()='Unit']/following-sibling::dd[normalize-space()='m3']][.//dt[normalize-space()='Space']/following-sibling::dd[normalize-space()='Bathroom']]",
  );
  assertEqual(
    await currentUrl(sessionId),
    baseUrl +
      '/properties/' + setupPropertyId +
      '/units/' + setupUnitId +
      '?tab=meters&meterId=' + setupWaterMeterId +
      '&asOf=2025-06-30',
    'Bathroom water Meter deep-link uses exact Unit owner',
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//section[contains(@class,'meter-admin-panel')]//h2[normalize-space()='MTR-WATER-BRW · Bathroom water meter']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//a[contains(@class,'meter-card')][.//span[normalize-space()='MTR-SETUP-BRW']][.//span[contains(@class,'status-chip') and normalize-space()='retired']][.//dt[normalize-space()='Space']/following-sibling::dd[normalize-space()='Unit level']]",
  );

  await clickXpath(sessionId, "//*[@data-unit-dossier-navigation]//a[.//span[normalize-space()='Tenancies']]");
  await waitForElement(
    sessionId,
    'xpath',
    "//article[.//span[normalize-space()='TEN-SETUP-BRW']]//span[contains(@class,'status-chip') and normalize-space()='ended']",
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

  await clickXpath(sessionId, "//*[@data-unit-dossier-navigation]//a[.//span[normalize-space()='Assets']]");
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
  await clickXpath(sessionId, "//*[@data-unit-dossier-navigation]//a[.//span[normalize-space()='Spaces']]");
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

  const warrantyCreateForm =
    "//form[@data-asset-service-form='warranty-create']";
  await waitForElement(sessionId, 'xpath', warrantyCreateForm);
  await selectOptionXpath(
    sessionId,
    warrantyCreateForm + "//select[@name='warrantyType']",
    'manufacturer',
  );
  await selectOptionXpath(
    sessionId,
    warrantyCreateForm + "//select[@name='providerPartyId']",
    historicalServiceProviderPartyId,
  );
  await typeXpath(
    sessionId,
    warrantyCreateForm + "//input[@name='reference']",
    'WARRANTY-BRW-001',
  );
  await setInputValueXpath(
    sessionId,
    warrantyCreateForm + "//input[@name='validFrom']",
    '2027-01-01',
  );
  await setInputValueXpath(
    sessionId,
    warrantyCreateForm + "//input[@name='validTo']",
    '2029-01-01',
  );
  await typeXpath(
    sessionId,
    warrantyCreateForm + "//textarea[@name='terms']",
    'Parts and labour coverage',
  );
  await executeScript(
    sessionId,
    'window.__portfolioFailNextWarrantyCreateAfterCommit = true; return true;',
  );
  await clickXpath(
    sessionId,
    warrantyCreateForm + "//button[normalize-space()='Record Warranty']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[contains(normalize-space(),'Warranty creation outcome is unconfirmed.')]",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//article[contains(@class,'asset-service-card')][.//strong[normalize-space()='Manufacturer']][.//*[contains(normalize-space(),'WARRANTY-BRW-001')]]",
  );

  const claimCreateForm =
    "//form[@data-asset-service-form='claim-create']";
  await setInputValueXpath(
    sessionId,
    claimCreateForm + "//input[@name='incidentOn']",
    '2027-09-10',
  );
  await typeXpath(
    sessionId,
    claimCreateForm + "//input[@name='description']",
    'Drive motor failed',
  );
  await clickXpath(
    sessionId,
    claimCreateForm + "//button[normalize-space()='Create Claim draft']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//div[contains(@class,'asset-service-claim')][.//strong[contains(normalize-space(),'Drive motor failed')]][.//span[contains(@class,'status-chip') and normalize-space()='draft']]",
  );

  const claimSubmitForm =
    "//form[@data-asset-service-form='claim-submit']";
  await typeXpath(
    sessionId,
    claimSubmitForm + "//input[@name='providerReference']",
    'CLAIM-BRW-001',
  );
  await clickXpath(
    sessionId,
    claimSubmitForm + "//button[normalize-space()='Submit Claim']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//div[contains(@class,'asset-service-claim')][.//strong[contains(normalize-space(),'Drive motor failed')]][.//span[contains(@class,'status-chip') and normalize-space()='submitted']]",
  );
  await clickXpath(
    sessionId,
    "//div[contains(@class,'asset-service-claim')][.//strong[contains(normalize-space(),'Drive motor failed')]]//button[normalize-space()='Approve Claim']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//div[contains(@class,'asset-service-claim')][.//strong[contains(normalize-space(),'Drive motor failed')]][.//span[contains(@class,'status-chip') and normalize-space()='approved']]",
  );
  await clickXpath(
    sessionId,
    "//div[contains(@class,'asset-service-claim')][.//strong[contains(normalize-space(),'Drive motor failed')]]//button[normalize-space()='Close Claim']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//div[contains(@class,'asset-service-claim')][.//strong[contains(normalize-space(),'Drive motor failed')]][.//span[contains(@class,'status-chip') and normalize-space()='closed']]",
  );

  const planCreateForm =
    "//form[@data-asset-service-form='plan-create']";
  await typeXpath(
    sessionId,
    planCreateForm + "//input[@name='name']",
    'Annual washer service',
  );
  await selectOptionXpath(
    sessionId,
    planCreateForm + "//select[@name='scheduleKind']",
    'recurring',
  );
  await setInputValueXpath(
    sessionId,
    planCreateForm + "//input[@name='firstDueOn']",
    '2028-01-15',
  );
  await typeXpath(
    sessionId,
    planCreateForm + "//input[@name='intervalMonths']",
    '12',
  );
  assertEqual(
    await elementExistsXpath(
      sessionId,
      planCreateForm +
        "//select[@name='providerPartyId']/option[@value='" +
        historicalServiceProviderPartyId +
        "']",
    ),
    false,
    'Inactive historical provider is not eligible for future ServicePlan policy',
  );
  await selectOptionXpath(
    sessionId,
    planCreateForm + "//select[@name='providerPartyId']",
    setupPartyId,
  );
  await typeXpath(
    sessionId,
    planCreateForm + "//textarea[@name='notes']",
    'Preventive service policy',
  );
  await clickXpath(
    sessionId,
    planCreateForm + "//button[normalize-space()='Create ServicePlan']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//article[contains(@class,'asset-service-card')][.//strong[normalize-space()='Annual washer service']][.//span[contains(@class,'status-chip') and normalize-space()='active']]",
  );

  await executeScript(
    sessionId,
    'window.__portfolioHoldAssetMutation = true; return true;',
  );
  await clickXpath(
    sessionId,
    "//article[contains(@class,'asset-service-card')][.//strong[normalize-space()='Annual washer service']]//button[normalize-space()='Pause Plan']",
  );
  await waitForScriptTruthy(
    sessionId,
    'return window.__portfolioPendingAssetMutation === true;',
    'held ServicePlan pause',
  );
  await clickXpath(sessionId, "//*[@data-unit-dossier-navigation]//a[.//span[normalize-space()='Meters']]");
  await new Promise((resolve) => setTimeout(resolve, 150));
  assertEqual(
    await currentUrl(sessionId),
    createdAssetUrl,
    'Pending ServicePlan write blocks Asset dossier navigation',
  );
  assertEqual(
    await executeScript(
      sessionId,
      'return window.__portfolioReleaseAssetMutation();',
    ),
    true,
    'Release held ServicePlan pause',
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//article[contains(@class,'asset-service-card')][.//strong[normalize-space()='Annual washer service']][.//span[contains(@class,'status-chip') and normalize-space()='paused']]",
  );
  await clickXpath(
    sessionId,
    "//article[contains(@class,'asset-service-card')][.//strong[normalize-space()='Annual washer service']]//button[normalize-space()='Reactivate Plan']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//article[contains(@class,'asset-service-card')][.//strong[normalize-space()='Annual washer service']][.//span[contains(@class,'status-chip') and normalize-space()='active']]",
  );

  const serviceEventCreateForm =
    "//form[@data-asset-service-form='event-create']";
  await selectOptionXpath(
    sessionId,
    serviceEventCreateForm + "//select[@name='eventType']",
    'warranty_service',
  );
  await setInputValueXpath(
    sessionId,
    serviceEventCreateForm + "//input[@name='performedDate']",
    '2027-09-15',
  );
  await setInputValueXpath(
    sessionId,
    serviceEventCreateForm + "//input[@name='performedTime']",
    '08:30',
  );
  await selectOptionXpath(
    sessionId,
    serviceEventCreateForm + "//select[@name='servicePlanId']",
    setupServicePlanId,
  );
  await selectOptionXpath(
    sessionId,
    serviceEventCreateForm + "//select[@name='warrantyClaimId']",
    setupWarrantyClaimId,
  );
  await selectOptionXpath(
    sessionId,
    serviceEventCreateForm + "//select[@name='providerPartyId']",
    historicalServiceProviderPartyId,
  );
  await typeXpath(
    sessionId,
    serviceEventCreateForm + "//textarea[@name='description']",
    'Warranty motor replacement completed',
  );
  await typeXpath(
    sessionId,
    serviceEventCreateForm + "//input[@name='reference']",
    'SERVICE-BRW-001',
  );
  await clickXpath(
    sessionId,
    serviceEventCreateForm + "//button[normalize-space()='Record ServiceEvent']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//article[contains(@class,'maintenance-service-card')][.//p[normalize-space()='Warranty motor replacement completed']][.//small[contains(normalize-space(),'plan Annual washer service') and contains(normalize-space(),'warranty claim closed')]]",
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
    "//article[contains(@class,'asset-history-card')][.//strong[normalize-space()='Asset created']][.//span[contains(normalize-space(),'01.10.2027 10:00')]]",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//article[contains(@class,'asset-history-card')][.//strong[normalize-space()='Moved']][.//span[contains(normalize-space(),'current')]][.//dd[normalize-space()='Moved into bedroom']]",
  );

  await clickXpath(sessionId, "//*[@data-unit-dossier-navigation]//a[.//span[normalize-space()='Maintenance']]");
  await waitForElement(
    sessionId,
    'xpath',
    "//form[@data-maintenance-form='create-issue']",
  );

  const issueCreateForm =
    "//form[@data-maintenance-form='create-issue']";
  await typeXpath(
    sessionId,
    issueCreateForm + "//input[@name='code']",
    'ISS-SETUP-BRW',
  );
  await typeXpath(
    sessionId,
    issueCreateForm + "//input[@name='title']",
    'Washer leak',
  );
  await typeXpath(
    sessionId,
    issueCreateForm + "//textarea[@name='description']",
    'Leak observed during handover',
  );
  await selectOptionXpath(
    sessionId,
    issueCreateForm + "//select[@name='assetId']",
    setupAssetId,
  );
  await waitForElement(
    sessionId,
    'xpath',
    issueCreateForm +
      "//select[@name='spaceId']/option[@value='" +
      setupSpaceId +
      "']",
  );
  await selectOptionXpath(
    sessionId,
    issueCreateForm + "//select[@name='inspectionFindingId']",
    setupInspectionFindingId,
  );
  await selectOptionXpath(
    sessionId,
    issueCreateForm + "//select[not(@name='assetId') and not(@name='spaceId') and not(@name='inspectionFindingId')]",
    'high',
  );
  await executeScript(
    sessionId,
    'window.__portfolioFailNextMaintenanceIssueCreateAfterCommit = true; return true;',
  );
  await clickXpath(
    sessionId,
    issueCreateForm + "//button[normalize-space()='Create Issue']",
  );

  const maintenanceIssueUrl =
    baseUrl +
    '/properties/' + setupPropertyId +
    '/units/' + setupUnitId +
    '?tab=maintenance&issueId=' + setupMaintenanceIssueId +
    '&asOf=2025-06-30';
  await waitForElement(
    sessionId,
    'xpath',
    "//section[contains(@class,'maintenance-admin-panel')]//h2[normalize-space()='ISS-SETUP-BRW · Washer leak']",
  );
  assertEqual(
    await currentUrl(sessionId),
    maintenanceIssueUrl,
    'Created Maintenance Issue deep-link',
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//section[contains(@class,'maintenance-admin-panel')]//dl[contains(@class,'maintenance-scope-grid')][.//dt[normalize-space()='Space']/following-sibling::dd[normalize-space()='BED-SETUP']][.//dt[normalize-space()='Asset']/following-sibling::dd[normalize-space()='AST-SETUP-BRW']][.//dt[normalize-space()='Inspection Finding']/following-sibling::dd[contains(normalize-space(),'INS-MAINT-BRW') and contains(normalize-space(),'Washer leak observed')]]",
  );

  const issueUpdateForm =
    "//form[@data-maintenance-form='issue-update']";
  await clearXpath(
    sessionId,
    issueUpdateForm + "//input[@name='title']",
  );
  await typeXpath(
    sessionId,
    issueUpdateForm + "//input[@name='title']",
    'Washer leak - urgent',
  );
  await selectOptionXpath(
    sessionId,
    issueUpdateForm + "//select[@name='priority']",
    'urgent',
  );
  await clickXpath(
    sessionId,
    issueUpdateForm + "//button[normalize-space()='Save Issue']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//section[contains(@class,'maintenance-admin-panel')]//h2[normalize-space()='ISS-SETUP-BRW · Washer leak - urgent']",
  );

  const workOrderCreateForm =
    "//form[@data-maintenance-form='create-work-order']";
  await typeXpath(
    sessionId,
    workOrderCreateForm + "//input[@name='code']",
    'WO-SETUP-BRW',
  );
  await typeXpath(
    sessionId,
    workOrderCreateForm + "//input[@name='title']",
    'Repair washer',
  );
  await typeXpath(
    sessionId,
    workOrderCreateForm + "//textarea[@name='description']",
    'Diagnose and repair leak',
  );
  await executeScript(
    sessionId,
    'window.__portfolioFailNextMaintenanceWorkOrderCreateAfterCommit = true; return true;',
  );
  await clickXpath(
    sessionId,
    workOrderCreateForm +
      "//button[normalize-space()='Create WorkOrder']",
  );

  const maintenanceWorkOrderUrl =
    baseUrl +
    '/properties/' + setupPropertyId +
    '/units/' + setupUnitId +
    '?tab=maintenance&issueId=' + setupMaintenanceIssueId +
    '&workOrderId=' + setupMaintenanceWorkOrderId +
    '&asOf=2025-06-30';
  await waitForElement(
    sessionId,
    'xpath',
    "//section[contains(@class,'maintenance-admin-panel')]//h3[normalize-space()='WO-SETUP-BRW · Repair washer']",
  );
  assertEqual(
    await currentUrl(sessionId),
    maintenanceWorkOrderUrl,
    'Created WorkOrder deep-link',
  );

  const workOrderUpdateForm =
    "//form[@data-maintenance-form='work-order-update']";
  await clearXpath(
    sessionId,
    workOrderUpdateForm + "//input[@name='title']",
  );
  await typeXpath(
    sessionId,
    workOrderUpdateForm + "//input[@name='title']",
    'Repair leaking washer',
  );
  await clickXpath(
    sessionId,
    workOrderUpdateForm +
      "//button[normalize-space()='Save WorkOrder']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//section[contains(@class,'maintenance-admin-panel')]//h3[normalize-space()='WO-SETUP-BRW · Repair leaking washer']",
  );

  const assignForm = "//form[@data-maintenance-form='assign']";
  await selectOptionXpath(
    sessionId,
    assignForm + "//select[@name='partyId']",
    setupPartyId,
  );
  await executeScript(
    sessionId,
    'window.__portfolioHoldMaintenanceMutation = true; return true;',
  );
  await clickXpath(
    sessionId,
    assignForm + "//button[normalize-space()='Assign WorkOrder']",
  );
  await waitForScriptTruthy(
    sessionId,
    'return window.__portfolioPendingMaintenanceMutation === true;',
    'held Maintenance assignment',
  );
  await clickXpath(sessionId, "//*[@data-unit-dossier-navigation]//a[.//span[normalize-space()='Assets']]");
  await new Promise((resolve) => setTimeout(resolve, 150));
  assertEqual(
    await currentUrl(sessionId),
    maintenanceWorkOrderUrl,
    'Pending Maintenance write blocks dossier navigation',
  );
  assertEqual(
    await executeScript(
      sessionId,
      'return window.__portfolioReleaseMaintenanceMutation();',
    ),
    true,
    'Release held Maintenance assignment',
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//section[contains(@class,'maintenance-admin-panel')]//span[contains(@class,'status-chip') and normalize-space()='assigned']",
  );

  await clickXpath(
    sessionId,
    "//section[contains(@class,'maintenance-admin-panel')]//button[normalize-space()='Start WorkOrder']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//section[contains(@class,'maintenance-admin-panel')]//span[contains(@class,'status-chip') and normalize-space()='in_progress']",
  );

  const serviceForm =
    "//form[@data-maintenance-form='record-service']";
  await selectOptionXpath(
    sessionId,
    serviceForm + "//select[@name='eventType']",
    'repair',
  );
  await selectOptionXpath(
    sessionId,
    serviceForm + "//select[@name='providerPartyId']",
    setupPartyId,
  );
  await setInputValueXpath(
    sessionId,
    serviceForm + "//input[@name='performedDate']",
    '2027-10-01',
  );
  await setInputValueXpath(
    sessionId,
    serviceForm + "//input[@name='performedTime']",
    '11:32',
  );
  await typeXpath(
    sessionId,
    serviceForm + "//input[@name='reference']",
    'SRV-SETUP-BRW',
  );
  await typeXpath(
    sessionId,
    serviceForm + "//textarea[@name='description']",
    'Replaced leaking inlet hose',
  );
  await executeScript(
    sessionId,
    'window.__portfolioFailNextServiceEventCreateAfterCommit = true; return true;',
  );
  await clickXpath(
    sessionId,
    serviceForm +
      "//button[normalize-space()='Record + link ServiceEvent']",
  );

  await waitForElement(
    sessionId,
    'xpath',
    "//article[contains(@class,'maintenance-service-card')][.//strong[normalize-space()='Repair']][.//p[normalize-space()='Replaced leaking inlet hose']][.//small[normalize-space()='Unlinked']]",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//form[@data-maintenance-form='link-service']//option[@value='" + setupServiceEventId + "']",
  );

  const existingLinkForm =
    "//form[@data-maintenance-form='link-service']";
  await selectOptionXpath(
    sessionId,
    existingLinkForm + "//select[@name='serviceEventId']",
    setupServiceEventId,
  );
  await executeScript(
    sessionId,
    'window.__portfolioFailNextServiceEventLink = true; return true;',
  );
  await clickXpath(
    sessionId,
    existingLinkForm + "//button[normalize-space()='Link ServiceEvent']",
  );

  await waitForElement(
    sessionId,
    'xpath',
    "//article[contains(@class,'maintenance-service-card')][.//strong[normalize-space()='Repair']][.//p[normalize-space()='Replaced leaking inlet hose']][.//small[normalize-space()='Linked to selected WorkOrder']]",
  );
  assertEqual(
    await elementExistsXpath(
      sessionId,
      "//form[@data-maintenance-form='link-service']//option[@value='" + setupServiceEventId + "']",
    ),
    false,
    'Committed ServiceEvent link is recovered after lost acknowledgement',
  );

  await clickXpath(
    sessionId,
    "//section[contains(@class,'maintenance-admin-panel')]//button[normalize-space()='Complete WorkOrder']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//section[contains(@class,'maintenance-admin-panel')]//span[contains(@class,'status-chip') and normalize-space()='completed']",
  );
  await clickXpath(
    sessionId,
    "//section[contains(@class,'maintenance-admin-panel')]//button[normalize-space()='Resolve Issue']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//section[contains(@class,'maintenance-admin-panel')]//span[contains(@class,'status-chip') and normalize-space()='resolved']",
  );

  await navigateWithPopState(
    sessionId,
    '/properties/' + setupPropertyId +
      '/units/' + setupUnitId +
      '?tab=assets&assetId=' + setupAssetId +
      '&asOf=2025-06-30',
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//section[contains(@class,'asset-admin-panel')]//h2[normalize-space()='AST-SETUP-BRW · Setup Washer 8 kg']",
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
    'window.__portfolioConcurrentAssetMoveAcrossProperty = true; return true;',
  );
  await clickXpath(
    sessionId,
    assetMoveForm + "//button[normalize-space()='Move Asset']",
  );

  await waitForElement(
    sessionId,
    'xpath',
    "//h1[normalize-space()='Unit 9C']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//a[contains(@class,'asset-card')][.//span[normalize-space()='AST-SETUP-BRW']][.//dd[normalize-space()='Recovery Room']]",
  );
  const recoveryAssetUrl =
    baseUrl +
    '/properties/' + setupRecoveryPropertyId +
    '/units/' + setupRecoveryUnitId +
    '?tab=assets&assetId=' + setupAssetId +
    '&asOf=2025-06-30';
  assertEqual(
    await currentUrl(sessionId),
    recoveryAssetUrl,
    'VERSION_CONFLICT recovery navigates to canonical cross-Property owner',
  );
  assertEqual(
    await elementExistsXpath(
      sessionId,
      "//*[normalize-space()='Route identity failed']",
    ),
    false,
    'Cross-Property recovery does not construct an invalid Property/Unit route',
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//article[contains(@class,'asset-history-card')][.//strong[normalize-space()='Moved']][.//span[contains(normalize-space(),'01.10.2027 11:00') and contains(normalize-space(),'01.10.2027 12:00')]][.//dd[normalize-space()='Moved into bedroom']]",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//article[contains(@class,'asset-history-card')][.//strong[normalize-space()='Moved']][.//span[contains(normalize-space(),'current')]][.//dt[normalize-space()='Property']/following-sibling::dd[normalize-space()='Current property']][.//dt[normalize-space()='Unit']/following-sibling::dd[normalize-space()='UNIT-RECOVERY-BRW']][.//dt[normalize-space()='Space']/following-sibling::dd[normalize-space()='Assigned space']][.//dd[normalize-space()='Concurrent cross-Property move']]",
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
    "//a[contains(@class,'asset-card')][.//span[normalize-space()='AST-REPLACEMENT-BRW']][.//h3[normalize-space()='Setup Washer Replacement']]",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//section[contains(@class,'asset-admin-panel')]//h2[normalize-space()='AST-REPLACEMENT-BRW · Setup Washer Replacement']",
  );
  assertEqual(
    await currentUrl(sessionId),
    baseUrl +
      '/properties/' + setupRecoveryPropertyId +
      '/units/' + setupRecoveryUnitId +
      '?tab=assets&assetId=' + setupReplacementAssetId +
      '&asOf=2025-06-30',
    'Replacement successor deep-link uses canonical Property owner',
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//article[contains(@class,'asset-history-card')][.//strong[normalize-space()='Replacement created']][.//span[contains(normalize-space(),'current')]][.//dt[normalize-space()='Property']/following-sibling::dd[normalize-space()='Current property']][.//dt[normalize-space()='Unit']/following-sibling::dd[normalize-space()='UNIT-RECOVERY-BRW']][.//dt[normalize-space()='Space']/following-sibling::dd[normalize-space()='Assigned space']]",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//section[contains(@class,'asset-admin-panel')]//dl[contains(@class,'detail-list')]//dd[normalize-space()='Linked predecessor asset']",
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
      '?tab=maintenance&issueId=' + setupMaintenanceIssueId +
      '&asOf=2025-06-30',
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//section[contains(@class,'maintenance-admin-panel')]//h2[normalize-space()='ISS-SETUP-BRW · Washer leak - urgent']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//section[contains(@class,'maintenance-admin-panel')]//span[contains(@class,'status-chip') and normalize-space()='resolved']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//section[contains(@class,'maintenance-admin-panel')]//dl[contains(@class,'maintenance-scope-grid')][.//dt[normalize-space()='Property']/following-sibling::dd[normalize-space()='Current property']][.//dt[normalize-space()='Unit']/following-sibling::dd[normalize-space()='Current unit']][.//dt[normalize-space()='Space']/following-sibling::dd[normalize-space()='BED-SETUP']][.//dt[normalize-space()='Asset']/following-sibling::dd[normalize-space()='AST-SETUP-BRW']]",
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

  const realCompanyAssetCreateForm = "//form[@data-asset-form='create']";
  await typeXpath(
    sessionId,
    realCompanyAssetCreateForm + "//input[@name='code']",
    'AST-OVEN-BRW',
  );
  await typeXpath(
    sessionId,
    realCompanyAssetCreateForm + "//input[@name='name']",
    'Kitchen Oven',
  );
  await typeXpath(
    sessionId,
    realCompanyAssetCreateForm + "//input[@name='manufacturer']",
    'Siemens',
  );
  await typeXpath(
    sessionId,
    realCompanyAssetCreateForm + "//input[@name='model']",
    'HB578ABS0',
  );
  await selectOptionXpath(
    sessionId,
    realCompanyAssetCreateForm + "//select[@name='spaceId']",
    setupKitchenSpaceId,
  );
  await typeXpath(
    sessionId,
    realCompanyAssetCreateForm +
      "//div[contains(@class,'asset-identifier-row')]//input[@placeholder='Serial / inventory tag']",
    'SN-OVEN-001',
  );
  await clickXpath(
    sessionId,
    realCompanyAssetCreateForm + "//button[normalize-space()='Create Asset']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//a[contains(@class,'asset-card')][.//span[normalize-space()='AST-OVEN-BRW']][.//h3[normalize-space()='Kitchen Oven']][.//dd[normalize-space()='Kitchen']][.//dd[normalize-space()='SN-OVEN-001']]",
  );
  assertEqual(
    await currentUrl(sessionId),
    baseUrl +
      '/properties/' + setupPropertyId +
      '/units/' + setupUnitId +
      '?tab=assets&assetId=' + setupOvenAssetId +
      '&asOf=2025-06-30',
    'Kitchen Oven deep-link uses exact Unit owner',
  );

  await typeXpath(
    sessionId,
    realCompanyAssetCreateForm + "//input[@name='code']",
    'AST-SMOKE-BRW',
  );
  await typeXpath(
    sessionId,
    realCompanyAssetCreateForm + "//input[@name='name']",
    'Entrance Smoke Detector',
  );
  await typeXpath(
    sessionId,
    realCompanyAssetCreateForm + "//input[@name='manufacturer']",
    'Ei Electronics',
  );
  await typeXpath(
    sessionId,
    realCompanyAssetCreateForm + "//input[@name='model']",
    'Ei650',
  );
  await selectOptionXpath(
    sessionId,
    realCompanyAssetCreateForm + "//select[@name='spaceId']",
    setupHallSpaceId,
  );
  await typeXpath(
    sessionId,
    realCompanyAssetCreateForm +
      "//div[contains(@class,'asset-identifier-row')]//input[@placeholder='Serial / inventory tag']",
    'SD-HALL-001',
  );
  await clickXpath(
    sessionId,
    realCompanyAssetCreateForm + "//button[normalize-space()='Create Asset']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//a[contains(@class,'asset-card')][.//span[normalize-space()='AST-SMOKE-BRW']][.//h3[normalize-space()='Entrance Smoke Detector']][.//dd[normalize-space()='Entrance Hall']][.//dd[normalize-space()='SD-HALL-001']]",
  );
  assertEqual(
    await currentUrl(sessionId),
    baseUrl +
      '/properties/' + setupPropertyId +
      '/units/' + setupUnitId +
      '?tab=assets&assetId=' + setupSmokeDetectorAssetId +
      '&asOf=2025-06-30',
    'Smoke Detector deep-link uses exact Unit owner',
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//a[contains(@class,'asset-card')][.//span[normalize-space()='AST-OVEN-BRW']][.//dd[normalize-space()='Kitchen']]",
  );

  await clickXpath(sessionId, "//*[@data-unit-dossier-navigation]//a[.//span[normalize-space()='Maintenance']]");
  await waitForElement(
    sessionId,
    'xpath',
    "//form[@data-maintenance-form='create-issue']",
  );

  const realCompanyIssueCreateForm =
    "//form[@data-maintenance-form='create-issue']";

  await typeXpath(
    sessionId,
    realCompanyIssueCreateForm + "//input[@name='code']",
    'ISS-OVEN-BRW',
  );
  await typeXpath(
    sessionId,
    realCompanyIssueCreateForm + "//input[@name='title']",
    'Oven not heating',
  );
  await typeXpath(
    sessionId,
    realCompanyIssueCreateForm + "//textarea[@name='description']",
    'Tenant reported that the oven no longer reaches temperature',
  );
  await selectOptionXpath(
    sessionId,
    realCompanyIssueCreateForm + "//select[@name='assetId']",
    setupOvenAssetId,
  );
  await clickXpath(
    sessionId,
    realCompanyIssueCreateForm + "//button[normalize-space()='Create Issue']",
  );

  const ovenIssueCard =
    "//a[contains(@class,'maintenance-issue-card')][.//span[normalize-space()='ISS-OVEN-BRW']]";
  await waitForElement(sessionId, 'xpath', ovenIssueCard);
  await waitForElement(
    sessionId,
    'xpath',
    "//section[contains(@class,'maintenance-admin-panel')]//h2[normalize-space()='ISS-OVEN-BRW · Oven not heating']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//section[contains(@class,'maintenance-admin-panel')]//dl[contains(@class,'maintenance-scope-grid')][.//dt[normalize-space()='Space']/following-sibling::dd[normalize-space()='KIT-SETUP']][.//dt[normalize-space()='Asset']/following-sibling::dd[normalize-space()='AST-OVEN-BRW']]",
  );
  assertEqual(
    await currentUrl(sessionId),
    baseUrl +
      '/properties/' + setupPropertyId +
      '/units/' + setupUnitId +
      '?tab=maintenance&issueId=' + setupOvenMaintenanceIssueId +
      '&asOf=2025-06-30',
    'Kitchen Oven Maintenance Issue deep-link',
  );

  let realCompanyWorkOrderCreateForm =
    "//form[@data-maintenance-form='create-work-order']";
  await typeXpath(
    sessionId,
    realCompanyWorkOrderCreateForm + "//input[@name='code']",
    'WO-OVEN-BRW',
  );
  await typeXpath(
    sessionId,
    realCompanyWorkOrderCreateForm + "//input[@name='title']",
    'Diagnose oven heating',
  );
  await clickXpath(
    sessionId,
    realCompanyWorkOrderCreateForm +
      "//button[normalize-space()='Create WorkOrder']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//button[contains(@class,'maintenance-order-card')][.//span[normalize-space()='WO-OVEN-BRW']][.//strong[normalize-space()='Diagnose oven heating']]",
  );
  assertEqual(
    await currentUrl(sessionId),
    baseUrl +
      '/properties/' + setupPropertyId +
      '/units/' + setupUnitId +
      '?tab=maintenance&issueId=' + setupOvenMaintenanceIssueId +
      '&workOrderId=' + setupOvenMaintenanceWorkOrderId +
      '&asOf=2025-06-30',
    'Kitchen Oven WorkOrder deep-link',
  );

  await typeXpath(
    sessionId,
    realCompanyIssueCreateForm + "//input[@name='code']",
    'ISS-SMOKE-BRW',
  );
  await typeXpath(
    sessionId,
    realCompanyIssueCreateForm + "//input[@name='title']",
    'Smoke detector battery alert',
  );
  await typeXpath(
    sessionId,
    realCompanyIssueCreateForm + "//textarea[@name='description']",
    'Entrance Hall detector emits a recurring battery warning',
  );
  await selectOptionXpath(
    sessionId,
    realCompanyIssueCreateForm + "//select[@name='assetId']",
    setupSmokeDetectorAssetId,
  );
  await clickXpath(
    sessionId,
    realCompanyIssueCreateForm + "//button[normalize-space()='Create Issue']",
  );

  const smokeIssueCard =
    "//a[contains(@class,'maintenance-issue-card')][.//span[normalize-space()='ISS-SMOKE-BRW']]";
  await waitForElement(sessionId, 'xpath', smokeIssueCard);
  await waitForElement(
    sessionId,
    'xpath',
    "//section[contains(@class,'maintenance-admin-panel')]//h2[normalize-space()='ISS-SMOKE-BRW · Smoke detector battery alert']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//section[contains(@class,'maintenance-admin-panel')]//dl[contains(@class,'maintenance-scope-grid')][.//dt[normalize-space()='Space']/following-sibling::dd[normalize-space()='HALL-SETUP']][.//dt[normalize-space()='Asset']/following-sibling::dd[normalize-space()='AST-SMOKE-BRW']]",
  );
  assertEqual(
    await currentUrl(sessionId),
    baseUrl +
      '/properties/' + setupPropertyId +
      '/units/' + setupUnitId +
      '?tab=maintenance&issueId=' + setupSmokeMaintenanceIssueId +
      '&asOf=2025-06-30',
    'Smoke Detector Maintenance Issue deep-link',
  );

  realCompanyWorkOrderCreateForm =
    "//form[@data-maintenance-form='create-work-order']";
  await typeXpath(
    sessionId,
    realCompanyWorkOrderCreateForm + "//input[@name='code']",
    'WO-SMOKE-BRW',
  );
  await typeXpath(
    sessionId,
    realCompanyWorkOrderCreateForm + "//input[@name='title']",
    'Inspect smoke detector',
  );
  await clickXpath(
    sessionId,
    realCompanyWorkOrderCreateForm +
      "//button[normalize-space()='Create WorkOrder']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//button[contains(@class,'maintenance-order-card')][.//span[normalize-space()='WO-SMOKE-BRW']][.//strong[normalize-space()='Inspect smoke detector']]",
  );
  assertEqual(
    await currentUrl(sessionId),
    baseUrl +
      '/properties/' + setupPropertyId +
      '/units/' + setupUnitId +
      '?tab=maintenance&issueId=' + setupSmokeMaintenanceIssueId +
      '&workOrderId=' + setupSmokeMaintenanceWorkOrderId +
      '&asOf=2025-06-30',
    'Smoke Detector WorkOrder deep-link',
  );

  await navigateWithPopState(
    sessionId,
    '/properties/' + setupPropertyId +
      '/units/' + setupUnitId +
      '?tab=maintenance&issueId=' + setupOvenMaintenanceIssueId +
      '&asOf=2025-06-30',
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//section[contains(@class,'maintenance-admin-panel')]//h2[normalize-space()='ISS-OVEN-BRW · Oven not heating']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//button[contains(@class,'maintenance-order-card')][.//span[normalize-space()='WO-OVEN-BRW']]",
  );
  assertEqual(
    await elementExistsXpath(
      sessionId,
      "//button[contains(@class,'maintenance-order-card')][.//span[normalize-space()='WO-SMOKE-BRW']]",
    ),
    false,
    'Smoke WorkOrder cannot bleed into Kitchen Oven Issue',
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//a[contains(@class,'maintenance-issue-card')][.//span[normalize-space()='ISS-SETUP-BRW']][.//span[contains(@class,'status-chip') and normalize-space()='resolved']]",
  );
  await waitForElement(
    sessionId,
    'xpath',
    ovenIssueCard + "//span[contains(@class,'status-chip') and normalize-space()='open']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    smokeIssueCard + "//span[contains(@class,'status-chip') and normalize-space()='open']",
  );

  await clickXpath(sessionId, "//*[@data-unit-dossier-navigation]//a[.//span[normalize-space()='Spaces']]");
  await waitForElement(
    sessionId,
    'xpath',
    "//article[contains(@class,'space-card')][.//h3[normalize-space()='Setup Bedroom']]",
  );
  for (const spaceName of [
    'Entrance Hall',
    'Living Room',
    'Kitchen',
    'Bathroom',
  ]) {
    await waitForElement(
      sessionId,
      'xpath',
      "//article[contains(@class,'space-card')][.//h3[normalize-space()='" +
        spaceName +
        "']]",
    );
  }

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
    "//h1[normalize-space()='Portfolio']",
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
  await waitForElement(
    sessionId,
    'xpath',
    "//p[contains(@class,'header-note') and contains(normalize-space(),'Reporting context remains 30.06.2025')]",
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
  await waitForElement(
    sessionId,
    'xpath',
    "//*[@data-unit-dossier-navigation]//*[@data-dossier-nav-group='occupancy'][.//strong[normalize-space()='Occupancy']][.//a[.//span[normalize-space()='Tenancies']]][.//a[.//span[normalize-space()='Contracts']]]",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[@data-unit-dossier-navigation]//*[@data-dossier-nav-group='operations'][.//strong[normalize-space()='Operations']][.//a[.//span[normalize-space()='Inspections']]][.//a[.//span[normalize-space()='Maintenance']]]",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[@data-unit-dossier-navigation]//*[@data-dossier-nav-group='unit'][.//strong[normalize-space()='Unit & equipment']][.//a[.//span[normalize-space()='Spaces']]][.//a[.//span[normalize-space()='Assets']]][.//a[.//span[normalize-space()='Keys']]][.//a[.//span[normalize-space()='Meters']]]",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[@data-unit-dossier-navigation]//*[@data-dossier-nav-group='records'][.//strong[normalize-space()='Records']][.//a[.//span[normalize-space()='Timeline']]][.//a[.//span[normalize-space()='Documents']]]",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[@data-unit-dossier-context][contains(normalize-space(),'Unit dossier')][contains(normalize-space(),'Overview')]",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//article[contains(@class,'metric-card-primary')]//small[normalize-space()='as of 30.06.2025']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[@data-unit-command-center][.//h2[normalize-space()='What needs attention']]",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[@data-unit-action-inspection][.//h3[normalize-space()='INS-BRW-001']][contains(normalize-space(),'Draft')][contains(normalize-space(),'scheduled 30.06.2025')]",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[@data-unit-command-center]//a[normalize-space()='Prepare Inspection']",
  );
  await clickXpath(
    sessionId,
    "//*[@data-unit-action-inspection][.//h3[normalize-space()='INS-BRW-001']]//a[normalize-space()='Prepare Inspection']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//section[contains(@class,'inspection-editor')]//h2[normalize-space()='INS-BRW-001']",
  );
  const overviewInspectionUrl =
    baseUrl + '/properties/' + propertyId +
    '/units/' + unitId +
    '?tab=inspections&inspectionId=' + inspectionId +
    '&sectionInstanceId=' + inspectionSectionInstanceId +
    '&asOf=2025-06-30';
  assertEqual(
    await currentUrl(sessionId),
    overviewInspectionUrl,
    'Unit command center opens exact canonical Inspection',
  );
  await clickXpath(
    sessionId,
    "//*[@data-unit-dossier-navigation]//a[.//span[normalize-space()='Overview']]",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[@data-unit-command-center]",
  );
  assertEqual(
    await currentUrl(sessionId),
    unitOverviewUrl,
    'Command-center return restores Unit Overview route',
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

  await clickXpath(sessionId, "//*[@data-unit-dossier-navigation]//a[.//span[normalize-space()='Contracts']]");
  await waitForElement(
    sessionId,
    'xpath',
    "//h2[normalize-space()='Select the lifecycle record']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[@data-dossier-nav-group='occupancy' and contains(@class,'dossier-nav-group-active')]//a[contains(@class,'dossier-nav-link-active')][.//span[normalize-space()='Contracts']]",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[@data-unit-dossier-context][contains(normalize-space(),'Unit dossier')][contains(normalize-space(),'Occupancy')][contains(normalize-space(),'Contracts')]",
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
    "//section[.//p[normalize-space()='Step 4 · Agreement Documents']]//h2[normalize-space()='AGR-BRW']",
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
  await waitForElement(
    sessionId,
    'xpath',
    "//*[@data-unit-dossier-context][contains(normalize-space(),'Unit dossier')][contains(normalize-space(),'Occupancy')][contains(normalize-space(),'Contracts')][contains(normalize-space(),'Agreement detail')]",
  );
  assertEqual(
    await elementExistsXpath(
      sessionId,
      "//*[@data-unit-dossier-context][contains(normalize-space(),'" + agreementId + "')]",
    ),
    false,
    'Dossier context never exposes internal Agreement UUID',
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
    "//section[.//p[normalize-space()='Step 6 · Amendment Documents']]//h2[normalize-space()='AMD-BRW']",
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
    "//section[.//p[normalize-space()='Step 6 · Amendment Documents']]//h2[normalize-space()='AMD-BRW']",
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

  await navigateWithPopState(
    sessionId,
    '/properties/' + orchestrationPropertyId +
      '/units/' + orchestrationUnitId +
      '?tab=inspections&asOf=2025-06-30',
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//form[@data-inspection-form='create']",
  );

  const inspectionCreateForm =
    "//form[@data-inspection-form='create']";
  await typeXpath(
    sessionId,
    inspectionCreateForm + "//input[@name='code']",
    'INS-ORCH-BRW',
  );
  await selectOptionXpath(
    sessionId,
    inspectionCreateForm + "//select[@name='schemaVersionId']",
    inspectionSchemaVersionId,
  );
  await selectOptionXpath(
    sessionId,
    inspectionCreateForm + "//select[@name='assignedToUserId']",
    inspectionUserId,
  );
  await setInputValueXpath(
    sessionId,
    inspectionCreateForm + "//input[@name='scheduledFor']",
    '2027-10-02',
  );
  await executeScript(
    sessionId,
    'window.__portfolioFailNextInspectionCreateAfterCommit = true; return true;',
  );
  await clickXpath(
    sessionId,
    inspectionCreateForm +
      "//button[normalize-space()='Create Inspection']",
  );

  const orchestrationInspectionUrl =
    baseUrl +
    '/properties/' + orchestrationPropertyId +
    '/units/' + orchestrationUnitId +
    '?tab=inspections&inspectionId=' +
    setupOrchestrationInspectionId +
    '&sectionInstanceId=' + setupOrchestrationInspectionSectionInstanceId +
    '&asOf=2025-06-30';
  await waitForElement(
    sessionId,
    'xpath',
    "//section[contains(@class,'inspection-editor')]//h2[normalize-space()='INS-ORCH-BRW']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[contains(normalize-space(),'creation was committed and recovered')]",
  );
  assertEqual(
    await currentUrl(sessionId),
    orchestrationInspectionUrl,
    'Lost Inspection create acknowledgement recovers canonical deep-link',
  );

  const orchestrationForm =
    "//form[@data-inspection-form='orchestration']";
  await setInputValueXpath(
    sessionId,
    orchestrationForm + "//input[@name='scheduledFor']",
    '2027-10-03',
  );
  await executeScript(
    sessionId,
    'window.__portfolioHoldInspectionOrchestration = true; return true;',
  );
  await clickXpath(
    sessionId,
    orchestrationForm +
      "//button[normalize-space()='Save orchestration']",
  );
  await waitForScriptTruthy(
    sessionId,
    'return window.__portfolioPendingInspectionOrchestration === true;',
    'held Inspection orchestration mutation',
  );
  await clickXpath(sessionId, "//*[@data-unit-dossier-navigation]//a[.//span[normalize-space()='Assets']]");
  await new Promise((resolve) => setTimeout(resolve, 150));
  assertEqual(
    await currentUrl(sessionId),
    orchestrationInspectionUrl,
    'Pending Inspection orchestration blocks dossier navigation',
  );
  assertEqual(
    await executeScript(
      sessionId,
      'return window.__portfolioReleaseInspectionOrchestration();',
    ),
    true,
    'Release held Inspection orchestration mutation',
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[contains(normalize-space(),'Draft orchestration · v2')]",
  );

  await setInputValueXpath(
    sessionId,
    orchestrationForm + "//input[@name='scheduledFor']",
    '2027-10-04',
  );
  await executeScript(
    sessionId,
    'window.__portfolioFailNextInspectionOrchestrationAfterCommit = true; return true;',
  );
  await clickXpath(
    sessionId,
    orchestrationForm +
      "//button[normalize-space()='Save orchestration']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[contains(normalize-space(),'Draft orchestration · v3')]",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[contains(normalize-space(),'orchestration was committed and recovered')]",
  );

  await clickXpath(
    sessionId,
    "//section[contains(@class,'inspection-editor')]//button[normalize-space()='Start Inspection']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//section[contains(@class,'inspection-editor')]//span[contains(@class,'status-chip')][normalize-space()='in_progress']",
  );
  assertEqual(
    await elementExistsXpath(
      sessionId,
      "//form[@data-inspection-form='orchestration']",
    ),
    false,
    'Starting field work freezes draft orchestration UI',
  );

  const inspectionUrl =
    `${baseUrl}/properties/${propertyId}/units/${unitId}?tab=inspections&inspectionId=${inspectionId}&sectionInstanceId=${inspectionSectionInstanceId}&asOf=2025-06-30`;

  await clickXpath(
    sessionId,
    "//aside//a[normalize-space()='Work']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[@data-operational-work-queue]//h2[normalize-space()='Active work']",
  );
  assertEqual(
    await currentUrl(sessionId),
    `${baseUrl}/work?asOf=2025-06-30`,
    'Global Work queue has a shareable top-level route',
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[@data-operational-work-queue]//article[@data-work-domain='inspection'][.//strong[normalize-space()='INS-BRW-001']][contains(normalize-space(),'Browser Test Property')][contains(normalize-space(),'UNIT-BRW')][contains(normalize-space(),'Browser Inspector')]",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[@data-operational-work-queue]//article[@data-work-domain='inspection'][.//strong[normalize-space()='INS-ORCH-BRW']][contains(normalize-space(),'Inspection Orchestration Property')][contains(normalize-space(),'UNIT-ORCH-BRW')][contains(normalize-space(),'Browser Inspector')]",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[@data-operational-work-queue]//article[@data-work-domain='maintenance'][@data-work-attention='urgent'][.//strong[normalize-space()='ISS-OVEN-BRW']][contains(normalize-space(),'Oven not heating')]",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[@data-operational-work-queue]//article[@data-work-domain='occupancy'][.//strong[normalize-space()='TEN-WORK-BRW']][contains(normalize-space(),'Contract coverage missing')][contains(normalize-space(),'No covering agreement')]",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[@data-operational-work-queue]//article[@data-work-attention='today'][.//strong[normalize-space()='INS-BRW-001']]",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[contains(normalize-space(),'The item set is current canonical state')][contains(normalize-space(),'does not rewind the Work set')]",
  );
  await selectOptionXpath(
    sessionId,
    "//*[@data-operational-work-queue]//select[ancestor::label[contains(normalize-space(),'Domain')]]",
    'maintenance',
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[@data-operational-work-queue]//article[.//strong[normalize-space()='ISS-OVEN-BRW']]",
  );
  assertEqual(
    await elementExistsXpath(
      sessionId,
      "//*[@data-operational-work-queue]//article[.//strong[normalize-space()='INS-BRW-001']]",
    ),
    false,
    'Domain filter isolates Maintenance from Inspection work',
  );
  assertEqual(
    await elementExistsXpath(
      sessionId,
      "//*[@data-operational-work-queue]//article[.//strong[normalize-space()='TEN-WORK-BRW']]",
    ),
    false,
    'Domain filter isolates Maintenance from occupancy work',
  );
  await selectOptionXpath(
    sessionId,
    "//*[@data-operational-work-queue]//select[ancestor::label[contains(normalize-space(),'Domain')]]",
    'all',
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[@data-operational-work-queue]//article[.//strong[normalize-space()='INS-BRW-001']]",
  );

  await clickXpath(
    sessionId,
    "//*[@data-operational-work-queue]//article[.//strong[normalize-space()='ISS-OVEN-BRW']]//a[normalize-space()='Open Maintenance']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//section[contains(@class,'maintenance-admin-panel')]//h2[normalize-space()='ISS-OVEN-BRW · Oven not heating']",
  );
  assertEqual(
    await currentUrl(sessionId),
    baseUrl +
      '/properties/' + setupPropertyId +
      '/units/' + setupUnitId +
      '?tab=maintenance&issueId=' + setupOvenMaintenanceIssueId +
      '&asOf=2025-06-30',
    'Global Work Maintenance opens the exact canonical Issue owner',
  );

  await clickXpath(sessionId, "//aside//a[normalize-space()='Work']");
  await waitForElement(
    sessionId,
    'xpath',
    "//*[@data-operational-work-queue]//article[.//strong[normalize-space()='TEN-WORK-BRW']]",
  );
  await clickXpath(
    sessionId,
    "//*[@data-operational-work-queue]//article[.//strong[normalize-space()='TEN-WORK-BRW']]//a[normalize-space()='Open Contracts']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//a[contains(@class,'selection-card')][.//strong[normalize-space()='TEN-WORK-BRW']][.//span[normalize-space()='planned']]",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[normalize-space()='No Lease Agreements exist for this Tenancy.']",
  );
  assertEqual(
    await currentUrl(sessionId),
    baseUrl +
      '/properties/' + orchestrationPropertyId +
      '/units/' + orchestrationUnitId +
      '?tab=contracts&tenancyId=aa200000-0000-4000-8000-000000000001&asOf=2025-06-30',
    'Global Work contract gap opens the exact canonical Tenancy owner',
  );

  await clickXpath(sessionId, "//aside//a[normalize-space()='Work']");
  await waitForElement(
    sessionId,
    'xpath',
    "//*[@data-operational-work-queue]//article[.//strong[normalize-space()='INS-BRW-001']]",
  );
  await clickXpath(
    sessionId,
    "//*[@data-operational-work-queue]//article[.//strong[normalize-space()='INS-BRW-001']]//a[normalize-space()='Open Inspection']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//section[contains(@class,'inspection-editor')]//h2[normalize-space()='INS-BRW-001']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//button[normalize-space()='Start Inspection']",
  );
  assertEqual(
    await currentUrl(sessionId),
    inspectionUrl,
    'Global Work queue navigates with canonical cross-Unit Property owner',
  );

  for (const [label, instanceId] of [
    ['Hallway', inspectionHallwayInstanceId],
    ['Living room', inspectionLivingRoomInstanceId],
    ['Bedroom 1', inspectionBedroomInstanceId],
    ['Kitchen', inspectionKitchenInstanceId],
    ['Bathroom', inspectionBathroomInstanceId],
  ]) {
    await clickXpath(
      sessionId,
      `//nav[contains(@class,'inspection-sections')]//strong[normalize-space()='${label}']`,
    );
    await waitForElement(
      sessionId,
      'xpath',
      `//form[contains(@class,'inspection-section-form')]//h3[normalize-space()='${label}']`,
    );
    assertEqual(
      await currentUrl(sessionId),
      `${baseUrl}/properties/${propertyId}/units/${unitId}?tab=inspections&inspectionId=${inspectionId}&sectionInstanceId=${instanceId}&asOf=2025-06-30`,
      `Inspection ${label} section-instance deep-link`,
    );
  }

  await clickXpath(
    sessionId,
    "//nav[contains(@class,'inspection-sections')]//strong[normalize-space()='General condition']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//form[contains(@class,'inspection-section-form')]//h3[normalize-space()='General condition']",
  );
  assertEqual(
    await currentUrl(sessionId),
    inspectionUrl,
    'Inspection returns to General section-instance deep-link',
  );

  await clickXpath(
    sessionId,
    "//*[@data-inspection-field-toolbar]//a[normalize-space()='Next →']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//form[contains(@class,'inspection-section-form')]//h3[normalize-space()='Hallway']",
  );
  assertEqual(
    await currentUrl(sessionId),
    `${baseUrl}/properties/${propertyId}/units/${unitId}?tab=inspections&inspectionId=${inspectionId}&sectionInstanceId=${inspectionHallwayInstanceId}&asOf=2025-06-30`,
    'Next field-work navigation preserves exact SectionInstance deep-link',
  );
  await clickXpath(
    sessionId,
    "//*[@data-inspection-field-toolbar]//a[normalize-space()='← Previous']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//form[contains(@class,'inspection-section-form')]//h3[normalize-space()='General condition']",
  );
  assertEqual(
    await currentUrl(sessionId),
    inspectionUrl,
    'Previous field-work navigation returns to the exact prior SectionInstance',
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
  await waitForElement(
    sessionId,
    'xpath',
    "//*[@data-inspection-required-progress]//*[contains(normalize-space(),'0 / 1 saved')]",
  );
  await clickXpath(
    sessionId,
    "//nav[contains(@class,'inspection-sections')]//strong[normalize-space()='Kitchen']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//form[contains(@class,'inspection-section-form')]//h3[normalize-space()='Kitchen']",
  );
  assertEqual(
    await currentUrl(sessionId),
    `${baseUrl}/properties/${propertyId}/units/${unitId}?tab=inspections&inspectionId=${inspectionId}&sectionInstanceId=${inspectionKitchenInstanceId}&asOf=2025-06-30`,
    'Incomplete Review can start away from the missing SectionInstance',
  );
  await clickXpath(
    sessionId,
    "//button[normalize-space()='Review before lock']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[@data-inspection-pre-lock-review]",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[@data-inspection-review-missing-summary][contains(normalize-space(),'1 required response needs attention')]",
  );
  assertEqual(
    await elementDisabledXpath(
      sessionId,
      "//button[normalize-space()='Confirm review & lock Inspection']",
    ),
    true,
    'Incomplete fresh canonical Review disables lock confirmation',
  );
  await clickXpath(
    sessionId,
    `//*[@data-inspection-review-fix-section='${inspectionSectionInstanceId}']`,
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//form[contains(@class,'inspection-section-form')]//h3[normalize-space()='General condition']",
  );
  assertEqual(
    await currentUrl(sessionId),
    inspectionUrl,
    'Review Fix action jumps to the exact missing SectionInstance deep-link',
  );
  assertEqual(
    await elementExistsXpath(
      sessionId,
      "//*[@data-inspection-pre-lock-review]",
    ),
    false,
    'Fix action closes Review and returns to field work',
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//div[contains(@class,'inspection-item-missing')][.//span[contains(normalize-space(),'Condition')]]//*[normalize-space()='Required response missing']",
  );

  await executeScript(
    sessionId,
    'window.__portfolioHoldInspectionSectionSave = true; return true;',
  );
  const sectionPatchCountBeforeAutosave = await executeScript(
    sessionId,
    'return window.__portfolioInspectionSectionPatchCount || 0;',
  );

  const conditionSelect =
    "//div[contains(@class,'inspection-item')][.//span[contains(normalize-space(),'Condition')]]//select";
  await selectOptionXpath(sessionId, conditionSelect, 'damaged');

  const notesInput =
    "//div[contains(@class,'inspection-item')][.//span[contains(normalize-space(),'Damage notes')]]//input[@type='text']";
  await waitForElement(sessionId, 'xpath', notesInput);
  await waitForElement(
    sessionId,
    'xpath',
    "//div[contains(@class,'inspection-item-missing')][.//span[contains(normalize-space(),'Damage notes')]]//*[normalize-space()='Required response missing']",
  );
  await typeXpath(sessionId, notesInput, 'Window scratch');
  await clickAndDismissConfirm(
    sessionId,
    "//*[@data-inspection-field-toolbar]//a[normalize-space()='Next →']",
    'This Inspection section has unsaved changes. Leave and discard them?',
  );
  assertEqual(
    await currentUrl(sessionId),
    inspectionUrl,
    'Dirty Inspection blocks Previous/Next field-work navigation during the autosave debounce window',
  );
  assertEqual(
    await elementValueXpath(sessionId, notesInput),
    'Window scratch',
    'Dirty Inspection answer survives cancelled field-work navigation before autosave',
  );

  await clickAndDismissConfirm(
    sessionId,
    "//*[@data-unit-dossier-navigation]//a[.//span[normalize-space()='Timeline']]",
    'This Inspection section has unsaved changes. Leave and discard them?',
  );
  assertEqual(
    await currentUrl(sessionId),
    inspectionUrl,
    'Dirty Inspection navigation is guarded during the autosave debounce window',
  );
  assertEqual(
    await elementValueXpath(sessionId, notesInput),
    'Window scratch',
    'Dirty Inspection answer survives cancelled dossier navigation before autosave',
  );

  await waitForScriptTruthy(
    sessionId,
    'return window.__portfolioPendingInspectionSectionSave === true;',
    'held Inspection section autosave',
  );
  await clickXpath(
    sessionId,
    "//*[@data-inspection-field-toolbar]//a[normalize-space()='Next →']",
  );
  await new Promise((resolve) => setTimeout(resolve, 150));
  assertEqual(
    await currentUrl(sessionId),
    inspectionUrl,
    'In-flight section PATCH hard-blocks Next field-work navigation',
  );
  assertEqual(
    await executeScript(
      sessionId,
      'return window.__portfolioInspectionSectionPatchCount || 0;',
    ),
    sectionPatchCountBeforeAutosave + 1,
    'Rapid Inspection edits coalesce into one debounced section PATCH',
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[@data-inspection-autosave-status][contains(normalize-space(),'Saving section')]",
  );

  assertEqual(
    await elementExistsXpath(
      sessionId,
      "//form[@data-inspection-form='create']",
    ),
    false,
    'Focused Inspection detail does not expose Create Inspection',
  );
  await clickXpath(
    sessionId,
    "//a[normalize-space()='← All Inspections']",
  );
  await new Promise((resolve) => setTimeout(resolve, 150));
  assertEqual(
    await currentUrl(sessionId),
    inspectionUrl,
    'In-flight dirty section save blocks return to the list/Create workspace',
  );
  assertEqual(
    await elementValueXpath(sessionId, notesInput),
    'Window scratch',
    'Dirty Inspection answer survives blocked return to the list workspace',
  );

  const findingForm =
    "//form[@data-inspection-content-form='finding']";
  assertEqual(
    await elementDisabledXpath(
      sessionId,
      findingForm + "//button[normalize-space()='Record Finding']",
    ),
    true,
    'Dirty section disables Finding write',
  );
  await executeScript(
    sessionId,
    "document.querySelector('form[data-inspection-content-form=\"finding\"]').requestSubmit(); return true;",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[contains(normalize-space(),'Save or discard the current section before recording Findings or Evidence.')]",
  );

  const evidenceDocumentForm =
    "//form[@data-inspection-content-form='evidence-document']";
  assertEqual(
    await elementDisabledXpath(
      sessionId,
      evidenceDocumentForm + "//button[normalize-space()='Create Document']",
    ),
    true,
    'Dirty section disables Evidence Document write',
  );
  await executeScript(
    sessionId,
    "document.querySelector('form[data-inspection-content-form=\"evidence-document\"]').requestSubmit(); return true;",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[contains(normalize-space(),'Save or discard the current section before recording Findings or Evidence.')]",
  );

  await clickXpath(sessionId, "//*[@data-unit-dossier-navigation]//a[.//span[normalize-space()='Timeline']]");
  await new Promise((resolve) => setTimeout(resolve, 150));
  assertEqual(
    await currentUrl(sessionId),
    inspectionUrl,
    'In-flight Inspection autosave hard-blocks navigation until acknowledgement',
  );

  assertEqual(
    await executeScript(
      sessionId,
      'return window.__portfolioReleaseInspectionSectionSave?.() === true;',
    ),
    true,
    'Held Inspection autosave acknowledgement releases',
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[@data-inspection-autosave-status][contains(normalize-space(),'All section changes saved')]",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//a[contains(@class,'inspection-section-link')][.//small[normalize-space()='revision 1']]",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[@data-inspection-required-progress]//*[contains(normalize-space(),'2 / 2 saved')]",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//a[contains(@class,'inspection-section-link')][.//strong[normalize-space()='General condition']]//*[contains(normalize-space(),'2/2 required · complete')]",
  );
  assertEqual(
    await elementDisabledXpath(
      sessionId,
      "//button[normalize-space()='Review before lock']",
    ),
    false,
    'Canonical required completeness leaves pre-lock review available',
  );

  await executeScript(
    sessionId,
    'window.__portfolioHoldInspectionReviewRead = true; return true;',
  );
  await clickXpath(
    sessionId,
    "//button[normalize-space()='Review before lock']",
  );
  await waitForScriptTruthy(
    sessionId,
    'return window.__portfolioPendingInspectionReviewRead === true;',
    'held stale Inspection review read',
  );

  await typeXpath(
    sessionId,
    notesInput,
    'Window scratch after held review',
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[@data-inspection-autosave-status][contains(normalize-space(),'All section changes saved')]",
  );
  assertEqual(
    await elementValueXpath(sessionId, notesInput),
    'Window scratch after held review',
    'Newer autosave is visible while older review GET remains held',
  );

  assertEqual(
    await executeScript(
      sessionId,
      'return window.__portfolioReleaseInspectionReviewRead?.() === true;',
    ),
    true,
    'Held stale Inspection review response releases',
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[contains(normalize-space(),'Inspection changed while review was loading. Load a fresh canonical review before locking.')]",
  );
  assertEqual(
    await elementExistsXpath(
      sessionId,
      "//*[@data-inspection-pre-lock-review]",
    ),
    false,
    'Late stale review response is discarded instead of becoming current',
  );
  assertEqual(
    await elementExistsXpath(
      sessionId,
      "//button[normalize-space()='Confirm review & lock Inspection']",
    ),
    false,
    'Discarded stale review cannot expose lock confirmation',
  );
  assertEqual(
    await elementValueXpath(sessionId, notesInput),
    'Window scratch after held review',
    'Late stale review response cannot regress newer canonical section content',
  );

  await selectOptionXpath(
    sessionId,
    findingForm + "//select[@name='itemId']",
    inspectionNotesItemId,
  );
  await selectOptionXpath(
    sessionId,
    findingForm + "//select[@name='severity']",
    'major',
  );
  await setInputValueXpath(
    sessionId,
    findingForm + "//input[@name='title']",
    'Recovered window Finding',
  );
  await setInputValueXpath(
    sessionId,
    findingForm + "//textarea[@name='description']",
    'Canonical Finding after a lost acknowledgement.',
  );
  await executeScript(
    sessionId,
    'window.__portfolioFailNextInspectionFindingAfterCommit = true; return true;',
  );
  await clickXpath(
    sessionId,
    findingForm + "//button[normalize-space()='Record Finding']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[contains(normalize-space(),'Finding acknowledgement was lost. Canonical Inspection state was reloaded')]",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//ul[contains(@class,'inspection-content-list')]//strong[contains(normalize-space(),'Recovered window Finding')]",
  );

  const scopedEvidenceForm =
    "//form[@data-inspection-content-form='evidence-scoped-upload']";
  const evidenceAttachForm =
    "//form[@data-inspection-content-form='evidence-attach']";
  await waitForElement(
    sessionId,
    'xpath',
    scopedEvidenceForm +
      "//input[@name='file' and @capture='environment' and contains(@accept,'image/jpeg') and contains(@accept,'image/png') and contains(@accept,'image/webp')]",
  );
  const scopedUploadsBefore = await executeScript(
    sessionId,
    'return window.__portfolioDocumentUploadCount || 0;',
  );

  await executeScript(
    sessionId,
    'window.__portfolioInspectionDigestCount = 0;' +
      'const proto = Object.getPrototypeOf(crypto.subtle);' +
      'window.__portfolioOriginalDigest = proto.digest;' +
      'proto.digest = function(...args) {' +
      'window.__portfolioInspectionDigestCount += 1;' +
      'return window.__portfolioOriginalDigest.apply(this, args);' +
      '};' +
      'return true;',
  );
  await setFileXpath(
    sessionId,
    scopedEvidenceForm + "//input[@name='file']",
    oversizedInspectionEvidencePhotoPath,
  );
  await clickXpath(
    sessionId,
    scopedEvidenceForm +
      "//button[normalize-space()='Upload Inspection evidence']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[contains(normalize-space(),'Photo source files are limited to 32 MiB before browser compression.')]",
  );
  assertEqual(
    await executeScript(
      sessionId,
      'return window.__portfolioInspectionDigestCount || 0;',
    ),
    0,
    'Oversized Inspection photo is rejected before SHA-256 fingerprinting',
  );
  assertEqual(
    await executeScript(
      sessionId,
      'return window.__portfolioDocumentUploadCount || 0;',
    ),
    scopedUploadsBefore,
    'Oversized Inspection photo is rejected before binary upload',
  );
  await executeScript(
    sessionId,
    'const proto = Object.getPrototypeOf(crypto.subtle);' +
      'if (window.__portfolioOriginalDigest) {' +
      'proto.digest = window.__portfolioOriginalDigest;' +
      '}' +
      'delete window.__portfolioOriginalDigest;' +
      'return true;',
  );
  await clearXpath(
    sessionId,
    scopedEvidenceForm + "//input[@name='file']",
  );
  await setFileXpath(
    sessionId,
    scopedEvidenceForm + "//input[@name='file']",
    inspectionEvidencePhotoPath,
  );
  await executeScript(
    sessionId,
    'window.__portfolioFailNextInspectionBinaryAfterCommit = true; return true;',
  );
  await clickXpath(
    sessionId,
    scopedEvidenceForm +
      "//button[normalize-space()='Upload Inspection evidence']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[contains(normalize-space(),'Inspection photo stored without unnecessary recompression.')]",
  );
  assertEqual(
    await executeScript(
      sessionId,
      'return window.__portfolioDocumentUploadCount || 0;',
    ),
    scopedUploadsBefore + 1,
    'Ambiguous Inspection-scoped Evidence upload reuses one binary',
  );
  await waitForElement(
    sessionId,
    'xpath',
    evidenceAttachForm +
      "//button[normalize-space()='Attach exact version' and not(@disabled)]",
  );
  await setInputValueXpath(
    sessionId,
    evidenceAttachForm + "//textarea[@name='caption']",
    'Scoped field evidence',
  );
  await clickXpath(
    sessionId,
    evidenceAttachForm + "//button[normalize-space()='Attach exact version']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//ul[contains(@class,'inspection-content-list')]//span[normalize-space()='Scoped field evidence']",
  );

  await clickXpath(
    sessionId,
    "//details[contains(@class,'inspection-evidence-advanced')]/summary",
  );
  await setInputValueXpath(
    sessionId,
    evidenceDocumentForm + "//input[@name='code']",
    'EVID-BRW-001',
  );
  await setInputValueXpath(
    sessionId,
    evidenceDocumentForm + "//input[@name='title']",
    'Window scratch photo',
  );
  await clickXpath(
    sessionId,
    evidenceDocumentForm + "//button[normalize-space()='Create Document']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[contains(normalize-space(),'Evidence Document EVID-BRW-001 created.')]",
  );

  const evidenceUploadForm =
    "//form[@data-inspection-content-form='evidence-upload']";
  const evidenceFileInput =
    evidenceUploadForm + "//input[@name='file' and not(@disabled)]";
  await waitForElement(sessionId, 'xpath', evidenceFileInput);
  const uploadsBeforeEvidence = await executeScript(
    sessionId,
    'return window.__portfolioDocumentUploadCount || 0;',
  );
  await setFileXpath(
    sessionId,
    evidenceFileInput,
    inspectionEvidencePhotoPath,
  );
  await clickXpath(
    sessionId,
    evidenceUploadForm + "//button[normalize-space()='Upload version']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[contains(normalize-space(),'Version v1 stored. Attach this exact immutable binary')]",
  );
  assertEqual(
    await executeScript(
      sessionId,
      'return window.__portfolioDocumentUploadCount || 0;',
    ),
    uploadsBeforeEvidence + 1,
    'Inspection Evidence binary uploaded exactly once',
  );

  await waitForElement(
    sessionId,
    'xpath',
    evidenceAttachForm +
      "//button[normalize-space()='Attach exact version' and not(@disabled)]",
  );
  await setInputValueXpath(
    sessionId,
    evidenceAttachForm + "//textarea[@name='caption']",
    'Window scratch photo',
  );
  await executeScript(
    sessionId,
    'window.__portfolioHoldInspectionEvidence = true; return true;',
  );
  await clickXpath(
    sessionId,
    evidenceAttachForm + "//button[normalize-space()='Attach exact version']",
  );
  await waitForScriptTruthy(
    sessionId,
    'return window.__portfolioPendingInspectionEvidence === true;',
    'held Inspection Evidence relation',
  );
  await clickXpath(sessionId, "//*[@data-unit-dossier-navigation]//a[.//span[normalize-space()='Timeline']]");
  await new Promise((resolve) => setTimeout(resolve, 150));
  assertEqual(
    await currentUrl(sessionId),
    inspectionUrl,
    'Pending Inspection Evidence relation blocks dossier navigation',
  );
  assertEqual(
    await executeScript(
      sessionId,
      'return window.__portfolioReleaseInspectionEvidence();',
    ),
    true,
    'Release held Inspection Evidence relation',
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//ul[contains(@class,'inspection-content-list')]//span[normalize-space()='Window scratch photo']",
  );

  const uploadsAfterFirstEvidence = await executeScript(
    sessionId,
    'return window.__portfolioDocumentUploadCount || 0;',
  );
  await selectOptionXpath(
    sessionId,
    evidenceAttachForm + "//select[@name='kind']",
    'attachment',
  );
  await selectOptionXpath(
    sessionId,
    evidenceAttachForm + "//select[@name='scope']",
    'inspection',
  );
  await setInputValueXpath(
    sessionId,
    evidenceAttachForm + "//textarea[@name='caption']",
    'Lost acknowledgement relation',
  );
  await executeScript(
    sessionId,
    'window.__portfolioFailNextInspectionEvidenceAfterCommit = true; return true;',
  );
  await clickXpath(
    sessionId,
    evidenceAttachForm + "//button[normalize-space()='Attach exact version']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[contains(normalize-space(),'Evidence relation was committed and recovered.')]",
  );
  assertEqual(
    await elementExistsXpath(
      sessionId,
      "//ul[contains(@class,'inspection-content-list')]//span[normalize-space()='Lost acknowledgement relation']",
    ),
    false,
    'Inspection-level Evidence is not misrepresented as active-section Evidence',
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[@data-inspection-content-context-summary][contains(normalize-space(),'Inspection-level evidence item(s)')]",
  );
  assertEqual(
    await executeScript(
      sessionId,
      'return window.__portfolioDocumentUploadCount || 0;',
    ),
    uploadsAfterFirstEvidence,
    'Lost Evidence-link acknowledgement never re-uploads the stored binary',
  );

  await clickXpath(
    sessionId,
    "//nav[contains(@class,'inspection-sections')]//strong[normalize-space()='Kitchen']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//form[contains(@class,'inspection-section-form')]//h3[normalize-space()='Kitchen']",
  );
  assertEqual(
    await currentUrl(sessionId),
    `${baseUrl}/properties/${propertyId}/units/${unitId}?tab=inspections&inspectionId=${inspectionId}&sectionInstanceId=${inspectionKitchenInstanceId}&asOf=2025-06-30`,
    'Kitchen Inspection section-instance owner',
  );
  await selectOptionXpath(
    sessionId,
    findingForm + "//select[@name='itemId']",
    inspectionRoomItemId,
  );
  await selectOptionXpath(
    sessionId,
    findingForm + "//select[@name='severity']",
    'major',
  );
  await setInputValueXpath(
    sessionId,
    findingForm + "//input[@name='title']",
    'Kitchen ventilation staining',
  );
  await setInputValueXpath(
    sessionId,
    findingForm + "//textarea[@name='description']",
    'Visible staining above the cooking area.',
  );
  await clickXpath(
    sessionId,
    findingForm + "//button[normalize-space()='Record Finding']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//div[contains(@class,'inspection-content-card')][.//strong[normalize-space()='Findings in Kitchen']]//li[.//strong[contains(normalize-space(),'Kitchen ventilation staining')]]//small[normalize-space()='Room note']",
  );

  await clickXpath(
    sessionId,
    "//nav[contains(@class,'inspection-sections')]//strong[normalize-space()='Bathroom']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//form[contains(@class,'inspection-section-form')]//h3[normalize-space()='Bathroom']",
  );
  assertEqual(
    await currentUrl(sessionId),
    `${baseUrl}/properties/${propertyId}/units/${unitId}?tab=inspections&inspectionId=${inspectionId}&sectionInstanceId=${inspectionBathroomInstanceId}&asOf=2025-06-30`,
    'Bathroom Inspection section-instance owner',
  );

  const bathroomScopedEvidenceForm =
    "//form[@data-inspection-content-form='evidence-scoped-upload']";
  const bathroomEvidenceAttachForm =
    "//form[@data-inspection-content-form='evidence-attach']";
  await setFileXpath(
    sessionId,
    bathroomScopedEvidenceForm + "//input[@name='file']",
    inspectionEvidencePhotoPath,
  );
  await clickXpath(
    sessionId,
    bathroomScopedEvidenceForm +
      "//button[normalize-space()='Upload Inspection evidence']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[contains(normalize-space(),'Inspection photo stored without unnecessary recompression.')]",
  );
  await waitForElement(
    sessionId,
    'xpath',
    bathroomEvidenceAttachForm +
      "//button[normalize-space()='Attach exact version' and not(@disabled)]",
  );
  await selectOptionXpath(
    sessionId,
    bathroomEvidenceAttachForm + "//select[@name='scope']",
    'section',
  );
  await setInputValueXpath(
    sessionId,
    bathroomEvidenceAttachForm + "//textarea[@name='caption']",
    'Bathroom moisture evidence',
  );
  await clickXpath(
    sessionId,
    bathroomEvidenceAttachForm +
      "//button[normalize-space()='Attach exact version']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//ul[contains(@class,'inspection-content-list')]//li[.//span[normalize-space()='Bathroom moisture evidence']]//small[normalize-space()='Bathroom']",
  );

  await clickXpath(
    sessionId,
    "//nav[contains(@class,'inspection-sections')]//strong[normalize-space()='General condition']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//form[contains(@class,'inspection-section-form')]//h3[normalize-space()='General condition']",
  );
  assertEqual(
    await currentUrl(sessionId),
    inspectionUrl,
    'Room-specific content returns to canonical General Inspection owner',
  );
  assertEqual(
    await elementExistsXpath(
      sessionId,
      "//ul[contains(@class,'inspection-content-list')]//li[.//span[normalize-space()='Bathroom moisture evidence']]",
    ),
    false,
    'Bathroom Evidence is hidden after returning to a different active SectionInstance',
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[@data-inspection-content-context-summary][contains(normalize-space(),'evidence item(s) belong to other sections')]",
  );

  const sectionPatchCountBeforeConflict = await executeScript(
    sessionId,
    'return window.__portfolioInspectionSectionPatchCount || 0;',
  );
  await typeXpath(sessionId, notesInput, 'conflict-edit');
  await waitForElement(
    sessionId,
    'xpath',
    "//*[contains(normalize-space(),'This section changed on the server. Your local answers are still visible.')]",
  );
  assertEqual(
    await executeScript(
      sessionId,
      'return window.__portfolioInspectionSectionPatchCount || 0;',
    ),
    sectionPatchCountBeforeConflict + 1,
    'Conflict edit is attempted exactly once by autosave',
  );
  await new Promise((resolve) => setTimeout(resolve, 1800));
  assertEqual(
    await executeScript(
      sessionId,
      'return window.__portfolioInspectionSectionPatchCount || 0;',
    ),
    sectionPatchCountBeforeConflict + 1,
    'Autosave never retries a CAS conflict automatically',
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

  // Resolve the intentional CAS conflict through the actual UX path.
  // Merely typing the canonical value would leave the field touched/dirty.
  await clickXpath(
    sessionId,
    "//button[normalize-space()='Reload server version and discard local edits']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[@data-inspection-autosave-status][contains(normalize-space(),'All section changes saved')]",
  );
  assertEqual(
    await elementValueXpath(sessionId, notesInput),
    'Window scratch after held review',
    'Conflict reload restores newest canonical Inspection answer',
  );

  assertEqual(
    await elementExistsXpath(
      sessionId,
      "//button[normalize-space()='Confirm review & lock Inspection']",
    ),
    false,
    'Inspection cannot be locked before canonical pre-lock review is opened',
  );

  await clickXpath(
    sessionId,
    "//button[normalize-space()='Review before lock']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[@data-inspection-pre-lock-review]",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[@data-inspection-pre-lock-review]//*[contains(normalize-space(),'Window scratch photo')]",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[@data-inspection-pre-lock-review]//*[contains(normalize-space(),'Lost acknowledgement relation')]",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[@data-inspection-pre-lock-review]//*[contains(normalize-space(),'Kitchen ventilation staining')]",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[@data-inspection-pre-lock-review]//*[contains(normalize-space(),'Bathroom moisture evidence')]",
  );
  assertEqual(
    await elementDisabledXpath(
      sessionId,
      "//button[normalize-space()='Confirm review & lock Inspection']",
    ),
    false,
    'Current complete canonical review enables lock confirmation',
  );

  await typeXpath(sessionId, notesInput, 'Window scratch after review');
  await waitForElement(
    sessionId,
    'xpath',
    "//*[@data-inspection-autosave-status][contains(normalize-space(),'All section changes saved')]",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[contains(normalize-space(),'Inspection content changed after this review was loaded.')]",
  );
  assertEqual(
    await elementDisabledXpath(
      sessionId,
      "//button[normalize-space()='Confirm review & lock Inspection']",
    ),
    true,
    'Canonical content revision change invalidates the loaded pre-lock review',
  );

  await clickXpath(
    sessionId,
    "//button[normalize-space()='Refresh review']",
  );
  await waitForScriptTruthy(
    sessionId,
    'return !document.body.innerText.includes("Inspection content changed after this review was loaded.");',
    'refreshed current Inspection review',
  );
  assertEqual(
    await elementDisabledXpath(
      sessionId,
      "//button[normalize-space()='Confirm review & lock Inspection']",
    ),
    false,
    'Refreshed canonical review re-enables lock confirmation',
  );

  await executeScript(
    sessionId,
    'window.__portfolioHoldInspectionLockBeforeCommit = true; return true;',
  );
  await clickXpath(
    sessionId,
    "//button[normalize-space()='Confirm review & lock Inspection']",
  );
  await waitForScriptTruthy(
    sessionId,
    'return window.__portfolioPendingInspectionLockBeforeCommit === true;',
    'held Inspection lock before commit',
  );
  assertEqual(
    await executeScript(
      sessionId,
      'return window.__portfolioSimulateConcurrentInspectionFinding?.() === true;',
    ),
    true,
    'Concurrent writer adds a Finding after Review but before lock commit',
  );
  assertEqual(
    await executeScript(
      sessionId,
      'return window.__portfolioReleaseInspectionLockBeforeCommit?.() === true;',
    ),
    true,
    'Release fenced Inspection lock request after concurrent Finding',
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[contains(normalize-space(),'Inspection content changed before lock. The new canonical state is loaded; run a fresh Review before locking.')]",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//span[contains(@class,'status-chip') and normalize-space()='in_progress']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//strong[contains(normalize-space(),'Concurrent lock-race Finding')]",
  );
  assertEqual(
    await elementExistsXpath(
      sessionId,
      "//*[@data-inspection-pre-lock-review]",
    ),
    false,
    'ContentRevision lock conflict invalidates the reviewed snapshot',
  );
  assertEqual(
    await elementExistsXpath(
      sessionId,
      "//button[normalize-space()='Confirm review & lock Inspection']",
    ),
    false,
    'Old Review cannot authorize a lock retry after contentRevision conflict',
  );

  await clickXpath(
    sessionId,
    "//button[normalize-space()='Review before lock']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[@data-inspection-pre-lock-review]//*[contains(normalize-space(),'Concurrent lock-race Finding')]",
  );
  assertEqual(
    await elementDisabledXpath(
      sessionId,
      "//button[normalize-space()='Confirm review & lock Inspection']",
    ),
    false,
    'Fresh Review over the concurrent Finding can authorize lock',
  );

  await executeScript(
    sessionId,
    'window.__portfolioHoldInspectionLifecycle = true; return true;',
  );
  await clickXpath(
    sessionId,
    "//button[normalize-space()='Confirm review & lock Inspection']",
  );
  await waitForScriptTruthy(
    sessionId,
    'return window.__portfolioPendingInspectionLifecycle === true;',
    'held Inspection lock',
  );
  await clickXpath(sessionId, "//*[@data-unit-dossier-navigation]//a[.//span[normalize-space()='Timeline']]");
  await new Promise((resolve) => setTimeout(resolve, 150));
  assertEqual(
    await currentUrl(sessionId),
    inspectionUrl,
    'Pending Inspection lock blocks dossier navigation',
  );
  assertEqual(
    await executeScript(
      sessionId,
      'return window.__portfolioReleaseInspectionLifecycle();',
    ),
    true,
    'Release held Inspection lock',
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//span[contains(@class,'status-chip') and normalize-space()='locked']",
  );

  const signatureForm =
    "//form[@data-inspection-finalization-form='signature']";
  const unlockForm =
    "//form[@data-inspection-finalization-form='unlock']";

  assertEqual(
    await elementExistsXpath(
      sessionId,
      "//strong[normalize-space()='1 · Capture signature binary']",
    ),
    false,
    'Signature UX no longer exposes a binary-first step',
  );
  assertEqual(
    await elementExistsXpath(
      sessionId,
      "//strong[normalize-space()='2 · Record signer']",
    ),
    false,
    'Signature UX no longer exposes a separate relation step',
  );

  const uploadsBeforeSignature = await executeScript(
    sessionId,
    'return window.__portfolioDocumentUploadCount || 0;',
  );
  await selectOptionXpath(
    sessionId,
    signatureForm + "//select[@name='signerRole']",
    'tenant',
  );
  await selectOptionXpath(
    sessionId,
    signatureForm + "//select[@name='signerPartyId']",
    tenantPartyId,
  );
  await setInputValueXpath(
    sessionId,
    signatureForm + "//input[@name='signerName']",
    'Browser Tenant',
  );

  const signatureCanvas =
    signatureForm + "//*[@data-inspection-signature-pad]//canvas";
  await waitForElement(sessionId, 'xpath', signatureCanvas);
  assertEqual(
    await elementDisabledXpath(
      sessionId,
      signatureForm +
        "//*[@data-inspection-signature-pad]//button[normalize-space()='Add drawn signature']",
    ),
    true,
    'Blank signature pad cannot add a signature',
  );
  await drawSignaturePadXpath(sessionId, signatureCanvas);
  await waitForElement(
    sessionId,
    'xpath',
    signatureForm +
      "//*[@data-inspection-signature-pad]//button[normalize-space()='Add drawn signature' and not(@disabled)]",
  );
  await executeScript(
    sessionId,
    'window.__portfolioFailNextInspectionBinaryAfterCommit = true; window.__portfolioFailNextInspectionSignatureAfterCommit = true; return true;',
  );
  await clickXpath(
    sessionId,
    signatureForm +
      "//*[@data-inspection-signature-pad]//button[normalize-space()='Add drawn signature']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[contains(normalize-space(),'Tenant signature added after canonical recovery.')]",
  );
  assertEqual(
    await executeScript(
      sessionId,
      'return window.__portfolioDocumentUploadCount || 0;',
    ),
    uploadsBeforeSignature + 1,
    'One drawn-signature action reuses one Inspection-scoped binary through ambiguous upload recovery',
  );
  assertEqual(
    await elementDisabledXpath(
      sessionId,
      signatureForm +
        "//*[@data-inspection-signature-pad]//button[normalize-space()='Add drawn signature']",
    ),
    true,
    'Signature pad resets only after the signer relation is canonically proven',
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//li[.//strong[normalize-space()='Tenant']]//small[contains(normalize-space(),'Signed · Browser Tenant')]",
  );

  await setInputValueXpath(
    sessionId,
    unlockForm + "//textarea[@name='reason']",
    'Correct field content after first signature',
  );
  await clickXpath(
    sessionId,
    unlockForm + "//button[normalize-space()='Unlock Inspection']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//span[contains(@class,'status-chip') and normalize-space()='in_progress']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[contains(normalize-space(),'prior signatures were invalidated')]",
  );

  await clickXpath(
    sessionId,
    "//button[normalize-space()='Review before lock']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[@data-inspection-pre-lock-review]",
  );
  await clickXpath(
    sessionId,
    "//button[normalize-space()='Confirm review & lock Inspection']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//span[contains(@class,'status-chip') and normalize-space()='locked']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[contains(normalize-space(),'Correct field content after first signature')]",
  );

  // Re-add the required tenant signature and prove relation recovery reuses one stored binary.
  const uploadsBeforeTenantRetry = await executeScript(
    sessionId,
    'return window.__portfolioDocumentUploadCount || 0;',
  );
  await selectOptionXpath(
    sessionId,
    signatureForm + "//select[@name='signerRole']",
    'tenant',
  );
  await selectOptionXpath(
    sessionId,
    signatureForm + "//select[@name='signerPartyId']",
    landlordPartyId,
  );
  await setInputValueXpath(
    sessionId,
    signatureForm + "//input[@name='signerName']",
    'Browser Tenant',
  );
  await clickXpath(
    sessionId,
    signatureForm + "//summary[normalize-space()='Use an existing signature file instead']",
  );
  await setFileXpath(
    sessionId,
    signatureForm + "//input[@name='file']",
    agreementSignedFilePath,
  );
  await clickXpath(
    sessionId,
    signatureForm + "//button[normalize-space()='Add uploaded signature']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[@data-inspection-signature-recovery][contains(normalize-space(),'registration pending')]",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[contains(normalize-space(),'Signature file is stored, but registration failed')]",
  );
  assertEqual(
    await executeScript(
      sessionId,
      'return window.__portfolioDocumentUploadCount || 0;',
    ),
    uploadsBeforeTenantRetry + 1,
    'Signer relation failure retains exactly one stored signature binary',
  );
  await selectOptionXpath(
    sessionId,
    signatureForm + "//select[@name='signerPartyId']",
    tenantPartyId,
  );
  await clickXpath(
    sessionId,
    signatureForm + "//button[normalize-space()='Retry registration']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[contains(normalize-space(),'Tenant signature added.')]",
  );
  assertEqual(
    await executeScript(
      sessionId,
      'return window.__portfolioDocumentUploadCount || 0;',
    ),
    uploadsBeforeTenantRetry + 1,
    'Retry registration does not upload a second signature binary',
  );
  assertEqual(
    await elementDisabledXpath(
      sessionId,
      "//button[normalize-space()='Finalize Inspection']",
    ),
    true,
    'One required signature present and one missing keeps Finalize disabled',
  );

  // Capture the second required role through the same unified flow.
  await selectOptionXpath(
    sessionId,
    signatureForm + "//select[@name='signerRole']",
    'landlord',
  );
  await selectOptionXpath(
    sessionId,
    signatureForm + "//select[@name='signerPartyId']",
    landlordPartyId,
  );
  await setInputValueXpath(
    sessionId,
    signatureForm + "//input[@name='signerName']",
    'Browser Landlord Ltd',
  );
  await clickXpath(
    sessionId,
    signatureForm + "//summary[normalize-space()='Use an existing signature file instead']",
  );
  await setFileXpath(
    sessionId,
    signatureForm + "//input[@name='file']",
    amendmentSignedFilePath,
  );
  await clickXpath(
    sessionId,
    signatureForm + "//button[normalize-space()='Add uploaded signature']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[contains(normalize-space(),'Landlord signature added.')]",
  );

  await waitForElement(
    sessionId,
    'xpath',
    "//li[.//strong[normalize-space()='Tenant']]//small[contains(normalize-space(),'Signed · Browser Tenant')]",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//li[.//strong[normalize-space()='Landlord']]//small[contains(normalize-space(),'Signed · Browser Landlord Ltd')]",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[contains(@class,'inspection-signature-ready') and contains(normalize-space(),'All required signatures are present.')]",
  );

  await executeScript(
    sessionId,
    'window.__portfolioFailNextInspectionFinalizeAfterCommit = true; return true;',
  );
  await clickXpath(
    sessionId,
    "//button[normalize-space()='Finalize Inspection']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//span[contains(@class,'status-chip') and normalize-space()='finalized']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[contains(normalize-space(),'Finalization was recovered from the immutable canonical snapshot.')]",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[@data-inspection-completed-overview][.//h3[normalize-space()='Final Inspection record']]",
  );
  assertEqual(
    await elementExistsXpath(
      sessionId,
      "//*[@data-inspection-field-toolbar]",
    ),
    false,
    'Finalized Inspection hides field-work toolbar',
  );
  assertEqual(
    await elementExistsXpath(
      sessionId,
      "//*[contains(@class,'inspection-content-workspace')]",
    ),
    false,
    'Finalized Inspection hides Findings/Evidence write workspace',
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[@data-inspection-completed-overview]//*[contains(normalize-space(),'Kitchen ventilation staining')]",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[contains(normalize-space(),'source lifecycle v')]",
  );

  await executeScript(
    sessionId,
    'window.__portfolioFailNextInspectionReportAfterCommit = true; return true;',
  );
  await clickXpath(
    sessionId,
    "//*[@data-inspection-final-report]//button[normalize-space()='Generate final report']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[contains(normalize-space(),'Final report is ready from the immutable snapshot.')]",
  );
  assertEqual(
    await executeScript(
      sessionId,
      'return window.__portfolioFinalReportRenderCount || 0;',
    ),
    1,
    'Lost final-report acknowledgement does not render a second report',
  );

  const readsBeforeFinalReport = await executeScript(
    sessionId,
    'return window.__portfolioBinaryReads || 0;',
  );
  await clickXpath(
    sessionId,
    "//div[contains(@class,'inspection-finalization-card')][.//strong[normalize-space()='Final report']]//button[normalize-space()='Download']",
  );
  await waitForBinaryReads(sessionId, readsBeforeFinalReport + 1);

  const finalReportReadsBeforeReload = await executeScript(
    sessionId,
    'return window.__portfolioFinalReportReadCount || 0;',
  );
  await clickXpath(
    sessionId,
    "//a[normalize-space()='← All Inspections']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//a[contains(@class,'inspection-card')][.//strong[normalize-space()='INS-BRW-001']]",
  );
  await clickXpath(
    sessionId,
    "//a[contains(@class,'inspection-card')][.//strong[normalize-space()='INS-BRW-001']]",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[@data-inspection-final-report]//button[normalize-space()='Load final report']",
  );
  await clickXpath(
    sessionId,
    "//*[@data-inspection-final-report]//button[normalize-space()='Load final report']",
  );
  await waitForElement(
    sessionId,
    'xpath',
    "//*[contains(normalize-space(),'Canonical final report loaded.')]",
  );
  assertEqual(
    await executeScript(
      sessionId,
      'return window.__portfolioFinalReportReadCount || 0;',
    ),
    finalReportReadsBeforeReload + 1,
    'Existing final report is resolved through one read-only GET',
  );
  assertEqual(
    await executeScript(
      sessionId,
      'return window.__portfolioFinalReportRenderCount || 0;',
    ),
    1,
    'Loading an existing final report does not render or create another version',
  );

  process.stdout.write(
    'Browser workflow PASS: Core setup + route-owner guards → Contracts/documents → Inspection progress/completeness → debounced autosave/CAS conflict → field evidence → canonical pre-lock review → lock/unified-signature-flow/unlock/finalize/report\n',
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
    rm(inspectionEvidencePhotoPath, { force: true }),
    rm(oversizedInspectionEvidencePhotoPath, { force: true }),
  ]);
  if (sessionId) {
    try {
      await webdriver(`/session/${sessionId}`, { method: 'DELETE' });
    } catch {}
  }
  stop(driver);
  stop(vite);
}

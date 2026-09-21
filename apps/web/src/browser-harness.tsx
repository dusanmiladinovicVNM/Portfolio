import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import type { SessionGateway } from './auth/session-gateway.js';
import './styles.css';

const propertyId = '11111111-1111-4111-8111-111111111111';
const unitId = '22222222-2222-4222-8222-222222222222';
const tenancyId = '33333333-3333-4333-8333-333333333333';
const tenancyPartyId = '44444444-4444-4444-8444-444444444444';
const agreementId = '55555555-5555-4555-8555-555555555555';
const landlordAgreementPartyId = '66666666-6666-4666-8666-666666666666';
const tenantAgreementPartyId = '77777777-7777-4777-8777-777777777777';
const landlordPartyId = '88888888-8888-4888-8888-888888888888';
const tenantPartyId = '99999999-9999-4999-8999-999999999999';
const termId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const amendmentId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const agreementDocumentId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const agreementVersionId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const agreementDocumentLinkId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const amendmentDocumentId = 'f1111111-1111-4111-8111-111111111111';
const amendmentVersionId = 'f2222222-2222-4222-8222-222222222222';
const amendmentDocumentLinkId = 'f3333333-3333-4333-8333-333333333333';

const operations = {
  openMaintenanceIssueCount: 0,
  urgentMaintenanceIssueCount: 0,
  openMaintenanceWorkOrderCount: 0,
  locatedAssetCount: 0,
  activeAssetCount: 0,
  inactiveAssetCount: 0,
  activeServicePlanCount: 0,
  openWarrantyClaimCount: 0,
  activeMeterCount: 0,
};

const property = {
  id: propertyId,
  code: 'PROP-BRW',
  name: 'Browser Test Property',
  propertyType: 'apartment_building',
  street: 'Browser Street',
  houseNumber: '1',
  postalCode: '8000',
  city: 'Zürich',
  countryCode: 'CH',
  yearBuilt: 2020,
  status: 'active',
};

const unit = {
  id: unitId,
  propertyId,
  code: 'UNIT-BRW',
  unitNumber: '1A',
  unitType: 'apartment',
  floor: '1',
  areaM2: 72.5,
  rooms: 3,
  status: 'active',
  notes: '',
};

const tenancy = {
  id: tenancyId,
  code: 'TEN-BRW',
  unitId,
  status: 'active',
  plannedStart: '2025-01-01',
  plannedEnd: null,
  actualStart: '2025-01-01',
  actualEnd: null,
  noticeGivenAt: null,
  terminationEffectiveAt: null,
  version: 3,
  parties: [
    {
      id: tenancyPartyId,
      tenancyId,
      partyId: tenantPartyId,
      role: 'tenant',
      isPrimary: true,
    },
  ],
};

const agreement = {
  id: agreementId,
  tenancyId,
  code: 'AGR-BRW',
  agreementType: 'initial',
  predecessorAgreementId: null,
  effectiveFrom: '2025-01-01',
  effectiveTo: null,
  status: 'signed',
  signedAt: '2024-12-20',
  version: 2,
  parties: [
    {
      id: landlordAgreementPartyId,
      agreementId,
      partyId: landlordPartyId,
      role: 'landlord',
    },
    {
      id: tenantAgreementPartyId,
      agreementId,
      partyId: tenantPartyId,
      role: 'tenant',
    },
  ],
};

const terms = {
  id: termId,
  tenancyId,
  sourceType: 'agreement',
  sourceAgreementId: agreementId,
  sourceAmendmentId: null,
  effectiveFrom: '2025-01-01',
  currency: 'CHF',
  baseRent: '1800.00',
  serviceCharge: '250.00',
  utilitiesAdvance: '120.00',
  parkingRent: '0.00',
  otherRecurringCharge: '0.00',
  depositRequired: '5400.00',
  billingFrequency: 'monthly',
  noticePeriodTenantDays: 90,
  noticePeriodLandlordDays: 90,
};

const amendment = {
  id: amendmentId,
  agreementId,
  code: 'AMD-BRW',
  title: 'Service charge adjustment',
  description: 'Browser workflow evidence',
  effectiveFrom: '2025-07-01',
  status: 'signed',
  signedAt: '2025-06-15',
  version: 2,
};

const agreementDocumentReference = {
  document: {
    id: agreementDocumentId,
    code: 'DOC-AGR-BRW',
    title: 'Signed lease original',
    category: 'legal',
    status: 'active',
    latestVersionNumber: 3,
    revision: 4,
  },
  link: {
    id: agreementDocumentLinkId,
    documentId: agreementDocumentId,
    documentVersionId: agreementVersionId,
    relation: 'signed_original',
    targetType: 'lease_agreement',
    targetId: agreementId,
  },
  linkedVersion: {
    id: agreementVersionId,
    documentId: agreementDocumentId,
    versionNumber: 3,
    fileName: 'LEASE-2026.pdf',
    mimeType: 'application/pdf',
    byteSize: 2048,
    sha256: 'c'.repeat(64),
    status: 'final',
    finalizedAt: '2024-12-20T12:00:00.000Z',
  },
};

const amendmentDocumentReference = {
  document: {
    id: amendmentDocumentId,
    code: 'DOC-AMD-BRW',
    title: 'Signed amendment original',
    category: 'legal',
    status: 'active',
    latestVersionNumber: 2,
    revision: 3,
  },
  link: {
    id: amendmentDocumentLinkId,
    documentId: amendmentDocumentId,
    documentVersionId: amendmentVersionId,
    relation: 'signed_original',
    targetType: 'lease_amendment',
    targetId: amendmentId,
  },
  linkedVersion: {
    id: amendmentVersionId,
    documentId: amendmentDocumentId,
    versionNumber: 2,
    fileName: 'LEASE-AMENDMENT-2026.pdf',
    mimeType: 'application/pdf',
    byteSize: 1024,
    sha256: 'd'.repeat(64),
    status: 'final',
    finalizedAt: '2025-06-15T12:00:00.000Z',
  },
};

const parties = [
  {
    id: landlordPartyId,
    code: 'PTY-LANDLORD-BRW',
    displayName: 'Browser Landlord Ltd',
    status: 'active',
    contactPoints: [],
    addresses: [],
    partyType: 'company',
    legalName: 'Browser Landlord Ltd',
  },
  {
    id: tenantPartyId,
    code: 'PTY-TENANT-BRW',
    displayName: 'Browser Tenant',
    status: 'active',
    contactPoints: [],
    addresses: [],
    partyType: 'person',
    firstName: 'Browser',
    middleName: null,
    lastName: 'Tenant',
  },
];

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ data }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function apiPath(input: RequestInfo | URL): URL {
  const raw =
    input instanceof Request
      ? input.url
      : input instanceof URL
        ? input.toString()
        : input;
  const url = new URL(raw, window.location.origin);
  if (!url.pathname.startsWith('/api/')) {
    throw new Error(`Unexpected browser-harness request: ${url.href}`);
  }
  return new URL(
    `${url.pathname.slice('/api'.length)}${url.search}`,
    window.location.origin,
  );
}

globalThis.fetch = async (input: RequestInfo | URL): Promise<Response> => {
  const url = apiPath(input);
  const path = url.pathname;

  if (path === '/reporting/dashboard') {
    const asOf = url.searchParams.get('asOf');
    return json({
      asOf,
      propertyCount: 1,
      unitCount: 1,
      occupiedUnitCount: 1,
      plannedUnitCount: 0,
      vacantUnitCount: 0,
      currentOperations: operations,
      portfolioCostsByCurrency: [],
      properties: [
        {
          propertyId,
          propertyCode: property.code,
          propertyName: property.name,
          unitCount: 1,
          occupiedUnitCount: 1,
          plannedUnitCount: 0,
          vacantUnitCount: 0,
          currentOpenMaintenanceIssueCount: 0,
          currentUrgentMaintenanceIssueCount: 0,
          currentLocatedAssetCount: 0,
          currentActiveAssetCount: 0,
          currentActiveMeterCount: 0,
        },
      ],
    });
  }

  if (path === `/properties/${propertyId}`) {
    return json(property);
  }

  if (path === `/properties/${propertyId}/units`) {
    return json({ items: [unit] });
  }

  if (path === `/units/${unitId}`) {
    return json(unit);
  }

  if (path === `/units/${unitId}/overview`) {
    const asOf = url.searchParams.get('asOf');
    return json({
      asOf,
      unitId,
      propertyId,
      propertyCode: property.code,
      propertyName: property.name,
      unitCode: unit.code,
      unitNumber: unit.unitNumber,
      unitType: unit.unitType,
      floor: unit.floor,
      areaM2: unit.areaM2,
      rooms: unit.rooms,
      occupancyStatus: 'occupied',
      tenancy: {
        id: tenancy.id,
        code: tenancy.code,
        currentStatus: tenancy.status,
        plannedStart: tenancy.plannedStart,
        plannedEnd: tenancy.plannedEnd,
        actualStart: tenancy.actualStart,
        actualEnd: tenancy.actualEnd,
      },
      contract: {
        coverageStatus: 'effective',
        currentDraftAgreementCount: 0,
        agreementId,
        agreementCode: agreement.code,
        agreementCurrentStatus: agreement.status,
        effectiveFrom: agreement.effectiveFrom,
        effectiveTo: agreement.effectiveTo,
        signedAt: agreement.signedAt,
        effectiveTerms: {
          id: termId,
          sourceType: 'agreement',
          effectiveFrom: terms.effectiveFrom,
          currency: terms.currency,
          baseRent: terms.baseRent,
          serviceCharge: terms.serviceCharge,
          utilitiesAdvance: terms.utilitiesAdvance,
          parkingRent: terms.parkingRent,
          otherRecurringCharge: terms.otherRecurringCharge,
          recurringTotal: '2170.00',
          depositRequired: terms.depositRequired,
          billingFrequency: terms.billingFrequency,
        },
      },
      currentOperations: operations,
      unitAttributedCostsByCurrency: [],
    });
  }

  if (path === `/units/${unitId}/tenancies`) {
    return json({ items: [tenancy] });
  }

  if (path === `/tenancies/${tenancyId}/agreements`) {
    return json({ items: [agreement] });
  }

  if (path === `/tenancies/${tenancyId}/terms`) {
    return json(terms);
  }

  if (path === `/agreements/${agreementId}/amendments`) {
    return json({ items: [amendment] });
  }

  if (path === `/agreements/${agreementId}/documents`) {
    return json({ items: [agreementDocumentReference] });
  }

  if (path === `/amendments/${amendmentId}/documents`) {
    return json({ items: [amendmentDocumentReference] });
  }

  if (path === '/parties') {
    const ids = new Set(url.searchParams.getAll('id'));
    return json({
      items: parties.filter((party) => ids.has(party.id)),
    });
  }

  return new Response(
    JSON.stringify({
      error: {
        code: 'BROWSER_HARNESS_ROUTE_NOT_FOUND',
        message: `No fake response for ${url.pathname}${url.search}`,
      },
    }),
    {
      status: 404,
      headers: { 'content-type': 'application/json' },
    },
  );
};

const sessionGateway: SessionGateway = {
  async getSession() {
    return {
      accessToken: 'browser-workflow-token',
      email: 'browser.workflow@example.test',
    };
  },
  subscribe() {
    return () => {};
  },
  async signInWithPassword() {},
  async signOut() {},
};

document.cookie = '__portfolio_browser_test=1; path=/; SameSite=Strict';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Browser workflow root is missing.');
}

createRoot(rootElement).render(
  <App apiBaseUrl="/api" sessionGateway={sessionGateway} />,
);

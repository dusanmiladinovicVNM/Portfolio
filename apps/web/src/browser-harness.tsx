import type {
  CreatePartyRequest,
  CreatePropertyRequest,
  CreateSpaceRequest,
  CreateTenancyRequest,
  CreateUnitRequest,
  LeaseAgreementResponse,
  LeaseAmendmentResponse,
  PartyResponse,
  PropertyResponse,
  SpaceResponse,
  TenancyResponse,
  TenancyTermVersionResponse,
  UnitResponse,
} from '@portfolio/contracts';
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
const inspectionId = 'a1000000-0000-4000-8000-000000000001';
const inspectionSchemaVersionId = 'a1000000-0000-4000-8000-000000000002';
const inspectionSectionId = 'a1000000-0000-4000-8000-000000000003';
const inspectionConditionItemId = 'a1000000-0000-4000-8000-000000000004';
const inspectionNotesItemId = 'a1000000-0000-4000-8000-000000000005';
const inspectionUserId = 'a1000000-0000-4000-8000-000000000006';
const inspectionConditionResponseId = 'a1000000-0000-4000-8000-000000000007';
const inspectionNotesResponseId = 'a1000000-0000-4000-8000-000000000008';
const setupPropertyId = 'b1000000-0000-4000-8000-000000000001';
const setupUnitId = 'b1000000-0000-4000-8000-000000000002';
const setupSpaceId = 'b1000000-0000-4000-8000-000000000003';
const setupPartyId = 'b1000000-0000-4000-8000-000000000004';
const setupPartyEmailId = 'b1000000-0000-4000-8000-000000000005';
const setupPartyAddressId = 'b1000000-0000-4000-8000-000000000006';
const setupTenancyId = 'b1000000-0000-4000-8000-000000000007';
const setupTenancyPartyId = 'b1000000-0000-4000-8000-000000000008';
const setupAgreementIds = [
  'b1000000-0000-4000-8000-000000000009',
  'b1000000-0000-4000-8000-000000000010',
  'b1000000-0000-4000-8000-000000000011',
] as const;
const setupAgreementPartyIds = [
  'b1000000-0000-4000-8000-000000000012',
  'b1000000-0000-4000-8000-000000000013',
  'b1000000-0000-4000-8000-000000000014',
  'b1000000-0000-4000-8000-000000000015',
  'b1000000-0000-4000-8000-000000000016',
  'b1000000-0000-4000-8000-000000000017',
] as const;
const setupAmendmentIds = [
  'b1000000-0000-4000-8000-000000000018',
  'b1000000-0000-4000-8000-000000000019',
] as const;
const setupTermIds = [
  'b1000000-0000-4000-8000-000000000020',
  'b1000000-0000-4000-8000-000000000021',
  'b1000000-0000-4000-8000-000000000022',
] as const;

let setupProperty: PropertyResponse | null = null;
let setupUnit: UnitResponse | null = null;
let setupSpace: SpaceResponse | null = null;
let setupParty: PartyResponse | null = null;
let setupTenancy: TenancyResponse | null = null;
let setupAgreements: LeaseAgreementResponse[] = [];
let heldContractAgreementRead: LeaseAgreementResponse[] | null = null;
let setupAmendments: LeaseAmendmentResponse[] = [];
let setupTerms: TenancyTermVersionResponse[] = [];
let setupAgreementSequence = 0;
let setupAgreementPartySequence = 0;
let setupAmendmentSequence = 0;
let setupTermSequence = 0;

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

let inspectionStatus: 'draft' | 'in_progress' = 'draft';
let inspectionVersion = 1;
let inspectionContentRevision = 0;
let inspectionSectionRevision = 0;
let inspectionResponses: Array<{
  id: string;
  inspectionId: string;
  sectionId: string;
  itemId: string;
  value: string | boolean | string[];
  comment: string | null;
  updatedByUserId: string;
  updatedAt: string;
}> = [];

const inspectionSchema = {
  id: inspectionSchemaVersionId,
  schemaCode: 'MOVE-IN-BRW',
  versionNumber: 1,
  inspectionType: 'move_in',
  title: 'Browser move-in inspection',
  status: 'published',
  requiredSignatureRoles: [],
  sections: [
    {
      id: inspectionSectionId,
      key: 'general',
      title: 'General condition',
      description: 'Record the overall condition before handover.',
      sortOrder: 0,
      items: [
        {
          id: inspectionConditionItemId,
          sectionId: inspectionSectionId,
          key: 'condition',
          type: 'select',
          label: 'Condition',
          required: true,
          sortOrder: 0,
          options: [
            { value: 'good', label: 'Good' },
            { value: 'damaged', label: 'Damaged' },
          ],
          visibleWhen: null,
          requiredWhen: null,
        },
        {
          id: inspectionNotesItemId,
          sectionId: inspectionSectionId,
          key: 'damage_notes',
          type: 'text',
          label: 'Damage notes',
          required: false,
          sortOrder: 1,
          options: [],
          visibleWhen: {
            fieldKey: 'condition',
            operator: 'equals',
            value: 'damaged',
          },
          requiredWhen: {
            fieldKey: 'condition',
            operator: 'equals',
            value: 'damaged',
          },
        },
      ],
    },
  ],
};

function inspectionRecord() {
  return {
    id: inspectionId,
    code: 'INS-BRW-001',
    inspectionType: 'move_in',
    unitId,
    tenancyId,
    schemaVersionId: inspectionSchemaVersionId,
    assignedToUserId: inspectionUserId,
    createdByUserId: inspectionUserId,
    scheduledFor: '2025-06-30',
    status: inspectionStatus,
    startedAt:
      inspectionStatus === 'in_progress'
        ? '2025-06-30T08:00:00.000Z'
        : null,
    lockedAt: null,
    finalizedAt: null,
    cancelledAt: null,
    version: inspectionVersion,
    contentRevision: inspectionContentRevision,
  };
}

function inspectionBundle() {
  return {
    inspection: inspectionRecord(),
    schema: inspectionSchema,
    sectionStates: [
      {
        sectionId: inspectionSectionId,
        revision: inspectionSectionRevision,
      },
    ],
    responses: inspectionResponses,
    findings: [],
    evidence: [],
    signatures: [],
    finalSnapshot: null,
  };
}

function requirePortfolioAuth(init?: RequestInit) {
  const authorization = new Headers(init?.headers).get('authorization');
  if (authorization !== 'Bearer browser-workflow-token') {
    throw new Error('Portfolio mutation is missing Portfolio auth.');
  }
}

function requireInspectionAuth(init?: RequestInit) {
  requirePortfolioAuth(init);
}

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

function tenancyVersionConflict(): Response {
  return apiError(
    409,
    'TENANCY_VERSION_CONFLICT',
    'Tenancy version conflict.',
  );
}

function apiError(status: number, code: string, message: string): Response {
  return new Response(
    JSON.stringify({ error: { code, message } }),
    {
      status,
      headers: { 'content-type': 'application/json' },
    },
  );
}

function contractVersionConflict(code: string): Response {
  return apiError(409, code, 'Contract version conflict.');
}

function exactMoney(value: string | undefined): string {
  if (!value) return '0.00';
  const [whole, fraction = ''] = value.split('.');
  return `${whole}.${fraction.padEnd(2, '0')}`;
}

function setupTermSnapshot(
  tenancyIdValue: string,
  source: {
    sourceType: 'agreement' | 'amendment';
    sourceAgreementId: string | null;
    sourceAmendmentId: string | null;
    effectiveFrom: string;
  },
  termsInput: {
    currency: string;
    baseRent: string;
    serviceCharge?: string;
    utilitiesAdvance?: string;
    parkingRent?: string;
    otherRecurringCharge?: string;
    depositRequired?: string;
    billingFrequency?: 'monthly' | 'quarterly' | 'yearly';
    noticePeriodTenantDays?: number;
    noticePeriodLandlordDays?: number;
  },
): TenancyTermVersionResponse {
  const id = setupTermIds[setupTermSequence++];
  if (!id) throw new Error('Setup term id pool exhausted.');

  return {
    id,
    tenancyId: tenancyIdValue,
    sourceType: source.sourceType,
    sourceAgreementId: source.sourceAgreementId,
    sourceAmendmentId: source.sourceAmendmentId,
    effectiveFrom: source.effectiveFrom,
    currency: termsInput.currency.toUpperCase(),
    baseRent: exactMoney(termsInput.baseRent),
    serviceCharge: exactMoney(termsInput.serviceCharge),
    utilitiesAdvance: exactMoney(termsInput.utilitiesAdvance),
    parkingRent: exactMoney(termsInput.parkingRent),
    otherRecurringCharge: exactMoney(termsInput.otherRecurringCharge),
    depositRequired: exactMoney(termsInput.depositRequired),
    billingFrequency: termsInput.billingFrequency ?? 'monthly',
    noticePeriodTenantDays: termsInput.noticePeriodTenantDays ?? 0,
    noticePeriodLandlordDays: termsInput.noticePeriodLandlordDays ?? 0,
  };
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

type BrowserHarnessWindow = Window & {
  __portfolioBinaryReads?: number;
  __portfolioHoldUnitCreate?: boolean;
  __portfolioHoldSpaceCreate?: boolean;
  __portfolioHoldTenancyMutation?: boolean;
  __portfolioHoldContractMutation?: boolean;
  __portfolioPendingUnitCreate?: boolean;
  __portfolioPendingSpaceCreate?: boolean;
  __portfolioPendingTenancyMutation?: boolean;
  __portfolioPendingContractMutation?: boolean;
  __portfolioReleaseUnitCreate?: () => boolean;
  __portfolioReleaseSpaceCreate?: () => boolean;
  __portfolioReleaseTenancyMutation?: () => boolean;
  __portfolioReleaseContractMutation?: () => boolean;
};

const browserHarnessWindow = window as BrowserHarnessWindow;
browserHarnessWindow.__portfolioBinaryReads = 0;

let heldUnitCreate:
  | { readonly response: Response; readonly resolve: (response: Response) => void }
  | null = null;
let heldSpaceCreate:
  | { readonly response: Response; readonly resolve: (response: Response) => void }
  | null = null;
let heldTenancyMutation:
  | { readonly response: Response; readonly resolve: (response: Response) => void }
  | null = null;
let heldContractMutation:
  | { readonly response: Response; readonly resolve: (response: Response) => void }
  | null = null;

function maybeHoldUnitCreate(response: Response): Promise<Response> {
  if (!browserHarnessWindow.__portfolioHoldUnitCreate) {
    return Promise.resolve(response);
  }

  browserHarnessWindow.__portfolioPendingUnitCreate = true;
  return new Promise<Response>((resolve) => {
    heldUnitCreate = { response, resolve };
  });
}

function maybeHoldSpaceCreate(response: Response): Promise<Response> {
  if (!browserHarnessWindow.__portfolioHoldSpaceCreate) {
    return Promise.resolve(response);
  }

  browserHarnessWindow.__portfolioPendingSpaceCreate = true;
  return new Promise<Response>((resolve) => {
    heldSpaceCreate = { response, resolve };
  });
}

function maybeHoldTenancyMutation(response: Response): Promise<Response> {
  if (!browserHarnessWindow.__portfolioHoldTenancyMutation) {
    return Promise.resolve(response);
  }

  browserHarnessWindow.__portfolioPendingTenancyMutation = true;
  return new Promise<Response>((resolve) => {
    heldTenancyMutation = { response, resolve };
  });
}

function maybeHoldContractMutation(response: Response): Promise<Response> {
  if (!browserHarnessWindow.__portfolioHoldContractMutation) {
    return Promise.resolve(response);
  }

  browserHarnessWindow.__portfolioPendingContractMutation = true;
  return new Promise<Response>((resolve) => {
    heldContractMutation = { response, resolve };
  });
}

browserHarnessWindow.__portfolioReleaseUnitCreate = () => {
  if (!heldUnitCreate) return false;
  const held = heldUnitCreate;
  heldUnitCreate = null;
  browserHarnessWindow.__portfolioHoldUnitCreate = false;
  browserHarnessWindow.__portfolioPendingUnitCreate = false;
  held.resolve(held.response);
  return true;
};

browserHarnessWindow.__portfolioReleaseSpaceCreate = () => {
  if (!heldSpaceCreate) return false;
  const held = heldSpaceCreate;
  heldSpaceCreate = null;
  browserHarnessWindow.__portfolioHoldSpaceCreate = false;
  browserHarnessWindow.__portfolioPendingSpaceCreate = false;
  held.resolve(held.response);
  return true;
};

browserHarnessWindow.__portfolioReleaseTenancyMutation = () => {
  if (!heldTenancyMutation) return false;
  const held = heldTenancyMutation;
  heldTenancyMutation = null;
  browserHarnessWindow.__portfolioHoldTenancyMutation = false;
  browserHarnessWindow.__portfolioPendingTenancyMutation = false;
  held.resolve(held.response);
  return true;
};

browserHarnessWindow.__portfolioReleaseContractMutation = () => {
  if (!heldContractMutation) return false;
  const held = heldContractMutation;
  heldContractMutation = null;
  heldContractAgreementRead = null;
  browserHarnessWindow.__portfolioHoldContractMutation = false;
  browserHarnessWindow.__portfolioPendingContractMutation = false;
  held.resolve(held.response);
  return true;
};

globalThis.fetch = async (
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> => {
  const url = apiPath(input);
  const path = url.pathname;

  if (path === '/properties' && init?.method === 'POST') {
    requirePortfolioAuth(init);
    const body = JSON.parse(String(init.body)) as CreatePropertyRequest;
    setupProperty = {
      ...body,
      id: setupPropertyId,
      status: 'active',
      yearBuilt: body.yearBuilt ?? null,
    };
    return json(setupProperty, 201);
  }

  if (setupProperty && path === '/properties/' + setupPropertyId) {
    return json(setupProperty);
  }

  if (setupProperty && path === '/properties/' + setupPropertyId + '/units') {
    return json({ items: setupUnit ? [setupUnit] : [] });
  }

  if (path === '/units' && init?.method === 'POST') {
    requirePortfolioAuth(init);
    const body = JSON.parse(String(init.body)) as CreateUnitRequest;
    if (body.propertyId !== setupPropertyId) {
      throw new Error('Setup Unit was created for the wrong Property.');
    }
    setupUnit = {
      id: setupUnitId,
      propertyId: body.propertyId,
      code: body.code,
      unitNumber: body.unitNumber,
      unitType: body.unitType,
      floor: body.floor ?? null,
      areaM2: body.areaM2 ?? null,
      rooms: body.rooms ?? null,
      status: 'active',
      notes: body.notes ?? '',
    };
    return maybeHoldUnitCreate(json(setupUnit, 201));
  }

  if (setupUnit && path === '/units/' + setupUnitId) {
    return json(setupUnit);
  }

  if (setupUnit && path === '/units/' + setupUnitId + '/spaces') {
    return json({ items: setupSpace ? [setupSpace] : [] });
  }

  if (setupUnit && path === '/units/' + setupUnitId + '/tenancies') {
    if (init?.method === 'POST') {
      requirePortfolioAuth(init);
      const body = JSON.parse(String(init.body)) as CreateTenancyRequest;
      setupTenancy = {
        id: setupTenancyId,
        code: body.code,
        unitId: setupUnitId,
        status: 'draft',
        plannedStart: null,
        plannedEnd: null,
        actualStart: null,
        actualEnd: null,
        noticeGivenAt: null,
        terminationEffectiveAt: null,
        version: 1,
        parties: [],
      };
      return json(setupTenancy, 201);
    }
    return json({ items: setupTenancy ? [setupTenancy] : [] });
  }

  if (
    setupTenancy &&
    path === '/tenancies/' + setupTenancyId + '/parties' &&
    init?.method === 'POST'
  ) {
    requirePortfolioAuth(init);
    const body = JSON.parse(String(init.body)) as {
      expectedVersion: number;
      partyId: string;
      role: 'tenant' | 'co_tenant' | 'guarantor' | 'authorized_occupant';
      isPrimary?: boolean;
    };
    if (body.expectedVersion !== setupTenancy.version) {
      return tenancyVersionConflict();
    }
    setupTenancy = {
      ...setupTenancy,
      version: setupTenancy.version + 1,
      parties: [
        ...setupTenancy.parties,
        {
          id: setupTenancyPartyId,
          tenancyId: setupTenancyId,
          partyId: body.partyId,
          role: body.role,
          isPrimary: body.isPrimary ?? false,
        },
      ],
    };
    return json(setupTenancy);
  }

  if (
    setupTenancy &&
    path.startsWith('/tenancies/' + setupTenancyId + '/') &&
    [
      '/plan',
      '/activate',
      '/give-notice',
      '/move-out-pending',
      '/end',
      '/cancel',
    ].some((suffix) => path.endsWith(suffix)) &&
    init?.method === 'POST'
  ) {
    requirePortfolioAuth(init);
    const body = JSON.parse(String(init.body)) as {
      expectedVersion: number;
      plannedStart?: string;
      plannedEnd?: string | null;
      actualStart?: string;
      noticeGivenAt?: string;
      terminationEffectiveAt?: string;
      actualEnd?: string;
    };
    if (body.expectedVersion !== setupTenancy.version) {
      return tenancyVersionConflict();
    }

    const nextVersion = setupTenancy.version + 1;
    if (path.endsWith('/plan')) {
      setupTenancy = {
        ...setupTenancy,
        status: 'planned',
        plannedStart: body.plannedStart ?? null,
        plannedEnd: body.plannedEnd ?? null,
        version: nextVersion,
      };
    } else if (path.endsWith('/activate')) {
      setupTenancy = {
        ...setupTenancy,
        status: 'active',
        actualStart: body.actualStart ?? null,
        version: nextVersion,
      };
    } else if (path.endsWith('/give-notice')) {
      setupTenancy = {
        ...setupTenancy,
        status: 'notice_given',
        noticeGivenAt: body.noticeGivenAt ?? null,
        terminationEffectiveAt: body.terminationEffectiveAt ?? null,
        version: nextVersion,
      };
    } else if (path.endsWith('/move-out-pending')) {
      setupTenancy = {
        ...setupTenancy,
        status: 'move_out_pending',
        version: nextVersion,
      };
    } else if (path.endsWith('/end')) {
      setupTenancy = {
        ...setupTenancy,
        status: 'ended',
        actualEnd: body.actualEnd ?? null,
        version: nextVersion,
      };
    } else if (path.endsWith('/cancel')) {
      setupTenancy = {
        ...setupTenancy,
        status: 'cancelled',
        version: nextVersion,
      };
    } else {
      throw new Error('Unexpected setup Tenancy action: ' + path);
    }
    return maybeHoldTenancyMutation(json(setupTenancy));
  }

  if (
    setupTenancy &&
    path === '/tenancies/' + setupTenancyId + '/agreements'
  ) {
    if (init?.method === 'POST') {
      requirePortfolioAuth(init);
      const body = JSON.parse(String(init.body)) as {
        code: string;
        agreementType: 'initial' | 'renewal' | 'replacement';
        predecessorAgreementId?: string;
        effectiveFrom: string;
        effectiveTo?: string | null;
        parties: Array<{
          partyId: string;
          role:
            | 'landlord'
            | 'tenant'
            | 'co_tenant'
            | 'guarantor'
            | 'authorized_signatory';
        }>;
      };
      const id = setupAgreementIds[setupAgreementSequence++];
      if (!id) throw new Error('Setup Agreement id pool exhausted.');
      const agreementParties = body.parties.map((party) => {
        const partyId = setupAgreementPartyIds[setupAgreementPartySequence++];
        if (!partyId) throw new Error('Setup AgreementParty id pool exhausted.');
        return {
          id: partyId,
          agreementId: id,
          partyId: party.partyId,
          role: party.role,
        };
      });
      const created: LeaseAgreementResponse = {
        id,
        tenancyId: setupTenancyId,
        code: body.code,
        agreementType: body.agreementType,
        predecessorAgreementId: body.predecessorAgreementId ?? null,
        effectiveFrom: body.effectiveFrom,
        effectiveTo: body.effectiveTo ?? null,
        status: 'draft',
        signedAt: null,
        version: 1,
        parties: agreementParties,
      };
      setupAgreements.push(created);
      return json(created, 201);
    }
    return json({
      items: heldContractAgreementRead ?? setupAgreements,
    });
  }

  const setupAgreement = setupAgreements.find((item) =>
    path.startsWith('/agreements/' + item.id),
  );

  if (
    setupAgreement &&
    path === '/agreements/' + setupAgreement.id + '/sign' &&
    init?.method === 'POST'
  ) {
    requirePortfolioAuth(init);
    const body = JSON.parse(String(init.body)) as {
      expectedVersion: number;
      signedAt: string;
      terms: {
        currency: string;
        baseRent: string;
        serviceCharge?: string;
        utilitiesAdvance?: string;
        parkingRent?: string;
        otherRecurringCharge?: string;
        depositRequired?: string;
        billingFrequency?: 'monthly' | 'quarterly' | 'yearly';
        noticePeriodTenantDays?: number;
        noticePeriodLandlordDays?: number;
      };
    };
    if (body.expectedVersion !== setupAgreement.version) {
      return contractVersionConflict('LEASE_AGREEMENT_VERSION_CONFLICT');
    }

    if (browserHarnessWindow.__portfolioHoldContractMutation) {
      heldContractAgreementRead = setupAgreements.map((item) => ({
        ...item,
        parties: item.parties.map((party) => ({ ...party })),
      }));
    }

    if (setupAgreement.predecessorAgreementId) {
      const predecessor = setupAgreements.find(
        (item) => item.id === setupAgreement.predecessorAgreementId,
      );
      if (!predecessor || predecessor.status !== 'signed') {
        return apiError(
          409,
          'LEASE_AGREEMENT_PREDECESSOR_NOT_SIGNABLE',
          'Predecessor is not signed.',
        );
      }
      setupAgreements = setupAgreements.map((item) =>
        item.id === predecessor.id
          ? {
              ...item,
              status: 'superseded',
              version: item.version + 1,
            }
          : item,
      );
    }

    const signed: LeaseAgreementResponse = {
      ...setupAgreement,
      status: 'signed',
      signedAt: body.signedAt,
      version: setupAgreement.version + 1,
    };
    setupAgreements = setupAgreements.map((item) =>
      item.id === signed.id ? signed : item,
    );
    setupTerms.push(
      setupTermSnapshot(
        setupTenancyId,
        {
          sourceType: 'agreement',
          sourceAgreementId: signed.id,
          sourceAmendmentId: null,
          effectiveFrom: signed.effectiveFrom,
        },
        body.terms,
      ),
    );
    return maybeHoldContractMutation(json(signed));
  }

  if (
    setupAgreement &&
    path === '/agreements/' + setupAgreement.id + '/cancel' &&
    init?.method === 'POST'
  ) {
    requirePortfolioAuth(init);
    const body = JSON.parse(String(init.body)) as { expectedVersion: number };
    if (body.expectedVersion !== setupAgreement.version) {
      return contractVersionConflict('LEASE_AGREEMENT_VERSION_CONFLICT');
    }
    const cancelled: LeaseAgreementResponse = {
      ...setupAgreement,
      status: 'cancelled',
      version: setupAgreement.version + 1,
    };
    setupAgreements = setupAgreements.map((item) =>
      item.id === cancelled.id ? cancelled : item,
    );
    return json(cancelled);
  }

  if (
    setupAgreement &&
    path === '/agreements/' + setupAgreement.id + '/amendments'
  ) {
    if (init?.method === 'POST') {
      requirePortfolioAuth(init);
      const body = JSON.parse(String(init.body)) as {
        code: string;
        title: string;
        description?: string | null;
        effectiveFrom: string;
      };
      const id = setupAmendmentIds[setupAmendmentSequence++];
      if (!id) throw new Error('Setup Amendment id pool exhausted.');
      const created: LeaseAmendmentResponse = {
        id,
        agreementId: setupAgreement.id,
        code: body.code,
        title: body.title,
        description: body.description ?? null,
        effectiveFrom: body.effectiveFrom,
        status: 'draft',
        signedAt: null,
        version: 1,
      };
      setupAmendments.push(created);
      return json(created, 201);
    }
    return json({
      items: setupAmendments.filter(
        (item) => item.agreementId === setupAgreement.id,
      ),
    });
  }

  const setupAmendment = setupAmendments.find((item) =>
    path.startsWith('/amendments/' + item.id),
  );

  if (
    setupAmendment &&
    path === '/amendments/' + setupAmendment.id + '/sign' &&
    init?.method === 'POST'
  ) {
    requirePortfolioAuth(init);
    const body = JSON.parse(String(init.body)) as {
      expectedVersion: number;
      signedAt: string;
      terms: {
        currency: string;
        baseRent: string;
        serviceCharge?: string;
        utilitiesAdvance?: string;
        parkingRent?: string;
        otherRecurringCharge?: string;
        depositRequired?: string;
        billingFrequency?: 'monthly' | 'quarterly' | 'yearly';
        noticePeriodTenantDays?: number;
        noticePeriodLandlordDays?: number;
      };
    };
    if (body.expectedVersion !== setupAmendment.version) {
      return contractVersionConflict('LEASE_AMENDMENT_VERSION_CONFLICT');
    }
    const parent = setupAgreements.find(
      (item) => item.id === setupAmendment.agreementId,
    );
    if (!parent) throw new Error('Setup Amendment parent is missing.');

    const signed: LeaseAmendmentResponse = {
      ...setupAmendment,
      status: 'signed',
      signedAt: body.signedAt,
      version: setupAmendment.version + 1,
    };
    setupAmendments = setupAmendments.map((item) =>
      item.id === signed.id ? signed : item,
    );
    setupTerms.push(
      setupTermSnapshot(
        setupTenancyId,
        {
          sourceType: 'amendment',
          sourceAgreementId: null,
          sourceAmendmentId: signed.id,
          effectiveFrom: signed.effectiveFrom,
        },
        body.terms,
      ),
    );
    return json(signed);
  }

  if (
    setupAmendment &&
    path === '/amendments/' + setupAmendment.id + '/cancel' &&
    init?.method === 'POST'
  ) {
    requirePortfolioAuth(init);
    const body = JSON.parse(String(init.body)) as { expectedVersion: number };
    if (body.expectedVersion !== setupAmendment.version) {
      return contractVersionConflict('LEASE_AMENDMENT_VERSION_CONFLICT');
    }
    const cancelled: LeaseAmendmentResponse = {
      ...setupAmendment,
      status: 'cancelled',
      version: setupAmendment.version + 1,
    };
    setupAmendments = setupAmendments.map((item) =>
      item.id === cancelled.id ? cancelled : item,
    );
    return json(cancelled);
  }

  if (setupTenancy && path === '/tenancies/' + setupTenancyId + '/terms') {
    const at = url.searchParams.get('at');
    const eligible = setupTerms
      .filter((item) => at !== null && item.effectiveFrom <= at)
      .sort((left, right) =>
        right.effectiveFrom.localeCompare(left.effectiveFrom),
      );
    const effective = eligible[0];
    if (!effective) {
      return apiError(
        404,
        'TENANCY_TERMS_NOT_FOUND',
        'No effective tenancy terms exist for the requested date.',
      );
    }
    return json(effective);
  }

  if (
    setupAgreement &&
    path === '/agreements/' + setupAgreement.id + '/documents'
  ) {
    return json({ items: [] });
  }

  if (
    setupAmendment &&
    path === '/amendments/' + setupAmendment.id + '/documents'
  ) {
    return json({ items: [] });
  }

  if (path === '/units/' + unitId + '/spaces') {
    return json({ items: [] });
  }

  if (path === '/spaces' && init?.method === 'POST') {
    requirePortfolioAuth(init);
    const body = JSON.parse(String(init.body)) as CreateSpaceRequest;
    if (body.unitId !== setupUnitId) {
      throw new Error('Setup Space was created for the wrong Unit.');
    }
    setupSpace = {
      id: setupSpaceId,
      unitId: body.unitId,
      code: body.code,
      name: body.name,
      spaceType: body.spaceType,
      areaM2: body.areaM2 ?? null,
      sortOrder: body.sortOrder ?? 0,
      active: true,
    };
    return maybeHoldSpaceCreate(json(setupSpace, 201));
  }

  if (path === '/parties' && init?.method === 'POST') {
    requirePortfolioAuth(init);
    const body = JSON.parse(String(init.body)) as CreatePartyRequest;
    if (body.partyType !== 'company' || !body.legalName) {
      throw new Error('Browser setup expects a Company Party.');
    }
    setupParty = {
      id: setupPartyId,
      code: body.code,
      displayName: body.displayName ?? body.legalName,
      status: 'active',
      contactPoints: (body.contactPoints ?? []).map((contact) => ({
        id: setupPartyEmailId,
        partyId: setupPartyId,
        contactType: contact.contactType,
        value: contact.value,
        label: contact.label ?? null,
        isPrimary: contact.isPrimary ?? false,
      })),
      addresses: (body.addresses ?? []).map((address) => ({
        id: setupPartyAddressId,
        partyId: setupPartyId,
        addressType: address.addressType,
        line1: address.line1,
        line2: address.line2 ?? null,
        postalCode: address.postalCode,
        city: address.city,
        region: address.region ?? null,
        countryCode: address.countryCode,
        isPrimary: address.isPrimary ?? false,
      })),
      partyType: 'company',
      legalName: body.legalName,
    };
    return json(setupParty, 201);
  }

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

  if (path === `/units/${unitId}/inspections`) {
    return json({ items: [inspectionRecord()] });
  }

  if (path === `/inspections/${inspectionId}`) {
    return json(inspectionBundle());
  }

  if (
    path === `/inspections/${inspectionId}/start` &&
    init?.method === 'POST'
  ) {
    requireInspectionAuth(init);
    const body = JSON.parse(String(init.body)) as { expectedVersion: number };
    if (body.expectedVersion !== inspectionVersion) {
      return new Response(
        JSON.stringify({
          error: {
            code: 'INSPECTION_VERSION_CONFLICT',
            message: 'Inspection version conflict.',
          },
        }),
        { status: 409, headers: { 'content-type': 'application/json' } },
      );
    }
    inspectionStatus = 'in_progress';
    inspectionVersion += 1;
    return json(inspectionRecord());
  }

  if (
    path ===
      `/inspections/${inspectionId}/sections/${inspectionSectionId}` &&
    init?.method === 'PATCH'
  ) {
    requireInspectionAuth(init);
    const body = JSON.parse(String(init.body)) as {
      expectedRevision: number;
      set: Array<{
        itemId: string;
        value: string | boolean | string[];
        comment?: string | null;
      }>;
      clear: string[];
    };

    const conflictRequested = body.set.some(
      (item) =>
        item.itemId === inspectionNotesItemId &&
        item.value === 'conflict-edit',
    );
    if (
      conflictRequested ||
      body.expectedRevision !== inspectionSectionRevision
    ) {
      return new Response(
        JSON.stringify({
          error: {
            code: 'INSPECTION_SECTION_REVISION_CONFLICT',
            message: 'Inspection section was modified concurrently.',
          },
        }),
        { status: 409, headers: { 'content-type': 'application/json' } },
      );
    }

    inspectionSectionRevision += 1;
    inspectionContentRevision += 1;
    for (const itemId of body.clear) {
      inspectionResponses = inspectionResponses.filter(
        (response) => response.itemId !== itemId,
      );
    }

    const persisted = body.set.map((item) => {
      const existingId =
        item.itemId === inspectionConditionItemId
          ? inspectionConditionResponseId
          : inspectionNotesResponseId;
      const response = {
        id: existingId,
        inspectionId,
        sectionId: inspectionSectionId,
        itemId: item.itemId,
        value: item.value,
        comment: item.comment ?? null,
        updatedByUserId: inspectionUserId,
        updatedAt: '2025-06-30T08:05:00.000Z',
      };
      inspectionResponses = [
        ...inspectionResponses.filter(
          (candidate) => candidate.itemId !== item.itemId,
        ),
        response,
      ];
      return response;
    });

    return json({
      revision: inspectionSectionRevision,
      contentRevision: inspectionContentRevision,
      responses: persisted,
      clearedItemIds: body.clear,
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

  if (path === `/document-versions/${agreementVersionId}/content`) {
    const authorization = new Headers(init?.headers).get('authorization');
    if (authorization !== 'Bearer browser-workflow-token') {
      throw new Error('Agreement binary request is missing Portfolio auth.');
    }
    browserHarnessWindow.__portfolioBinaryReads =
      (browserHarnessWindow.__portfolioBinaryReads ?? 0) + 1;
    return new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { 'content-type': 'application/pdf' },
    });
  }

  if (path === `/document-versions/${amendmentVersionId}/content`) {
    const authorization = new Headers(init?.headers).get('authorization');
    if (authorization !== 'Bearer browser-workflow-token') {
      throw new Error('Amendment binary request is missing Portfolio auth.');
    }
    browserHarnessWindow.__portfolioBinaryReads =
      (browserHarnessWindow.__portfolioBinaryReads ?? 0) + 1;
    return new Response(new Uint8Array([4, 5, 6]), {
      status: 200,
      headers: { 'content-type': 'application/pdf' },
    });
  }

  if (path === `/agreements/${agreementId}/documents`) {
    return json({ items: [agreementDocumentReference] });
  }

  if (path === `/amendments/${amendmentId}/documents`) {
    return json({ items: [amendmentDocumentReference] });
  }

  if (path === '/parties') {
    const ids = new Set(url.searchParams.getAll('id'));
    const allParties = setupParty ? [...parties, setupParty] : parties;
    return json({
      items:
        ids.size === 0
          ? allParties
          : allParties.filter((party) => ids.has(party.id)),
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

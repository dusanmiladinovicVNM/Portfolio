import type {
  CreatePartyRequest,
  CreatePropertyRequest,
  CreateSpaceRequest,
  CreateTenancyRequest,
  CreateUnitRequest,
  AssetLocationHistoryResponse,
  AssetReplacementResponse,
  AssetResponse,
  DocumentLinkResponse,
  DocumentResponse,
  DocumentVersionResponse,
  LeaseAgreementDocumentReferenceResponse,
  LeaseAgreementResponse,
  LeaseAmendmentDocumentReferenceResponse,
  LeaseAmendmentResponse,
  MeterReadingBoundaryResponse,
  MeterReadingResponse,
  MeterResponse,
  MaintenanceIssueResponse,
  MaintenanceWorkOrderEntryResponse,
  MaintenanceWorkOrderResponse,
  ServiceEventResponse,
  InspectionFindingResponse,
  InspectionResponseDto,
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
const setupDestinationUnitId = 'c1000000-0000-4000-8000-000000000001';
const setupDestinationSpaceId = 'c1000000-0000-4000-8000-000000000002';
const setupRecoveryPropertyId = 'c2000000-0000-4000-8000-000000000001';
const setupRecoveryUnitId = 'c2000000-0000-4000-8000-000000000002';
const setupRecoverySpaceId = 'c2000000-0000-4000-8000-000000000003';
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
const setupDocumentIds = [
  'b1000000-0000-4000-8000-000000000023',
  'b1000000-0000-4000-8000-000000000024',
] as const;
const setupDocumentVersionIds = [
  'b1000000-0000-4000-8000-000000000025',
  'b1000000-0000-4000-8000-000000000026',
] as const;
const setupDocumentLinkIds = [
  'b1000000-0000-4000-8000-000000000027',
  'b1000000-0000-4000-8000-000000000028',
] as const;
const setupAssetIds = [
  'b1000000-0000-4000-8000-000000000029',
  'b1000000-0000-4000-8000-000000000030',
] as const;
const setupAssetIdentifierIds = [
  'b1000000-0000-4000-8000-000000000031',
  'b1000000-0000-4000-8000-000000000032',
] as const;
const setupAssetLocationIds = [
  'b1000000-0000-4000-8000-000000000033',
  'b1000000-0000-4000-8000-000000000034',
  'b1000000-0000-4000-8000-000000000035',
  'b1000000-0000-4000-8000-000000000037',
] as const;
const setupAssetReplacementId =
  'b1000000-0000-4000-8000-000000000036';
const setupMeterId = 'b1000000-0000-4000-8000-000000000038';
const setupMeterReadingIds = [
  'b1000000-0000-4000-8000-000000000039',
  'b1000000-0000-4000-8000-000000000040',
  'b1000000-0000-4000-8000-000000000041',
] as const;
const setupMeterBoundaryIds = [
  'b1000000-0000-4000-8000-000000000042',
  'b1000000-0000-4000-8000-000000000043',
] as const;
const setupInspectionFindingId =
  'b1000000-0000-4000-8000-000000000044';
const setupMaintenanceIssueId =
  'b1000000-0000-4000-8000-000000000045';
const setupMaintenanceWorkOrderId =
  'b1000000-0000-4000-8000-000000000046';
const setupServiceEventId =
  'b1000000-0000-4000-8000-000000000047';
const setupMaintenanceInspectionId =
  'b1000000-0000-4000-8000-000000000048';
const setupOrchestrationInspectionId =
  'b1000000-0000-4000-8000-000000000049';
const setupOrchestrationOtherStaffId =
  'b1000000-0000-4000-8000-000000000050';
const orchestrationPropertyId =
  'd2000000-0000-4000-8000-000000000001';
const orchestrationUnitId =
  'd2000000-0000-4000-8000-000000000002';

const setupDestinationUnit: UnitResponse = {
  id: setupDestinationUnitId,
  propertyId: setupPropertyId,
  code: 'UNIT-DEST-BRW',
  unitNumber: '2B',
  unitType: 'apartment',
  floor: '2',
  areaM2: 65,
  rooms: 2.5,
  status: 'active',
  notes: '',
};
const setupDestinationSpace: SpaceResponse = {
  id: setupDestinationSpaceId,
  unitId: setupDestinationUnitId,
  code: 'LIV-DEST-BRW',
  name: 'Destination Living Room',
  spaceType: 'living_room',
  areaM2: 25,
  sortOrder: 1,
  active: true,
};

const setupRecoveryProperty: PropertyResponse = {
  id: setupRecoveryPropertyId,
  code: 'PROP-RECOVERY-BRW',
  name: 'Recovery Property',
  propertyType: 'apartment_building',
  street: 'Canonical Street',
  houseNumber: '2',
  postalCode: '8000',
  city: 'Zurich',
  countryCode: 'CH',
  yearBuilt: 2015,
  status: 'active',
};
const setupRecoveryUnit: UnitResponse = {
  id: setupRecoveryUnitId,
  propertyId: setupRecoveryPropertyId,
  code: 'UNIT-RECOVERY-BRW',
  unitNumber: '9C',
  unitType: 'apartment',
  floor: '9',
  areaM2: 80,
  rooms: 3.5,
  status: 'active',
  notes: '',
};
const setupRecoverySpace: SpaceResponse = {
  id: setupRecoverySpaceId,
  unitId: setupRecoveryUnitId,
  code: 'RECOVERY-ROOM-BRW',
  name: 'Recovery Room',
  spaceType: 'living_room',
  areaM2: 30,
  sortOrder: 1,
  active: true,
};

const orchestrationProperty: PropertyResponse = {
  id: orchestrationPropertyId,
  code: 'PROP-ORCH-BRW',
  name: 'Inspection Orchestration Property',
  propertyType: 'apartment_building',
  street: 'Orchestration Street',
  houseNumber: '35',
  postalCode: '8000',
  city: 'Zurich',
  countryCode: 'CH',
  yearBuilt: 2026,
  status: 'active',
};

const orchestrationUnit: UnitResponse = {
  id: orchestrationUnitId,
  propertyId: orchestrationPropertyId,
  code: 'UNIT-ORCH-BRW',
  unitNumber: '35A',
  unitType: 'apartment',
  floor: '3',
  areaM2: 75,
  rooms: 3,
  status: 'active',
  notes: '',
};

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
let setupDocuments: DocumentResponse[] = [];
let setupDocumentVersions: DocumentVersionResponse[] = [];
let setupDocumentLinks: DocumentLinkResponse[] = [];
let setupDocumentSequence = 0;
let setupDocumentVersionSequence = 0;
let setupDocumentLinkSequence = 0;
let setupAssets: AssetResponse[] = [];
let setupAssetLocations: AssetLocationHistoryResponse[] = [];
let setupAssetReplacement: AssetReplacementResponse | null = null;
let setupAssetSequence = 0;
let setupAssetIdentifierSequence = 0;
let setupAssetLocationSequence = 0;
let setupAssetMutationSequence = 0;
let setupMeters: MeterResponse[] = [];
let setupMeterReadings: MeterReadingResponse[] = [];
let setupMeterBoundaries: MeterReadingBoundaryResponse[] = [];
let setupMeterReadingSequence = 0;
let setupMeterBoundarySequence = 0;
let setupMeterClockSequence = 0;
let setupMaintenanceIssues: MaintenanceIssueResponse[] = [];
let setupMaintenanceWorkOrders: MaintenanceWorkOrderEntryResponse[] = [];
let setupServiceEvents: ServiceEventResponse[] = [];
let setupMaintenanceClockSequence = 0;
let setupOrchestrationInspection: InspectionResponseDto | null = null;

function setupOrchestrationInspectionBundle() {
  if (!setupOrchestrationInspection) {
    throw new Error('Setup orchestration Inspection is missing.');
  }
  return {
    inspection: setupOrchestrationInspection,
    schema: inspectionSchema,
    sectionStates: [
      {
        sectionId: inspectionSectionId,
        revision: 0,
      },
    ],
    responses: [],
    findings: [],
    evidence: [],
    signatures: [],
    finalSnapshot: null,
  };
}

function nextSetupMaintenanceAt(): string {
  const instants = [
    '2027-10-01T09:15:00.000Z',
    '2027-10-01T09:20:00.000Z',
    '2027-10-01T09:25:00.000Z',
    '2027-10-01T09:30:00.000Z',
    '2027-10-01T09:35:00.000Z',
    '2027-10-01T09:45:00.000Z',
    '2027-10-01T09:46:00.000Z',
    '2027-10-01T09:50:00.000Z',
    '2027-10-01T09:55:00.000Z',
  ];
  const value = instants[setupMaintenanceClockSequence++];
  if (!value) throw new Error('Setup Maintenance clock exhausted.');
  return value;
}

function replaceSetupWorkOrder(workOrder: MaintenanceWorkOrderResponse): void {
  setupMaintenanceWorkOrders = setupMaintenanceWorkOrders.map((entry) =>
    entry.workOrder.id === workOrder.id
      ? { ...entry, workOrder }
      : entry,
  );
}


function nextSetupMeterRecordedAt(): string {
  const instants = [
    '2027-10-01T12:00:00.000Z',
    '2027-10-01T12:05:00.000Z',
    '2027-10-01T12:10:00.000Z',
    '2027-10-01T12:15:00.000Z',
    '2027-10-01T12:20:00.000Z',
    '2027-10-01T12:25:00.000Z',
    '2027-10-01T12:30:00.000Z',
  ];
  const value = instants[setupMeterClockSequence++];
  if (!value) throw new Error('Setup Meter clock exhausted.');
  return value;
}

function normalizeSetupMeterValue(raw: string): string {
  const value = raw.trim();
  const match = /^(0|[1-9]\d{0,17})(?:\.(\d{1,6}))?$/.exec(value);
  if (!match) throw new Error('Invalid setup Meter Reading value.');
  return `${match[1]}.${(match[2] ?? '').padEnd(6, '0')}`;
}

function setupMeterConsumptionIntervals(meterIdValue: string) {
  const readings = setupMeterReadings
    .filter((reading) => reading.meterId === meterIdValue)
    .sort((left, right) => {
      const read = left.readAt.localeCompare(right.readAt);
      if (read !== 0) return read;
      const recorded = left.recordedAt.localeCompare(right.recordedAt);
      if (recorded !== 0) return recorded;
      return left.id.localeCompare(right.id);
    });

  return readings.slice(1).map((to, index) => {
    const from = readings[index]!;
    const fromScaled = BigInt(from.value.replace('.', ''));
    const toScaled = BigInt(to.value.replace('.', ''));
    const consumptionScaled =
      toScaled < fromScaled ? null : toScaled - fromScaled;
    let consumption: string | null = null;
    if (consumptionScaled !== null) {
      const raw = consumptionScaled.toString().padStart(7, '0');
      consumption = `${raw.slice(0, -6) || '0'}.${raw.slice(-6)}`;
    }
    return {
      fromReadingId: from.id,
      toReadingId: to.id,
      fromReadAt: from.readAt,
      toReadAt: to.readAt,
      fromValue: from.value,
      toValue: to.value,
      consumption,
      continuity: consumption === null ? 'decrease_detected' : 'continuous',
    };
  });
}

function setupMeterDetail(meterIdValue: string) {
  const meter = setupMeters.find((candidate) => candidate.id === meterIdValue);
  if (!meter) throw new Error('Setup Meter not found.');
  const readings = setupMeterReadings.filter(
    (reading) => reading.meterId === meterIdValue,
  );
  const readingIds = new Set(readings.map((reading) => reading.id));
  const boundaries = setupMeterBoundaries.filter((boundary) =>
    readingIds.has(boundary.readingId),
  );
  return {
    meter,
    readings,
    boundaries,
    consumptionIntervals: setupMeterConsumptionIntervals(meterIdValue),
  };
}

function nextSetupAssetInstant(): string {
  const instants = [
    '2027-10-01T08:00:00.000Z',
    '2027-10-01T09:00:00.000Z',
    '2027-10-01T10:00:00.000Z',
    '2027-10-01T11:00:00.000Z',
  ];
  const value = instants[setupAssetMutationSequence++];
  if (!value) throw new Error('Setup Asset mutation clock exhausted.');
  return value;
}

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

const agreementDocumentReference: LeaseAgreementDocumentReferenceResponse = {
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

const amendmentDocumentReference: LeaseAmendmentDocumentReferenceResponse = {
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

const setupInspectionFinding: InspectionFindingResponse = {
  id: setupInspectionFindingId,
  inspectionId: setupMaintenanceInspectionId,
  sectionId: inspectionSectionId,
  itemId: inspectionNotesItemId,
  severity: 'major',
  title: 'Washer leak observed',
  description: 'Water below appliance during handover.',
  createdByUserId: inspectionUserId,
  createdAt: '2025-06-30T08:30:00.000Z',
};

function setupMaintenanceInspectionRecord() {
  return {
    id: setupMaintenanceInspectionId,
    code: 'INS-MAINT-BRW',
    inspectionType: 'move_in',
    unitId: setupUnitId,
    tenancyId: null,
    schemaVersionId: inspectionSchemaVersionId,
    assignedToUserId: inspectionUserId,
    createdByUserId: inspectionUserId,
    scheduledFor: '2027-10-01',
    status: 'in_progress',
    startedAt: '2027-10-01T08:30:00.000Z',
    lockedAt: null,
    finalizedAt: null,
    cancelledAt: null,
    version: 2,
    contentRevision: 0,
  };
}

function setupMaintenanceInspectionBundle() {
  return {
    inspection: setupMaintenanceInspectionRecord(),
    schema: inspectionSchema,
    sectionStates: [
      {
        sectionId: inspectionSectionId,
        revision: 0,
      },
    ],
    responses: [],
    findings: [setupInspectionFinding],
    evidence: [],
    signatures: [],
    finalSnapshot: null,
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

function documentCatalog(): DocumentResponse[] {
  return [
    agreementDocumentReference.document,
    amendmentDocumentReference.document,
    ...setupDocuments,
  ];
}

function versionsForDocument(documentIdValue: string): DocumentVersionResponse[] {
  if (documentIdValue === agreementDocumentId) {
    if (!agreementDocumentReference.linkedVersion) {
      throw new Error('Agreement browser Document is missing its linked version.');
    }
    return [agreementDocumentReference.linkedVersion];
  }
  if (documentIdValue === amendmentDocumentId) {
    if (!amendmentDocumentReference.linkedVersion) {
      throw new Error('Amendment browser Document is missing its linked version.');
    }
    return [amendmentDocumentReference.linkedVersion];
  }
  return setupDocumentVersions.filter(
    (version) => version.documentId === documentIdValue,
  );
}

function setupDocumentReferences(
  targetType: 'lease_agreement' | 'lease_amendment',
  targetId: string,
) {
  return setupDocumentLinks
    .filter(
      (link) =>
        link.targetType === targetType &&
        link.targetId === targetId,
    )
    .map((link) => {
      const document = setupDocuments.find(
        (candidate) => candidate.id === link.documentId,
      );
      if (!document) throw new Error('Setup DocumentLink has no Document.');
      const linkedVersion =
        link.documentVersionId === null
          ? null
          : setupDocumentVersions.find(
              (candidate) => candidate.id === link.documentVersionId,
            ) ?? null;
      if (link.documentVersionId !== null && linkedVersion === null) {
        throw new Error('Setup DocumentLink has no linked version.');
      }
      return { document, link, linkedVersion };
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

type BrowserHarnessWindow = Window & {
  __portfolioBinaryReads?: number;
  __portfolioDocumentUploadCount?: number;
  __portfolioHoldUnitCreate?: boolean;
  __portfolioHoldSpaceCreate?: boolean;
  __portfolioHoldTenancyMutation?: boolean;
  __portfolioHoldContractMutation?: boolean;
  __portfolioHoldAssetMutation?: boolean;
  __portfolioHoldMeterMutation?: boolean;
  __portfolioHoldMaintenanceMutation?: boolean;
  __portfolioHoldInspectionOrchestration?: boolean;
  __portfolioFailNextInspectionCreateAfterCommit?: boolean;
  __portfolioFailNextInspectionOrchestrationAfterCommit?: boolean;
  __portfolioFailNextMaintenanceIssueCreateAfterCommit?: boolean;
  __portfolioFailNextMaintenanceWorkOrderCreateAfterCommit?: boolean;
  __portfolioFailNextServiceEventCreateAfterCommit?: boolean;
  __portfolioFailNextServiceEventLink?: boolean;
  __portfolioFailNextMeterReadingAfterCommit?: boolean;
  __portfolioFailNextMeterBoundaryAfterCommit?: boolean;
  __portfolioFailNextAssetMoveAfterCommit?: boolean;
  __portfolioConcurrentAssetMoveAcrossProperty?: boolean;
  __portfolioFailNextAssetReplacementAfterCommit?: boolean;
  __portfolioFailNextSignedOriginalLink?: boolean;
  __portfolioPendingUnitCreate?: boolean;
  __portfolioPendingSpaceCreate?: boolean;
  __portfolioPendingTenancyMutation?: boolean;
  __portfolioPendingContractMutation?: boolean;
  __portfolioPendingAssetMutation?: boolean;
  __portfolioPendingMeterMutation?: boolean;
  __portfolioPendingMaintenanceMutation?: boolean;
  __portfolioPendingInspectionOrchestration?: boolean;
  __portfolioReleaseUnitCreate?: () => boolean;
  __portfolioReleaseSpaceCreate?: () => boolean;
  __portfolioReleaseTenancyMutation?: () => boolean;
  __portfolioReleaseContractMutation?: () => boolean;
  __portfolioReleaseAssetMutation?: () => boolean;
  __portfolioReleaseMeterMutation?: () => boolean;
  __portfolioReleaseMaintenanceMutation?: () => boolean;
  __portfolioReleaseInspectionOrchestration?: () => boolean;
};

const browserHarnessWindow = window as BrowserHarnessWindow;
browserHarnessWindow.__portfolioBinaryReads = 0;
browserHarnessWindow.__portfolioDocumentUploadCount = 0;

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
let heldAssetMutation:
  | { readonly response: Response; readonly resolve: (response: Response) => void }
  | null = null;
let heldMeterMutation:
  | { readonly response: Response; readonly resolve: (response: Response) => void }
  | null = null;
let heldMaintenanceMutation:
  | { readonly response: Response; readonly resolve: (response: Response) => void }
  | null = null;
let heldInspectionOrchestration:
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

function maybeHoldAssetMutation(response: Response): Promise<Response> {
  if (!browserHarnessWindow.__portfolioHoldAssetMutation) {
    return Promise.resolve(response);
  }

  browserHarnessWindow.__portfolioPendingAssetMutation = true;
  return new Promise<Response>((resolve) => {
    heldAssetMutation = { response, resolve };
  });
}

function maybeHoldMeterMutation(response: Response): Promise<Response> {
  if (!browserHarnessWindow.__portfolioHoldMeterMutation) {
    return Promise.resolve(response);
  }

  browserHarnessWindow.__portfolioPendingMeterMutation = true;
  return new Promise<Response>((resolve) => {
    heldMeterMutation = { response, resolve };
  });
}

function maybeHoldMaintenanceMutation(response: Response): Promise<Response> {
  if (!browserHarnessWindow.__portfolioHoldMaintenanceMutation) {
    return Promise.resolve(response);
  }

  browserHarnessWindow.__portfolioPendingMaintenanceMutation = true;
  return new Promise<Response>((resolve) => {
    heldMaintenanceMutation = { response, resolve };
  });
}

function maybeHoldInspectionOrchestration(
  response: Response,
): Promise<Response> {
  if (!browserHarnessWindow.__portfolioHoldInspectionOrchestration) {
    return Promise.resolve(response);
  }

  browserHarnessWindow.__portfolioPendingInspectionOrchestration = true;
  return new Promise<Response>((resolve) => {
    heldInspectionOrchestration = { response, resolve };
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

browserHarnessWindow.__portfolioReleaseAssetMutation = () => {
  if (!heldAssetMutation) return false;
  const held = heldAssetMutation;
  heldAssetMutation = null;
  browserHarnessWindow.__portfolioHoldAssetMutation = false;
  browserHarnessWindow.__portfolioPendingAssetMutation = false;
  held.resolve(held.response);
  return true;
};

browserHarnessWindow.__portfolioReleaseMeterMutation = () => {
  if (!heldMeterMutation) return false;
  const held = heldMeterMutation;
  heldMeterMutation = null;
  browserHarnessWindow.__portfolioHoldMeterMutation = false;
  browserHarnessWindow.__portfolioPendingMeterMutation = false;
  held.resolve(held.response);
  return true;
};

browserHarnessWindow.__portfolioReleaseMaintenanceMutation = () => {
  if (!heldMaintenanceMutation) return false;
  const held = heldMaintenanceMutation;
  heldMaintenanceMutation = null;
  browserHarnessWindow.__portfolioHoldMaintenanceMutation = false;
  browserHarnessWindow.__portfolioPendingMaintenanceMutation = false;
  held.resolve(held.response);
  return true;
};

browserHarnessWindow.__portfolioReleaseInspectionOrchestration = () => {
  if (!heldInspectionOrchestration) return false;
  const held = heldInspectionOrchestration;
  heldInspectionOrchestration = null;
  browserHarnessWindow.__portfolioHoldInspectionOrchestration = false;
  browserHarnessWindow.__portfolioPendingInspectionOrchestration = false;
  held.resolve(held.response);
  return true;
};

globalThis.fetch = async (
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> => {
  const url = apiPath(input);
  const path = url.pathname;

  if (path === '/documents') {
    if (init?.method === 'POST') {
      requirePortfolioAuth(init);
      const body = JSON.parse(String(init.body)) as {
        code: string;
        title: string;
        category: DocumentResponse['category'];
      };
      if (
        documentCatalog().some(
          (candidate) => candidate.code.toLowerCase() === body.code.toLowerCase(),
        )
      ) {
        return apiError(
          409,
          'DOCUMENT_CODE_ALREADY_EXISTS',
          'Document code already exists.',
        );
      }
      const id = setupDocumentIds[setupDocumentSequence++];
      if (!id) throw new Error('Setup Document id pool exhausted.');
      const created: DocumentResponse = {
        id,
        code: body.code,
        title: body.title,
        category: body.category,
        status: 'active',
        latestVersionNumber: 0,
        revision: 1,
      };
      setupDocuments.push(created);
      return json(created, 201);
    }
    return json({ items: documentCatalog() });
  }

  const setupDocumentVersionMatch =
    /^\/documents\/([^/]+)\/versions$/.exec(path);
  if (setupDocumentVersionMatch) {
    const documentIdValue = setupDocumentVersionMatch[1]!;
    if (init?.method === 'POST') {
      requirePortfolioAuth(init);
      const document = setupDocuments.find(
        (candidate) => candidate.id === documentIdValue,
      );
      if (!document) {
        return apiError(404, 'DOCUMENT_NOT_FOUND', 'Document not found.');
      }

      const expectedRevision = Number(
        url.searchParams.get('expectedDocumentRevision'),
      );
      if (expectedRevision !== document.revision) {
        return apiError(
          409,
          'DOCUMENT_VERSION_CONFLICT',
          'Document changed before the new version upload started.',
        );
      }

      const fileName = url.searchParams.get('fileName')?.trim();
      const mimeType =
        new Headers(init.headers).get('content-type')?.split(';')[0]?.trim();
      if (!fileName || !mimeType) {
        return apiError(400, 'VALIDATION_ERROR', 'Invalid upload.');
      }

      let bytes: Uint8Array;
      if (init.body instanceof Blob) {
        bytes = new Uint8Array(await init.body.arrayBuffer());
      } else if (init.body instanceof ArrayBuffer) {
        bytes = new Uint8Array(init.body);
      } else if (ArrayBuffer.isView(init.body)) {
        bytes = new Uint8Array(
          init.body.buffer,
          init.body.byteOffset,
          init.body.byteLength,
        );
      } else {
        throw new Error('Unexpected setup Document binary body.');
      }
      if (bytes.byteLength === 0) {
        return apiError(422, 'DOCUMENT_INVALID_UPLOAD', 'Upload is empty.');
      }

      const id = setupDocumentVersionIds[setupDocumentVersionSequence++];
      if (!id) throw new Error('Setup DocumentVersion id pool exhausted.');
      const version: DocumentVersionResponse = {
        id,
        documentId: document.id,
        versionNumber: document.latestVersionNumber + 1,
        fileName,
        mimeType,
        byteSize: bytes.byteLength,
        sha256: (setupDocumentVersionSequence % 2 === 0 ? 'e' : 'f').repeat(64),
        status: 'stored',
        finalizedAt: null,
      };
      setupDocumentVersions.push(version);
      browserHarnessWindow.__portfolioDocumentUploadCount =
        (browserHarnessWindow.__portfolioDocumentUploadCount ?? 0) + 1;
      setupDocuments = setupDocuments.map((candidate) =>
        candidate.id === document.id
          ? {
              ...candidate,
              latestVersionNumber: version.versionNumber,
              revision: candidate.revision + 1,
            }
          : candidate,
      );
      return json(version, 201);
    }

    return json({ items: versionsForDocument(documentIdValue) });
  }

  const setupFinalizeMatch =
    /^\/document-versions\/([^/]+)\/finalize$/.exec(path);
  if (setupFinalizeMatch && init?.method === 'POST') {
    requirePortfolioAuth(init);
    const versionIdValue = setupFinalizeMatch[1]!;
    const version = setupDocumentVersions.find(
      (candidate) => candidate.id === versionIdValue,
    );
    if (!version) {
      return apiError(
        404,
        'DOCUMENT_VERSION_NOT_FOUND',
        'Document version not found.',
      );
    }
    if (version.status !== 'stored') {
      return apiError(
        409,
        'DOCUMENT_VERSION_CONFLICT',
        'Document version changed before it could be finalized.',
      );
    }
    const finalized: DocumentVersionResponse = {
      ...version,
      status: 'final',
      finalizedAt: '2027-06-20T12:00:00.000Z',
    };
    setupDocumentVersions = setupDocumentVersions.map((candidate) =>
      candidate.id === finalized.id ? finalized : candidate,
    );
    return json(finalized);
  }

  const setupDocumentLinksMatch =
    /^\/documents\/([^/]+)\/links$/.exec(path);
  if (setupDocumentLinksMatch && init?.method === 'POST') {
    requirePortfolioAuth(init);
    const documentIdValue = setupDocumentLinksMatch[1]!;
    const document = setupDocuments.find(
      (candidate) => candidate.id === documentIdValue,
    );
    if (!document) {
      return apiError(404, 'DOCUMENT_NOT_FOUND', 'Document not found.');
    }
    const body = JSON.parse(String(init.body)) as {
      documentVersionId?: string | null;
      relation: DocumentLinkResponse['relation'];
      targetType: DocumentLinkResponse['targetType'];
      targetId: string;
    };

    if (
      body.relation === 'signed_original' &&
      browserHarnessWindow.__portfolioFailNextSignedOriginalLink
    ) {
      browserHarnessWindow.__portfolioFailNextSignedOriginalLink = false;
      return apiError(
        503,
        'SIGNED_DOCUMENT_LINK_TEST_FAILURE',
        'Intentional browser-harness link failure.',
      );
    }

    const linkedVersion =
      body.documentVersionId == null
        ? null
        : setupDocumentVersions.find(
            (candidate) => candidate.id === body.documentVersionId,
          ) ?? null;
    if (
      body.relation === 'signed_original' &&
      linkedVersion?.status !== 'final'
    ) {
      return apiError(
        422,
        'DOCUMENT_SIGNED_ORIGINAL_VERSION_NOT_FINAL',
        'signed_original requires a finalized immutable document version.',
      );
    }

    if (
      body.relation === 'signed_original' &&
      setupDocumentLinks.some(
        (candidate) =>
          candidate.relation === 'signed_original' &&
          candidate.targetType === body.targetType &&
          candidate.targetId === body.targetId,
      )
    ) {
      return apiError(
        409,
        'DOCUMENT_SIGNED_ORIGINAL_ALREADY_EXISTS',
        'This legal record already has a signed original document.',
      );
    }

    const id = setupDocumentLinkIds[setupDocumentLinkSequence++];
    if (!id) throw new Error('Setup DocumentLink id pool exhausted.');
    const link: DocumentLinkResponse = {
      id,
      documentId: document.id,
      documentVersionId: body.documentVersionId ?? null,
      relation: body.relation,
      targetType: body.targetType,
      targetId: body.targetId,
    };
    setupDocumentLinks.push(link);
    return json(link, 201);
  }

  const setupBinaryMatch =
    /^\/document-versions\/([^/]+)\/content$/.exec(path);
  if (setupBinaryMatch) {
    const version = setupDocumentVersions.find(
      (candidate) => candidate.id === setupBinaryMatch[1],
    );
    if (version) {
      requirePortfolioAuth(init);
      browserHarnessWindow.__portfolioBinaryReads =
        (browserHarnessWindow.__portfolioBinaryReads ?? 0) + 1;
      return new Response(new Uint8Array([7, 8, 9]), {
        status: 200,
        headers: { 'content-type': version.mimeType },
      });
    }
  }

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
    return json({
      items: setupUnit ? [setupUnit, setupDestinationUnit] : [],
    });
  }

  if (path === '/properties/' + setupRecoveryPropertyId) {
    return json(setupRecoveryProperty);
  }

  if (path === '/properties/' + setupRecoveryPropertyId + '/units') {
    return json({ items: [setupRecoveryUnit] });
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

  if (setupUnit && path === '/units/' + setupUnitId + '/meters') {
    return json({
      meters: setupMeters.filter((meter) => meter.unitId === setupUnitId),
    });
  }

  if (path === '/meters' && init?.method === 'POST') {
    requirePortfolioAuth(init);
    const body = JSON.parse(String(init.body)) as {
      code: string;
      serialNumber: string;
      utilityType: MeterResponse['utilityType'];
      measurementUnit: MeterResponse['measurementUnit'];
      unitId: string;
      spaceId?: string | null;
      label: string;
      installedAt: string;
    };
    if (
      body.unitId !== setupUnitId ||
      (body.spaceId != null && body.spaceId !== setupSpaceId)
    ) {
      throw new Error('Setup Meter was created for the wrong Unit/Space.');
    }
    if (
      setupMeters.some(
        (meter) => meter.code.toLowerCase() === body.code.toLowerCase(),
      )
    ) {
      return apiError(
        409,
        'METER_CODE_ALREADY_EXISTS',
        'Meter code already exists.',
      );
    }
    if (
      (body.utilityType === 'water' && body.measurementUnit !== 'm3') ||
      ((body.utilityType === 'electricity' || body.utilityType === 'heat') &&
        body.measurementUnit !== 'kwh')
    ) {
      return apiError(
        422,
        'METER_MEASUREMENT_UNIT_INVALID',
        'Measurement unit is not valid for this utility type.',
      );
    }

    const created: MeterResponse = {
      id: setupMeterId,
      code: body.code,
      serialNumber: body.serialNumber,
      utilityType: body.utilityType,
      measurementUnit: body.measurementUnit,
      unitId: setupUnitId,
      spaceId: body.spaceId ?? null,
      label: body.label,
      installedAt: body.installedAt,
      status: 'active',
      retiredAt: null,
      retirementRecordedAt: null,
      retiredByUserId: null,
      retirementReason: null,
      version: 1,
      recordedAt: nextSetupMeterRecordedAt(),
      recordedByUserId: inspectionUserId,
    };
    setupMeters.push(created);
    return json(created, 201);
  }

  const setupMeter = setupMeters.find((meter) =>
    path.startsWith('/meters/' + meter.id),
  );

  if (setupMeter && path === '/meters/' + setupMeter.id) {
    if (init?.method === 'PATCH') {
      requirePortfolioAuth(init);
      const body = JSON.parse(String(init.body)) as {
        expectedVersion: number;
        label: string;
      };
      if (body.expectedVersion !== setupMeter.version) {
        return apiError(
          409,
          'METER_VERSION_CONFLICT',
          'Meter has changed since the caller last read it.',
        );
      }
      const updated: MeterResponse = {
        ...setupMeter,
        label: body.label,
        version:
          body.label === setupMeter.label
            ? setupMeter.version
            : setupMeter.version + 1,
      };
      setupMeters = setupMeters.map((meter) =>
        meter.id === updated.id ? updated : meter,
      );
      return maybeHoldMeterMutation(json(updated));
    }
    return json(setupMeterDetail(setupMeter.id));
  }

  if (
    setupMeter &&
    path === '/meters/' + setupMeter.id + '/readings' &&
    init?.method === 'POST'
  ) {
    requirePortfolioAuth(init);
    const body = JSON.parse(String(init.body)) as {
      value: string;
      readAt: string;
      note?: string | null;
    };
    if (
      setupMeterReadings.some(
        (reading) =>
          reading.meterId === setupMeter.id && reading.readAt === body.readAt,
      )
    ) {
      return apiError(
        409,
        'METER_READING_AT_TIME_ALREADY_EXISTS',
        'Meter already has a reading at this exact occurrence time.',
      );
    }
    if (
      setupMeter.status === 'retired' &&
      setupMeter.retiredAt !== null &&
      body.readAt > setupMeter.retiredAt
    ) {
      return apiError(
        422,
        'METER_READING_AFTER_RETIREMENT',
        'Meter reading cannot occur after Meter retirement.',
      );
    }
    const id = setupMeterReadingIds[setupMeterReadingSequence++];
    if (!id) throw new Error('Setup Meter Reading id pool exhausted.');
    const reading: MeterReadingResponse = {
      id,
      meterId: setupMeter.id,
      value: normalizeSetupMeterValue(body.value),
      readAt: body.readAt,
      recordedAt: nextSetupMeterRecordedAt(),
      recordedByUserId: inspectionUserId,
      note: body.note ?? null,
    };
    setupMeterReadings.push(reading);

    if (browserHarnessWindow.__portfolioFailNextMeterReadingAfterCommit) {
      browserHarnessWindow.__portfolioFailNextMeterReadingAfterCommit = false;
      return apiError(
        503,
        'METER_READING_TEST_ACK_LOST',
        'Intentional browser-harness Reading acknowledgement loss.',
      );
    }

    return json(reading, 201);
  }

  if (
    setupMeter &&
    path === '/meters/' + setupMeter.id + '/retire' &&
    init?.method === 'POST'
  ) {
    requirePortfolioAuth(init);
    const body = JSON.parse(String(init.body)) as {
      expectedVersion: number;
      retiredAt: string;
      retirementReason: string;
    };
    if (body.expectedVersion !== setupMeter.version) {
      return apiError(
        409,
        'METER_VERSION_CONFLICT',
        'Meter has changed since the caller last read it.',
      );
    }
    const latestReadAt = setupMeterReadings
      .filter((reading) => reading.meterId === setupMeter.id)
      .map((reading) => reading.readAt)
      .sort()
      .at(-1);
    if (latestReadAt && body.retiredAt < latestReadAt) {
      return apiError(
        422,
        'METER_RETIREMENT_BEFORE_READING',
        'Meter retirement cannot predate existing reading history.',
      );
    }
    const retired: MeterResponse = {
      ...setupMeter,
      status: 'retired',
      retiredAt: body.retiredAt,
      retirementRecordedAt: nextSetupMeterRecordedAt(),
      retiredByUserId: inspectionUserId,
      retirementReason: body.retirementReason,
      version: setupMeter.version + 1,
    };
    setupMeters = setupMeters.map((meter) =>
      meter.id === retired.id ? retired : meter,
    );
    return json(retired);
  }

  const setupMeterBoundaryMatch =
    /^\/meter-readings\/([^/]+)\/boundaries$/.exec(path);
  if (setupMeterBoundaryMatch && init?.method === 'POST') {
    requirePortfolioAuth(init);
    const reading = setupMeterReadings.find(
      (candidate) => candidate.id === setupMeterBoundaryMatch[1],
    );
    if (!reading) {
      return apiError(
        404,
        'METER_READING_NOT_FOUND',
        'Meter reading not found.',
      );
    }
    const meter = setupMeters.find(
      (candidate) => candidate.id === reading.meterId,
    );
    if (!meter) throw new Error('Setup Reading has no Meter.');
    const body = JSON.parse(String(init.body)) as {
      tenancyId: string;
      type: MeterReadingBoundaryResponse['type'];
    };
    if (!setupTenancy || body.tenancyId !== setupTenancy.id) {
      return apiError(404, 'TENANCY_NOT_FOUND', 'Tenancy not found.');
    }
    if (setupTenancy.unitId !== meter.unitId) {
      return apiError(
        422,
        'METER_READING_TENANCY_UNIT_MISMATCH',
        'Meter reading boundary Tenancy must belong to the Meter Unit.',
      );
    }

    const readDate = reading.readAt.slice(0, 10);
    const expectedDate =
      body.type === 'move_in'
        ? setupTenancy.actualStart
        : setupTenancy.actualEnd;
    if (!expectedDate) {
      return apiError(
        422,
        body.type === 'move_in'
          ? 'METER_MOVE_IN_REQUIRES_ACTUAL_START'
          : 'METER_MOVE_OUT_REQUIRES_ACTUAL_END',
        'Tenancy occurrence date is missing.',
      );
    }
    if (readDate !== expectedDate) {
      return apiError(
        422,
        body.type === 'move_in'
          ? 'METER_MOVE_IN_DATE_MISMATCH'
          : 'METER_MOVE_OUT_DATE_MISMATCH',
        'Meter Reading UTC date does not match the Tenancy boundary date.',
      );
    }
    const readingIdsForMeter = new Set(
      setupMeterReadings
        .filter((candidate) => candidate.meterId === meter.id)
        .map((candidate) => candidate.id),
    );
    if (
      setupMeterBoundaries.some(
        (boundary) =>
          readingIdsForMeter.has(boundary.readingId) &&
          boundary.tenancyId === body.tenancyId &&
          boundary.type === body.type,
      )
    ) {
      return apiError(
        409,
        'METER_READING_BOUNDARY_ALREADY_EXISTS',
        'This Meter already has the requested Tenancy boundary reading.',
      );
    }

    const id = setupMeterBoundaryIds[setupMeterBoundarySequence++];
    if (!id) throw new Error('Setup Meter Boundary id pool exhausted.');
    const boundary: MeterReadingBoundaryResponse = {
      id,
      readingId: reading.id,
      tenancyId: body.tenancyId,
      type: body.type,
      recordedAt: nextSetupMeterRecordedAt(),
      recordedByUserId: inspectionUserId,
    };
    setupMeterBoundaries.push(boundary);

    if (browserHarnessWindow.__portfolioFailNextMeterBoundaryAfterCommit) {
      browserHarnessWindow.__portfolioFailNextMeterBoundaryAfterCommit = false;
      return apiError(
        503,
        'METER_BOUNDARY_TEST_ACK_LOST',
        'Intentional browser-harness Boundary acknowledgement loss.',
      );
    }

    return json(boundary, 201);
  }

  if (setupProperty && path === '/units/' + setupDestinationUnitId) {
    return json(setupDestinationUnit);
  }

  if (setupProperty && path === '/units/' + setupDestinationUnitId + '/spaces') {
    return json({ items: [setupDestinationSpace] });
  }

  if (setupProperty && path === '/units/' + setupDestinationUnitId + '/assets') {
    return json({
      items: setupAssets.filter(
        (asset) => asset.unitId === setupDestinationUnitId,
      ),
    });
  }

  if (path === '/units/' + setupRecoveryUnitId) {
    return json(setupRecoveryUnit);
  }

  if (path === '/units/' + setupRecoveryUnitId + '/spaces') {
    return json({ items: [setupRecoverySpace] });
  }

  if (path === '/units/' + setupRecoveryUnitId + '/assets') {
    return json({
      items: setupAssets.filter((asset) => asset.unitId === setupRecoveryUnitId),
    });
  }


  if (path === '/properties/' + orchestrationPropertyId) {
    return json(orchestrationProperty);
  }

  if (path === '/properties/' + orchestrationPropertyId + '/units') {
    return json({ items: [orchestrationUnit] });
  }

  if (path === '/units/' + orchestrationUnitId) {
    return json(orchestrationUnit);
  }

  if (path === '/units/' + orchestrationUnitId + '/spaces') {
    return json({ items: [] });
  }

  if (path === '/units/' + orchestrationUnitId + '/tenancies') {
    return json({ items: [] });
  }

  if (
    path === '/units/' + orchestrationUnitId + '/inspections' &&
    (!init?.method || init.method === 'GET')
  ) {
    return json({
      items: setupOrchestrationInspection
        ? [setupOrchestrationInspection]
        : [],
    });
  }

  if (
    path === '/units/' + orchestrationUnitId + '/inspections' &&
    init?.method === 'POST'
  ) {
    requireInspectionAuth(init);
    const body = JSON.parse(String(init.body)) as {
      code: string;
      inspectionType: InspectionResponseDto['inspectionType'];
      tenancyId?: string | null;
      schemaVersionId: string;
      assignedToUserId?: string;
      scheduledFor?: string | null;
    };
    if (
      body.inspectionType !== inspectionSchema.inspectionType ||
      body.schemaVersionId !== inspectionSchemaVersionId ||
      body.tenancyId != null ||
      body.assignedToUserId !== inspectionUserId
    ) {
      throw new Error(
        'Orchestration Inspection create targeted invalid context.',
      );
    }
    setupOrchestrationInspection = {
      id: setupOrchestrationInspectionId,
      code: body.code,
      inspectionType: body.inspectionType,
      unitId: orchestrationUnitId,
      tenancyId: null,
      schemaVersionId: body.schemaVersionId,
      assignedToUserId: body.assignedToUserId,
      createdByUserId: inspectionUserId,
      scheduledFor: body.scheduledFor ?? null,
      status: 'draft',
      startedAt: null,
      lockedAt: null,
      finalizedAt: null,
      cancelledAt: null,
      version: 1,
      contentRevision: 0,
    };

    if (browserHarnessWindow.__portfolioFailNextInspectionCreateAfterCommit) {
      browserHarnessWindow.__portfolioFailNextInspectionCreateAfterCommit =
        false;
      return apiError(
        503,
        'INSPECTION_CREATE_TEST_ACK_LOST',
        'Intentional Inspection create acknowledgement loss.',
      );
    }

    return json(setupOrchestrationInspection, 201);
  }


  if (
    setupUnit &&
    path === '/units/' + setupUnitId + '/inspections'
  ) {
    return json({ items: [setupMaintenanceInspectionRecord()] });
  }

  if (path === '/inspections/' + setupMaintenanceInspectionId) {
    return json(setupMaintenanceInspectionBundle());
  }

  if (
    setupOrchestrationInspection &&
    path === '/inspections/' + setupOrchestrationInspection.id
  ) {
    return json(setupOrchestrationInspectionBundle());
  }

  if (
    setupOrchestrationInspection &&
    path ===
      '/inspections/' +
        setupOrchestrationInspection.id +
        '/orchestration' &&
    init?.method === 'POST'
  ) {
    requireInspectionAuth(init);
    const body = JSON.parse(String(init.body)) as {
      expectedVersion: number;
      assignedToUserId: string;
      scheduledFor: string | null;
    };
    if (body.expectedVersion !== setupOrchestrationInspection.version) {
      return apiError(
        409,
        'INSPECTION_VERSION_CONFLICT',
        'Inspection version conflict.',
      );
    }
    if (setupOrchestrationInspection.status !== 'draft') {
      return apiError(
        422,
        'INSPECTION_ORCHESTRATION_LOCKED',
        'Inspection orchestration is frozen after start.',
      );
    }
    if (
      body.assignedToUserId !== inspectionUserId &&
      body.assignedToUserId !== setupOrchestrationOtherStaffId
    ) {
      return apiError(
        422,
        'INSPECTION_ASSIGNEE_INVALID',
        'Assigned staff is invalid.',
      );
    }

    setupOrchestrationInspection = {
      ...setupOrchestrationInspection,
      assignedToUserId: body.assignedToUserId,
      scheduledFor: body.scheduledFor,
      version: setupOrchestrationInspection.version + 1,
    };

    if (
      browserHarnessWindow.__portfolioFailNextInspectionOrchestrationAfterCommit
    ) {
      browserHarnessWindow.__portfolioFailNextInspectionOrchestrationAfterCommit =
        false;
      return apiError(
        503,
        'INSPECTION_ORCHESTRATION_TEST_ACK_LOST',
        'Intentional Inspection orchestration acknowledgement loss.',
      );
    }

    return maybeHoldInspectionOrchestration(
      json(setupOrchestrationInspection),
    );
  }

  if (
    setupOrchestrationInspection &&
    path === '/inspections/' + setupOrchestrationInspection.id + '/start' &&
    init?.method === 'POST'
  ) {
    requireInspectionAuth(init);
    const body = JSON.parse(String(init.body)) as {
      expectedVersion: number;
    };
    if (body.expectedVersion !== setupOrchestrationInspection.version) {
      return apiError(
        409,
        'INSPECTION_VERSION_CONFLICT',
        'Inspection version conflict.',
      );
    }
    if (setupOrchestrationInspection.status !== 'draft') {
      return apiError(
        422,
        'INSPECTION_INVALID_TRANSITION',
        'Inspection cannot start.',
      );
    }
    setupOrchestrationInspection = {
      ...setupOrchestrationInspection,
      status: 'in_progress',
      startedAt: '2027-10-02T08:00:00.000Z',
      version: setupOrchestrationInspection.version + 1,
    };
    return json(setupOrchestrationInspection);
  }

  if (setupUnit && path === '/units/' + setupUnitId + '/assets') {
    return json({
      items: setupAssets.filter((asset) => asset.unitId === setupUnitId),
    });
  }

  if (path === '/assets' && init?.method === 'POST') {
    requirePortfolioAuth(init);
    const body = JSON.parse(String(init.body)) as {
      code: string;
      name: string;
      propertyId: string;
      unitId?: string | null;
      spaceId?: string | null;
      manufacturer?: string | null;
      model?: string | null;
      identifiers?: Array<{
        identifierType: AssetResponse['identifiers'][number]['identifierType'];
        value: string;
        label?: string | null;
      }>;
    };
    if (
      body.propertyId !== setupPropertyId ||
      body.unitId !== setupUnitId ||
      (body.spaceId != null && body.spaceId !== setupSpaceId)
    ) {
      throw new Error('Setup Asset was created for the wrong placement.');
    }
    const id = setupAssetIds[setupAssetSequence++];
    if (!id) throw new Error('Setup Asset id pool exhausted.');
    const identifiers = (body.identifiers ?? []).map((identifier) => {
      const identifierId =
        setupAssetIdentifierIds[setupAssetIdentifierSequence++];
      if (!identifierId) throw new Error('Setup Asset identifier id pool exhausted.');
      return {
        id: identifierId,
        assetId: id,
        identifierType: identifier.identifierType,
        value: identifier.value,
        label: identifier.label ?? null,
      };
    });
    const created: AssetResponse = {
      id,
      code: body.code,
      name: body.name,
      propertyId: setupPropertyId,
      unitId: setupUnitId,
      spaceId: body.spaceId ?? null,
      manufacturer: body.manufacturer ?? null,
      model: body.model ?? null,
      status: 'active',
      version: 1,
      identifiers,
    };
    setupAssets.push(created);

    const locationId = setupAssetLocationIds[setupAssetLocationSequence++];
    if (!locationId) throw new Error('Setup Asset location id pool exhausted.');
    setupAssetLocations.push({
      id: locationId,
      assetId: created.id,
      propertyId: setupPropertyId,
      unitId: setupUnitId,
      spaceId: created.spaceId,
      validFrom: nextSetupAssetInstant(),
      validTo: null,
      changeType: 'asset_created',
      changedByUserId: inspectionUserId,
      reason: null,
    });
    return json(created, 201);
  }

  const setupAsset = setupAssets.find((asset) =>
    path.startsWith('/assets/' + asset.id),
  );

  if (
    setupAsset &&
    path === '/assets/' + setupAsset.id + '/metadata' &&
    init?.method === 'PATCH'
  ) {
    requirePortfolioAuth(init);
    const body = JSON.parse(String(init.body)) as {
      expectedVersion: number;
      name?: string;
      manufacturer?: string | null;
      model?: string | null;
    };
    if (body.expectedVersion !== setupAsset.version) {
      return apiError(
        409,
        'ASSET_VERSION_CONFLICT',
        'Asset has changed since the caller last read it.',
      );
    }
    const updated: AssetResponse = {
      ...setupAsset,
      name: body.name ?? setupAsset.name,
      manufacturer:
        body.manufacturer === undefined
          ? setupAsset.manufacturer
          : body.manufacturer,
      model: body.model === undefined ? setupAsset.model : body.model,
      version: setupAsset.version + 1,
    };
    setupAssets = setupAssets.map((asset) =>
      asset.id === updated.id ? updated : asset,
    );
    return maybeHoldAssetMutation(json(updated));
  }

  if (
    setupAsset &&
    path === '/assets/' + setupAsset.id + '/status' &&
    init?.method === 'POST'
  ) {
    requirePortfolioAuth(init);
    const body = JSON.parse(String(init.body)) as {
      expectedVersion: number;
      status: 'active' | 'inactive' | 'retired';
    };
    if (body.expectedVersion !== setupAsset.version) {
      return apiError(
        409,
        'ASSET_VERSION_CONFLICT',
        'Asset has changed since the caller last read it.',
      );
    }
    const updated: AssetResponse = {
      ...setupAsset,
      status: body.status,
      version: setupAsset.version + 1,
    };
    setupAssets = setupAssets.map((asset) =>
      asset.id === updated.id ? updated : asset,
    );
    return json(updated);
  }

  if (
    setupAsset &&
    path === '/assets/' + setupAsset.id + '/move' &&
    init?.method === 'POST'
  ) {
    requirePortfolioAuth(init);
    const body = JSON.parse(String(init.body)) as {
      expectedVersion: number;
      propertyId: string;
      unitId?: string | null;
      spaceId?: string | null;
      reason?: string | null;
    };

    if (browserHarnessWindow.__portfolioConcurrentAssetMoveAcrossProperty) {
      browserHarnessWindow.__portfolioConcurrentAssetMoveAcrossProperty = false;
      const movedAt = nextSetupAssetInstant();
      setupAssetLocations = setupAssetLocations.map((location) =>
        location.assetId === setupAsset.id && location.validTo === null
          ? { ...location, validTo: movedAt }
          : location,
      );
      const recoveryLocationId =
        setupAssetLocationIds[setupAssetLocationSequence++];
      if (!recoveryLocationId) {
        throw new Error('Setup Asset recovery location id pool exhausted.');
      }
      setupAssetLocations.push({
        id: recoveryLocationId,
        assetId: setupAsset.id,
        propertyId: setupRecoveryPropertyId,
        unitId: setupRecoveryUnitId,
        spaceId: setupRecoverySpaceId,
        validFrom: movedAt,
        validTo: null,
        changeType: 'moved',
        changedByUserId: inspectionUserId,
        reason: 'Concurrent cross-Property move',
      });
      const concurrentlyMoved: AssetResponse = {
        ...setupAsset,
        propertyId: setupRecoveryPropertyId,
        unitId: setupRecoveryUnitId,
        spaceId: setupRecoverySpaceId,
        version: setupAsset.version + 1,
      };
      setupAssets = setupAssets.map((asset) =>
        asset.id === concurrentlyMoved.id ? concurrentlyMoved : asset,
      );
      return apiError(
        409,
        'ASSET_VERSION_CONFLICT',
        'Asset has changed since the caller last read it.',
      );
    }

    if (body.expectedVersion !== setupAsset.version) {
      return apiError(
        409,
        'ASSET_VERSION_CONFLICT',
        'Asset has changed since the caller last read it.',
      );
    }
    const validSetupPlacement =
      body.propertyId === setupPropertyId &&
      (
        (body.unitId === setupUnitId &&
          (body.spaceId == null || body.spaceId === setupSpaceId)) ||
        (body.unitId === setupDestinationUnitId &&
          (body.spaceId == null || body.spaceId === setupDestinationSpaceId))
      );
    if (!validSetupPlacement) {
      throw new Error('Setup Asset move targeted the wrong placement.');
    }
    const movedAt = nextSetupAssetInstant();
    setupAssetLocations = setupAssetLocations.map((location) =>
      location.assetId === setupAsset.id && location.validTo === null
        ? { ...location, validTo: movedAt }
        : location,
    );
    const locationId = setupAssetLocationIds[setupAssetLocationSequence++];
    if (!locationId) throw new Error('Setup Asset location id pool exhausted.');
    setupAssetLocations.push({
      id: locationId,
      assetId: setupAsset.id,
      propertyId: setupPropertyId,
      unitId: body.unitId ?? null,
      spaceId: body.spaceId ?? null,
      validFrom: movedAt,
      validTo: null,
      changeType: 'moved',
      changedByUserId: inspectionUserId,
      reason: body.reason ?? null,
    });
    const moved: AssetResponse = {
      ...setupAsset,
      propertyId: setupPropertyId,
      unitId: body.unitId ?? null,
      spaceId: body.spaceId ?? null,
      version: setupAsset.version + 1,
    };
    setupAssets = setupAssets.map((asset) =>
      asset.id === moved.id ? moved : asset,
    );

    if (browserHarnessWindow.__portfolioFailNextAssetMoveAfterCommit) {
      browserHarnessWindow.__portfolioFailNextAssetMoveAfterCommit = false;
      return apiError(
        503,
        'ASSET_MOVE_TEST_ACK_LOST',
        'Intentional browser-harness move acknowledgement loss.',
      );
    }

    return json(moved);
  }

  if (
    setupAsset &&
    path === '/assets/' + setupAsset.id + '/replacement' &&
    init?.method === 'POST'
  ) {
    requirePortfolioAuth(init);
    const body = JSON.parse(String(init.body)) as {
      expectedVersion: number;
      code: string;
      name: string;
      manufacturer?: string | null;
      model?: string | null;
      identifiers?: Array<{
        identifierType: AssetResponse['identifiers'][number]['identifierType'];
        value: string;
        label?: string | null;
      }>;
    };
    if (body.expectedVersion !== setupAsset.version) {
      return apiError(
        409,
        'ASSET_VERSION_CONFLICT',
        'Asset has changed since the caller last read it.',
      );
    }
    if (setupAssetReplacement?.replacedAssetId === setupAsset.id) {
      return apiError(
        409,
        'ASSET_ALREADY_REPLACED',
        'Asset already has a replacement successor.',
      );
    }
    const successorId = setupAssetIds[setupAssetSequence++];
    if (!successorId) throw new Error('Setup Asset successor id pool exhausted.');
    const identifiers = (body.identifiers ?? []).map((identifier) => {
      const identifierId =
        setupAssetIdentifierIds[setupAssetIdentifierSequence++];
      if (!identifierId) throw new Error('Setup Asset identifier id pool exhausted.');
      return {
        id: identifierId,
        assetId: successorId,
        identifierType: identifier.identifierType,
        value: identifier.value,
        label: identifier.label ?? null,
      };
    });
    const replacedAt = nextSetupAssetInstant();
    const successor: AssetResponse = {
      id: successorId,
      code: body.code,
      name: body.name,
      propertyId: setupAsset.propertyId,
      unitId: setupAsset.unitId,
      spaceId: setupAsset.spaceId,
      manufacturer: body.manufacturer ?? null,
      model: body.model ?? null,
      status: 'active',
      version: 1,
      identifiers,
    };
    const predecessor: AssetResponse = {
      ...setupAsset,
      propertyId: null,
      unitId: null,
      spaceId: null,
      status: 'replaced',
      version: setupAsset.version + 1,
    };
    setupAssetLocations = setupAssetLocations.map((location) =>
      location.assetId === setupAsset.id && location.validTo === null
        ? { ...location, validTo: replacedAt }
        : location,
    );
    const successorLocationId =
      setupAssetLocationIds[setupAssetLocationSequence++];
    if (!successorLocationId) {
      throw new Error('Setup Asset successor location id pool exhausted.');
    }
    setupAssetLocations.push({
      id: successorLocationId,
      assetId: successor.id,
      propertyId: successor.propertyId!,
      unitId: successor.unitId,
      spaceId: successor.spaceId,
      validFrom: replacedAt,
      validTo: null,
      changeType: 'replacement_created',
      changedByUserId: inspectionUserId,
      reason: 'Replacement for ' + setupAsset.code,
    });
    setupAssetReplacement = {
      id: setupAssetReplacementId,
      replacedAssetId: predecessor.id,
      replacementAssetId: successor.id,
      replacedByUserId: inspectionUserId,
      replacedAt,
    };
    setupAssets = setupAssets.map((asset) =>
      asset.id === predecessor.id ? predecessor : asset,
    );
    setupAssets.push(successor);

    if (browserHarnessWindow.__portfolioFailNextAssetReplacementAfterCommit) {
      browserHarnessWindow.__portfolioFailNextAssetReplacementAfterCommit = false;
      return apiError(
        503,
        'ASSET_REPLACEMENT_TEST_ACK_LOST',
        'Intentional browser-harness replacement acknowledgement loss.',
      );
    }

    return json(
      {
        replacedAsset: predecessor,
        replacementAsset: successor,
        replacement: setupAssetReplacement,
      },
      201,
    );
  }

  if (
    setupAsset &&
    path === '/assets/' + setupAsset.id + '/location-history'
  ) {
    return json({
      items: setupAssetLocations.filter(
        (location) => location.assetId === setupAsset.id,
      ),
    });
  }

  if (
    setupAsset &&
    path === '/assets/' + setupAsset.id + '/replacements'
  ) {
    return json({
      predecessor:
        setupAssetReplacement?.replacementAssetId === setupAsset.id
          ? setupAssetReplacement
          : null,
      successor:
        setupAssetReplacement?.replacedAssetId === setupAsset.id
          ? setupAssetReplacement
          : null,
    });
  }

  if (setupAsset && path === '/assets/' + setupAsset.id) {
    return json(setupAsset);
  }

  if (
    setupUnit &&
    path === '/units/' + setupUnitId + '/maintenance-issues'
  ) {
    return json({
      items: setupMaintenanceIssues.filter(
        (issue) => issue.unitId === setupUnitId,
      ),
    });
  }

  if (path === '/maintenance-issues' && init?.method === 'POST') {
    requirePortfolioAuth(init);
    const body = JSON.parse(String(init.body)) as {
      code: string;
      propertyId: string;
      unitId?: string | null;
      spaceId?: string | null;
      assetId?: string | null;
      inspectionFindingId?: string | null;
      title: string;
      description?: string | null;
      priority: MaintenanceIssueResponse['priority'];
      reportedAt?: string;
    };
    if (
      body.propertyId !== setupPropertyId ||
      body.unitId !== setupUnitId ||
      (body.spaceId != null && body.spaceId !== setupSpaceId)
    ) {
      throw new Error('Setup Maintenance Issue has invalid Unit scope.');
    }
    if (
      body.assetId != null &&
      !setupAssets.some(
        (asset) =>
          asset.id === body.assetId &&
          asset.propertyId === setupPropertyId &&
          asset.unitId === setupUnitId &&
          asset.spaceId === (body.spaceId ?? null),
      )
    ) {
      return apiError(
        422,
        'MAINTENANCE_ASSET_SCOPE_MISMATCH',
        'Maintenance Issue Asset scope does not match current setup placement.',
      );
    }
    if (
      body.inspectionFindingId != null &&
      body.inspectionFindingId !== setupInspectionFindingId
    ) {
      return apiError(
        404,
        'INSPECTION_FINDING_NOT_FOUND',
        'Inspection Finding not found.',
      );
    }
    if (
      body.inspectionFindingId != null &&
      setupMaintenanceIssues.some(
        (issue) =>
          issue.inspectionFindingId === body.inspectionFindingId,
      )
    ) {
      return apiError(
        409,
        'MAINTENANCE_FINDING_ALREADY_LINKED',
        'Inspection Finding already originated a Maintenance Issue.',
      );
    }

    const recordedAt = nextSetupMaintenanceAt();
    const created: MaintenanceIssueResponse = {
      id: setupMaintenanceIssueId,
      code: body.code,
      propertyId: setupPropertyId,
      unitId: setupUnitId,
      spaceId: body.spaceId ?? null,
      assetId: body.assetId ?? null,
      inspectionFindingId: body.inspectionFindingId ?? null,
      title: body.title,
      description: body.description ?? null,
      priority: body.priority,
      status: 'open',
      reportedAt: body.reportedAt ?? recordedAt,
      resolvedAt: null,
      cancelledAt: null,
      version: 1,
      recordedAt,
      recordedByUserId: inspectionUserId,
    };
    setupMaintenanceIssues.push(created);
    if (
      browserHarnessWindow.__portfolioFailNextMaintenanceIssueCreateAfterCommit
    ) {
      browserHarnessWindow.__portfolioFailNextMaintenanceIssueCreateAfterCommit =
        false;
      return apiError(
        503,
        'MAINTENANCE_ISSUE_CREATE_TEST_ACK_LOST',
        'Intentional Maintenance Issue create acknowledgement loss.',
      );
    }
    return json(created, 201);
  }

  const setupMaintenanceIssue = setupMaintenanceIssues.find((issue) =>
    path.startsWith('/maintenance-issues/' + issue.id),
  );

  if (
    setupMaintenanceIssue &&
    path === '/maintenance-issues/' + setupMaintenanceIssue.id &&
    init?.method === 'PATCH'
  ) {
    requirePortfolioAuth(init);
    const body = JSON.parse(String(init.body)) as {
      expectedVersion: number;
      title?: string;
      description?: string | null;
      priority?: MaintenanceIssueResponse['priority'];
    };
    if (body.expectedVersion !== setupMaintenanceIssue.version) {
      return apiError(
        409,
        'MAINTENANCE_ISSUE_VERSION_CONFLICT',
        'Maintenance Issue version conflict.',
      );
    }
    const updated: MaintenanceIssueResponse = {
      ...setupMaintenanceIssue,
      title: body.title ?? setupMaintenanceIssue.title,
      description:
        body.description === undefined
          ? setupMaintenanceIssue.description
          : body.description,
      priority: body.priority ?? setupMaintenanceIssue.priority,
      version: setupMaintenanceIssue.version + 1,
    };
    setupMaintenanceIssues = setupMaintenanceIssues.map((issue) =>
      issue.id === updated.id ? updated : issue,
    );
    return json(updated);
  }

  if (
    setupMaintenanceIssue &&
    path ===
      '/maintenance-issues/' + setupMaintenanceIssue.id + '/work-orders'
  ) {
    if (init?.method === 'POST') {
      requirePortfolioAuth(init);
      const body = JSON.parse(String(init.body)) as {
        code: string;
        title: string;
        description?: string | null;
      };
      if (setupMaintenanceIssue.status !== 'open') {
        return apiError(
          422,
          'MAINTENANCE_ISSUE_TERMINAL',
          'WorkOrders require an open Issue.',
        );
      }
      const order: MaintenanceWorkOrderResponse = {
        id: setupMaintenanceWorkOrderId,
        issueId: setupMaintenanceIssue.id,
        code: body.code,
        title: body.title,
        description: body.description ?? null,
        assignee: null,
        status: 'draft',
        assignedAt: null,
        startedAt: null,
        completedAt: null,
        cancelledAt: null,
        version: 1,
        createdAt: nextSetupMaintenanceAt(),
        createdByUserId: inspectionUserId,
      };
      setupMaintenanceWorkOrders.push({
        workOrder: order,
        serviceEventIds: [],
      });
      if (
        browserHarnessWindow.__portfolioFailNextMaintenanceWorkOrderCreateAfterCommit
      ) {
        browserHarnessWindow.__portfolioFailNextMaintenanceWorkOrderCreateAfterCommit =
          false;
        return apiError(
          503,
          'MAINTENANCE_WORK_ORDER_CREATE_TEST_ACK_LOST',
          'Intentional WorkOrder create acknowledgement loss.',
        );
      }
      return json(order, 201);
    }
    return json({
      items: setupMaintenanceWorkOrders.filter(
        (entry) => entry.workOrder.issueId === setupMaintenanceIssue.id,
      ),
    });
  }

  if (
    setupMaintenanceIssue &&
    path === '/maintenance-issues/' + setupMaintenanceIssue.id + '/status' &&
    init?.method === 'POST'
  ) {
    requirePortfolioAuth(init);
    const body = JSON.parse(String(init.body)) as {
      expectedVersion: number;
      action: 'resolve' | 'cancel';
    };
    if (body.expectedVersion !== setupMaintenanceIssue.version) {
      return apiError(
        409,
        'MAINTENANCE_ISSUE_VERSION_CONFLICT',
        'Maintenance Issue version conflict.',
      );
    }
    const orders = setupMaintenanceWorkOrders.filter(
      (entry) => entry.workOrder.issueId === setupMaintenanceIssue.id,
    );
    if (
      body.action === 'resolve' &&
      (!orders.some((entry) => entry.workOrder.status === 'completed') ||
        !orders.every((entry) =>
          ['completed', 'cancelled'].includes(entry.workOrder.status),
        ))
    ) {
      return apiError(
        422,
        'MAINTENANCE_ISSUE_OPEN_WORK_ORDERS',
        'Issue cannot resolve yet.',
      );
    }
    if (
      body.action === 'cancel' &&
      !orders.every((entry) => entry.workOrder.status === 'cancelled')
    ) {
      return apiError(
        422,
        'MAINTENANCE_ISSUE_NON_CANCELLED_WORK_ORDERS',
        'Issue cannot cancel yet.',
      );
    }
    const terminalAt = nextSetupMaintenanceAt();
    const updated: MaintenanceIssueResponse = {
      ...setupMaintenanceIssue,
      status: body.action === 'resolve' ? 'resolved' : 'cancelled',
      resolvedAt:
        body.action === 'resolve' ? terminalAt : null,
      cancelledAt:
        body.action === 'cancel' ? terminalAt : null,
      version: setupMaintenanceIssue.version + 1,
    };
    setupMaintenanceIssues = setupMaintenanceIssues.map((issue) =>
      issue.id === updated.id ? updated : issue,
    );
    return json(updated);
  }

  if (
    setupMaintenanceIssue &&
    path === '/maintenance-issues/' + setupMaintenanceIssue.id
  ) {
    return json(setupMaintenanceIssue);
  }

  const setupMaintenanceEntryForPath =
    setupMaintenanceWorkOrders.find((entry) =>
      path.startsWith(
        '/maintenance-work-orders/' + entry.workOrder.id,
      ),
    );

  if (
    setupMaintenanceEntryForPath &&
    path ===
      '/maintenance-work-orders/' +
        setupMaintenanceEntryForPath.workOrder.id &&
    init?.method === 'PATCH'
  ) {
    requirePortfolioAuth(init);
    const current = setupMaintenanceEntryForPath.workOrder;
    const body = JSON.parse(String(init.body)) as {
      expectedVersion: number;
      title?: string;
      description?: string | null;
    };
    if (body.expectedVersion !== current.version) {
      return apiError(
        409,
        'MAINTENANCE_WORK_ORDER_VERSION_CONFLICT',
        'Maintenance WorkOrder version conflict.',
      );
    }
    const updated: MaintenanceWorkOrderResponse = {
      ...current,
      title: body.title ?? current.title,
      description:
        body.description === undefined
          ? current.description
          : body.description,
      version: current.version + 1,
    };
    replaceSetupWorkOrder(updated);
    return json(updated);
  }

  if (
    setupMaintenanceEntryForPath &&
    path ===
      '/maintenance-work-orders/' +
        setupMaintenanceEntryForPath.workOrder.id +
        '/assign' &&
    init?.method === 'POST'
  ) {
    requirePortfolioAuth(init);
    const current = setupMaintenanceEntryForPath.workOrder;
    const body = JSON.parse(String(init.body)) as {
      expectedVersion: number;
      assignee:
        | { kind: 'party'; partyId: string }
        | { kind: 'user'; userId: string };
    };
    if (body.expectedVersion !== current.version) {
      return apiError(
        409,
        'MAINTENANCE_WORK_ORDER_VERSION_CONFLICT',
        'Maintenance WorkOrder version conflict.',
      );
    }
    if (
      body.assignee.kind !== 'party' ||
      ![...parties, ...(setupParty ? [setupParty] : [])].some(
        (party) =>
          party.id ===
            (body.assignee.kind === 'party'
              ? body.assignee.partyId
              : '') &&
          party.status === 'active',
      )
    ) {
      return apiError(
        422,
        'MAINTENANCE_ASSIGNEE_INACTIVE',
        'Maintenance assignee must be an active Party.',
      );
    }
    const updated: MaintenanceWorkOrderResponse = {
      ...current,
      assignee: body.assignee,
      status: 'assigned',
      assignedAt: nextSetupMaintenanceAt(),
      version: current.version + 1,
    };
    replaceSetupWorkOrder(updated);
    return maybeHoldMaintenanceMutation(json(updated));
  }

  if (
    setupMaintenanceEntryForPath &&
    path ===
      '/maintenance-work-orders/' +
        setupMaintenanceEntryForPath.workOrder.id +
        '/status' &&
    init?.method === 'POST'
  ) {
    requirePortfolioAuth(init);
    const current = setupMaintenanceEntryForPath.workOrder;
    const body = JSON.parse(String(init.body)) as {
      expectedVersion: number;
      action: 'start' | 'complete' | 'cancel';
    };
    if (body.expectedVersion !== current.version) {
      return apiError(
        409,
        'MAINTENANCE_WORK_ORDER_VERSION_CONFLICT',
        'Maintenance WorkOrder version conflict.',
      );
    }
    const now = nextSetupMaintenanceAt();
    let updated: MaintenanceWorkOrderResponse;
    if (body.action === 'start') {
      if (current.status !== 'assigned') {
        return apiError(
          422,
          'MAINTENANCE_WORK_ORDER_INVALID_TRANSITION',
          'Only assigned WorkOrder can start.',
        );
      }
      updated = {
        ...current,
        status: 'in_progress',
        startedAt: now,
        version: current.version + 1,
      };
    } else if (body.action === 'complete') {
      if (current.status !== 'in_progress') {
        return apiError(
          422,
          'MAINTENANCE_WORK_ORDER_INVALID_TRANSITION',
          'Only in-progress WorkOrder can complete.',
        );
      }
      const linkedEvents = setupMaintenanceEntryForPath.serviceEventIds
        .map((id) => setupServiceEvents.find((event) => event.id === id))
        .filter((event): event is ServiceEventResponse => event !== undefined);
      if (
        linkedEvents.some(
          (event) => Date.parse(event.performedAt) > Date.parse(now),
        )
      ) {
        return apiError(
          422,
          'MAINTENANCE_WORK_ORDER_COMPLETION_BEFORE_SERVICE',
          'Completion predates linked service work.',
        );
      }
      updated = {
        ...current,
        status: 'completed',
        completedAt: now,
        version: current.version + 1,
      };
    } else {
      if (setupMaintenanceEntryForPath.serviceEventIds.length > 0) {
        return apiError(
          422,
          'MAINTENANCE_WORK_ORDER_HAS_SERVICE_EVENTS',
          'Linked ServiceEvents prevent cancellation.',
        );
      }
      updated = {
        ...current,
        status: 'cancelled',
        cancelledAt: now,
        version: current.version + 1,
      };
    }
    replaceSetupWorkOrder(updated);
    return json(updated);
  }

  if (
    setupMaintenanceEntryForPath &&
    path ===
      '/maintenance-work-orders/' +
        setupMaintenanceEntryForPath.workOrder.id +
        '/service-events' &&
    init?.method === 'POST'
  ) {
    requirePortfolioAuth(init);
    const body = JSON.parse(String(init.body)) as {
      serviceEventId: string;
    };
    const event = setupServiceEvents.find(
      (candidate) => candidate.id === body.serviceEventId,
    );
    if (!event) {
      return apiError(
        404,
        'SERVICE_EVENT_NOT_FOUND',
        'ServiceEvent not found.',
      );
    }
    const issue = setupMaintenanceIssues.find(
      (candidate) =>
        candidate.id === setupMaintenanceEntryForPath.workOrder.issueId,
    );
    if (!issue || issue.assetId !== event.assetId) {
      return apiError(
        422,
        'MAINTENANCE_SERVICE_EVENT_ASSET_MISMATCH',
        'ServiceEvent Asset mismatch.',
      );
    }
    if (
      setupMaintenanceWorkOrders.some((entry) =>
        entry.serviceEventIds.includes(event.id),
      )
    ) {
      return apiError(
        409,
        'MAINTENANCE_SERVICE_EVENT_ALREADY_LINKED',
        'ServiceEvent already linked.',
      );
    }
    const linkedAt = nextSetupMaintenanceAt();
    setupMaintenanceWorkOrders = setupMaintenanceWorkOrders.map((entry) =>
      entry.workOrder.id === setupMaintenanceEntryForPath.workOrder.id
        ? {
            ...entry,
            serviceEventIds: [...entry.serviceEventIds, event.id],
          }
        : entry,
    );
    const response = {
      workOrderId: setupMaintenanceEntryForPath.workOrder.id,
      serviceEventId: event.id,
      linkedAt,
      linkedByUserId: inspectionUserId,
    };
    if (browserHarnessWindow.__portfolioFailNextServiceEventLink) {
      browserHarnessWindow.__portfolioFailNextServiceEventLink = false;
      return apiError(
        503,
        'MAINTENANCE_SERVICE_LINK_TEST_ACK_LOST',
        'Intentional Maintenance link acknowledgement loss.',
      );
    }
    return json(response, 201);
  }

  if (
    setupMaintenanceEntryForPath &&
    path ===
      '/maintenance-work-orders/' +
        setupMaintenanceEntryForPath.workOrder.id
  ) {
    return json(setupMaintenanceEntryForPath);
  }

  if (
    setupAsset &&
    path === '/assets/' + setupAsset.id + '/service-events'
  ) {
    if (init?.method === 'POST') {
      requirePortfolioAuth(init);
      const body = JSON.parse(String(init.body)) as {
        eventType: ServiceEventResponse['eventType'];
        performedAt: string;
        providerPartyId?: string | null;
        description: string;
        reference?: string | null;
      };
      const created: ServiceEventResponse = {
        id: setupServiceEventId,
        assetId: setupAsset.id,
        servicePlanId: null,
        warrantyClaimId: null,
        eventType: body.eventType,
        performedAt: body.performedAt,
        providerPartyId: body.providerPartyId ?? null,
        description: body.description,
        reference: body.reference ?? null,
        parts: [],
        recordedAt: nextSetupMaintenanceAt(),
        recordedByUserId: inspectionUserId,
      };
      setupServiceEvents.push(created);
      if (
        browserHarnessWindow.__portfolioFailNextServiceEventCreateAfterCommit
      ) {
        browserHarnessWindow.__portfolioFailNextServiceEventCreateAfterCommit =
          false;
        return apiError(
          503,
          'SERVICE_EVENT_CREATE_TEST_ACK_LOST',
          'Intentional ServiceEvent create acknowledgement loss.',
        );
      }
      return json(created, 201);
    }
    return json({
      items: setupServiceEvents.filter(
        (event) => event.assetId === setupAsset.id,
      ),
    });
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
    return json({
      items: setupDocumentReferences('lease_agreement', setupAgreement.id),
    });
  }

  if (
    setupAmendment &&
    path === '/amendments/' + setupAmendment.id + '/documents'
  ) {
    return json({
      items: setupDocumentReferences('lease_amendment', setupAmendment.id),
    });
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

  if (path === '/parties' && (!init?.method || init.method === 'GET')) {
    return json({
      items: [...parties, ...(setupParty ? [setupParty] : [])],
    });
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

  if (path === '/inspection-schemas') {
    return json({ items: [inspectionSchema] });
  }

  if (path === '/inspection-staff') {
    return json({
      items: [
        {
          userId: inspectionUserId,
          displayName: 'Browser Inspector',
          email: 'inspector@portfolio.test',
          role: 'inspector',
        },
        {
          userId: setupOrchestrationOtherStaffId,
          displayName: 'Browser Manager',
          email: 'manager@portfolio.test',
          role: 'manager',
        },
      ],
    });
  }

  if (path === '/inspections/assigned-to-me') {
    return json({
      items: [
        {
          inspection: inspectionRecord(),
          propertyId,
          unitCode: unit.code,
          unitNumber: unit.unitNumber,
        },
        ...(setupOrchestrationInspection?.assignedToUserId ===
        inspectionUserId
          ? [
              {
                inspection: setupOrchestrationInspection,
                propertyId: orchestrationPropertyId,
                unitCode: orchestrationUnit.code,
                unitNumber: orchestrationUnit.unitNumber,
              },
            ]
          : []),
      ],
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

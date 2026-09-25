import type {
  InspectionAnswerValue,
  InspectionFinalSnapshot,
} from '@portfolio/domain';

export interface InspectionReportItemView {
  readonly label: string;
  readonly answer: string;
  readonly comment: string | null;
}

export interface InspectionReportSectionView {
  readonly title: string;
  readonly description: string | null;
  readonly items: readonly InspectionReportItemView[];
}

export interface InspectionReportFindingView {
  readonly severity: string;
  readonly title: string;
  readonly description: string | null;
  readonly sectionTitle: string;
  readonly itemLabel: string | null;
}

export interface InspectionReportEvidenceView {
  readonly kind: string;
  readonly fileName: string;
  readonly caption: string | null;
  readonly sectionTitle: string | null;
  readonly itemLabel: string | null;
}

export interface InspectionReportSignatureView {
  readonly role: string;
  readonly signerName: string;
  readonly signedAt: string;
  readonly documentFileName: string;
}

export interface InspectionReportViewModel {
  readonly title: string;
  readonly propertyName: string;
  readonly propertyCode: string | null;
  readonly propertyAddress: string | null;
  readonly unitTitle: string;
  readonly unitCode: string | null;
  readonly unitDetails: string;
  readonly inspectionCode: string;
  readonly inspectionType: string;
  readonly schemaTitle: string;
  readonly status: 'FINAL';
  readonly finalizedAt: string;
  readonly scheduledFor: string | null;
  readonly findingsCount: number;
  readonly evidenceCount: number;
  readonly signaturesCount: number;
  readonly invalidatedSignaturesCount: number;
  readonly sections: readonly InspectionReportSectionView[];
  readonly findings: readonly InspectionReportFindingView[];
  readonly evidence: readonly InspectionReportEvidenceView[];
  readonly signatures: readonly InspectionReportSignatureView[];
  readonly unlockCount: number;
  readonly inspectionId: string;
  readonly snapshotId: string;
  readonly snapshotVersion: number;
  readonly inspectionVersion: number;
  readonly contentRevision: number;
  readonly createdAt: string;
}

function displayEnum(value: string): string {
  return value
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function displayAnswer(value: InspectionAnswerValue): string {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.join(', ');
  return value;
}

function propertyAddress(
  context: InspectionFinalSnapshot['payload']['reportContext'],
): string | null {
  if (!context) return null;
  const property = context.property;
  return `${property.street} ${property.houseNumber}, ${property.postalCode} ${property.city}, ${property.countryCode}`;
}

export function buildInspectionReportViewModel(
  snapshot: InspectionFinalSnapshot,
): InspectionReportViewModel {
  const { inspection, schema } = snapshot.payload;
  const context = snapshot.payload.reportContext ?? null;

  const responsesByItem = new Map(
    snapshot.payload.responses.map((response) => [response.itemId, response] as const),
  );
  const sectionById = new Map(
    schema.sections.map((section) => [section.id, section] as const),
  );
  const itemById = new Map(
    schema.sections.flatMap((section) =>
      section.items.map((item) => [item.id, item] as const),
    ),
  );

  const sections = [...schema.sections]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((section) => ({
      title: section.title,
      description: section.description,
      items: [...section.items]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .flatMap((item) => {
          const response = responsesByItem.get(item.id);
          if (!response) return [];
          return [{
            label: item.label,
            answer: displayAnswer(response.value),
            comment: response.comment,
          }];
        }),
    }))
    .filter((section) => section.items.length > 0);

  const findings = snapshot.payload.findings.map((finding) => {
    const section = sectionById.get(finding.sectionId);
    const item = finding.itemId === null ? null : itemById.get(finding.itemId);
    return {
      severity: displayEnum(finding.severity),
      title: finding.title,
      description: finding.description,
      sectionTitle: section?.title ?? 'Inspection',
      itemLabel: item?.label ?? null,
    };
  });

  const evidence = snapshot.payload.evidence.map(({ evidence: item, documentVersion }) => {
    const section = item.sectionId === null ? null : sectionById.get(item.sectionId);
    const schemaItem = item.itemId === null ? null : itemById.get(item.itemId);
    return {
      kind: displayEnum(item.kind),
      fileName: documentVersion.fileName,
      caption: item.caption,
      sectionTitle: section?.title ?? null,
      itemLabel: schemaItem?.label ?? null,
    };
  });

  const activeSignatures = snapshot.payload.signatures.filter(
    ({ signature }) => signature.invalidatedAt === null,
  );
  const invalidatedSignaturesCount =
    snapshot.payload.signatures.length - activeSignatures.length;

  const signatures = activeSignatures.map(({ signature, documentVersion }) => ({
    role: displayEnum(signature.signerRole),
    signerName: signature.signerName,
    signedAt: signature.signedAt,
    documentFileName: documentVersion.fileName,
  }));

  const unitTitle = context
    ? `Unit ${context.unit.unitNumber}`
    : `Unit ${inspection.unitId}`;
  const unitDetails = context
    ? [
        displayEnum(context.unit.unitType),
        context.unit.floor ? `floor ${context.unit.floor}` : null,
        context.unit.areaM2 === null ? null : `${context.unit.areaM2} m2`,
        context.unit.rooms === null ? null : `${context.unit.rooms} rooms`,
      ].filter((value): value is string => value !== null).join(' - ')
    : `Unit ID ${inspection.unitId}`;

  return {
    title: 'Inspection Report',
    propertyName: context?.property.name ?? 'Property context unavailable',
    propertyCode: context?.property.code ?? null,
    propertyAddress: propertyAddress(context),
    unitTitle,
    unitCode: context?.unit.code ?? null,
    unitDetails,
    inspectionCode: inspection.code,
    inspectionType: displayEnum(inspection.inspectionType),
    schemaTitle: schema.title,
    status: 'FINAL',
    finalizedAt: inspection.finalizedAt ?? snapshot.createdAt,
    scheduledFor: inspection.scheduledFor,
    findingsCount: findings.length,
    evidenceCount: evidence.length,
    signaturesCount: signatures.length,
    invalidatedSignaturesCount,
    sections,
    findings,
    evidence,
    signatures,
    unlockCount: snapshot.payload.unlockHistory.length,
    inspectionId: snapshot.inspectionId,
    snapshotId: snapshot.id,
    snapshotVersion: snapshot.snapshotVersion,
    inspectionVersion: snapshot.inspectionVersion,
    contentRevision: snapshot.contentRevision,
    createdAt: snapshot.createdAt,
  };
}

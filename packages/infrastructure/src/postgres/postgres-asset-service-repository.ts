import type postgres from 'postgres';
import type { AssetServiceRepository } from '@portfolio/application';
import {
  DomainError,
  asAssetId,
  asDateOnly,
  asPartyId,
  asServiceEventId,
  asServicePartId,
  asServicePlanId,
  asUserId,
  asWarrantyClaimId,
  asWarrantyId,
  type AssetId,
  type DateOnly,
  type ServiceEvent,
  type ServiceEventType,
  type ServicePart,
  type ServicePlan,
  type ServicePlanId,
  type ServicePlanKind,
  type ServicePlanStatus,
  type Warranty,
  type WarrantyClaim,
  type WarrantyClaimId,
  type WarrantyClaimStatus,
  type WarrantyId,
  type WarrantyType,
} from '@portfolio/domain';

type Sql = ReturnType<typeof postgres>;

interface PgErrorLike {
  code?: string;
  constraint_name?: string;
}

interface WarrantyRow {
  id: string;
  asset_id: string;
  warranty_type: WarrantyType;
  provider_party_id: string | null;
  reference: string | null;
  valid_from: string | Date;
  valid_to: string | Date | null;
  terms: string | null;
  recorded_at: string | Date;
  recorded_by_user_id: string;
}

interface ClaimRow {
  id: string;
  warranty_id: string;
  incident_on: string | Date;
  description: string;
  status: WarrantyClaimStatus;
  provider_reference: string | null;
  submitted_at: string | Date | null;
  resolved_at: string | Date | null;
  closed_at: string | Date | null;
  cancelled_at: string | Date | null;
  recorded_at: string | Date;
  recorded_by_user_id: string;
  version: number;
}

interface ServicePlanRow {
  id: string;
  asset_id: string;
  name: string;
  schedule_kind: ServicePlanKind;
  first_due_on: string | Date;
  interval_months: number | null;
  provider_party_id: string | null;
  notes: string | null;
  status: ServicePlanStatus;
  version: number;
  created_at: string | Date;
  created_by_user_id: string;
}

interface ServiceEventRow {
  id: string;
  asset_id: string;
  service_plan_id: string | null;
  warranty_claim_id: string | null;
  event_type: ServiceEventType;
  performed_at: string | Date;
  provider_party_id: string | null;
  description: string;
  reference: string | null;
  recorded_at: string | Date;
  recorded_by_user_id: string;
}

interface ServicePartRow {
  id: string;
  service_event_id: string;
  name: string;
  part_number: string | null;
  serial_number: string | null;
  quantity: number;
  notes: string | null;
}

function instant(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function nullableInstant(value: string | Date | null): string | null {
  return value === null ? null : instant(value);
}

function dateOnly(value: string | Date): DateOnly {
  return asDateOnly(
    value instanceof Date ? value.toISOString().slice(0, 10) : value,
  );
}

function nullableDateOnly(value: string | Date | null): DateOnly | null {
  return value === null ? null : dateOnly(value);
}

function mapWarranty(row: WarrantyRow): Warranty {
  return {
    id: asWarrantyId(row.id),
    assetId: asAssetId(row.asset_id),
    warrantyType: row.warranty_type,
    providerPartyId:
      row.provider_party_id === null ? null : asPartyId(row.provider_party_id),
    reference: row.reference,
    validFrom: dateOnly(row.valid_from),
    validTo: nullableDateOnly(row.valid_to),
    terms: row.terms,
    recordedAt: instant(row.recorded_at),
    recordedByUserId: asUserId(row.recorded_by_user_id),
  };
}

function mapClaim(row: ClaimRow): WarrantyClaim {
  return {
    id: asWarrantyClaimId(row.id),
    warrantyId: asWarrantyId(row.warranty_id),
    incidentOn: dateOnly(row.incident_on),
    description: row.description,
    status: row.status,
    providerReference: row.provider_reference,
    submittedAt: nullableInstant(row.submitted_at),
    resolvedAt: nullableInstant(row.resolved_at),
    closedAt: nullableInstant(row.closed_at),
    cancelledAt: nullableInstant(row.cancelled_at),
    recordedAt: instant(row.recorded_at),
    recordedByUserId: asUserId(row.recorded_by_user_id),
    version: row.version,
  };
}

function mapServicePlan(row: ServicePlanRow): ServicePlan {
  return {
    id: asServicePlanId(row.id),
    assetId: asAssetId(row.asset_id),
    name: row.name,
    scheduleKind: row.schedule_kind,
    firstDueOn: dateOnly(row.first_due_on),
    intervalMonths: row.interval_months,
    providerPartyId:
      row.provider_party_id === null ? null : asPartyId(row.provider_party_id),
    notes: row.notes,
    status: row.status,
    version: row.version,
    createdAt: instant(row.created_at),
    createdByUserId: asUserId(row.created_by_user_id),
  };
}

function mapServicePart(row: ServicePartRow): ServicePart {
  return {
    id: asServicePartId(row.id),
    serviceEventId: asServiceEventId(row.service_event_id),
    name: row.name,
    partNumber: row.part_number,
    serialNumber: row.serial_number,
    quantity: row.quantity,
    notes: row.notes,
  };
}

function translate(error: unknown): DomainError | null {
  const pg = error as PgErrorLike;
  if (pg.code !== '23514') return null;

  switch (pg.constraint_name) {
    case 'asset_warranty_immutable':
      return new DomainError(
        'WARRANTY_IMMUTABLE',
        'Warranty coverage history is append-only.',
      );
    case 'asset_warranty_claim_outside_coverage':
      return new DomainError(
        'WARRANTY_CLAIM_OUTSIDE_COVERAGE',
        'WarrantyClaim incident is outside Warranty coverage.',
      );
    case 'asset_warranty_claim_incident_not_future':
      return new DomainError(
        'WARRANTY_CLAIM_INCIDENT_IN_FUTURE',
        'WarrantyClaim incident cannot be after its recording date.',
      );
    case 'asset_warranty_claim_version_step':
      return new DomainError(
        'WARRANTY_CLAIM_VERSION_CONFLICT',
        'WarrantyClaim mutation version is invalid.',
      );
    case 'asset_warranty_claim_initial_state':
    case 'asset_warranty_claim_identity_immutable':
    case 'asset_warranty_claim_timestamp_immutable':
    case 'asset_warranty_claim_provider_reference_immutable':
    case 'asset_warranty_claim_transition_invalid':
      return new DomainError(
        'WARRANTY_CLAIM_INVALID_TRANSITION',
        'Invalid WarrantyClaim lifecycle mutation.',
      );
    case 'asset_warranty_claim_delete_forbidden':
      return new DomainError(
        'WARRANTY_CLAIM_DELETE_FORBIDDEN',
        'WarrantyClaim history cannot be deleted.',
      );
    case 'asset_service_plan_asset_status_invalid':
      return new DomainError(
        'SERVICE_PLAN_ASSET_STATUS_INVALID',
        'A retired or replaced Asset cannot start or resume an active ServicePlan.',
      );
    case 'asset_service_plan_provider_status_invalid':
      return new DomainError(
        'SERVICE_PLAN_PROVIDER_STATUS_INVALID',
        'A ServicePlan provider must be an active Party.',
      );
    case 'asset_service_plan_version_step':
      return new DomainError(
        'SERVICE_PLAN_VERSION_CONFLICT',
        'ServicePlan mutation version is invalid.',
      );
    case 'asset_service_plan_transition_invalid':
    case 'asset_service_plan_initial_state':
      return new DomainError(
        'SERVICE_PLAN_INVALID_TRANSITION',
        'Invalid ServicePlan lifecycle mutation.',
      );
    case 'asset_service_plan_definition_immutable':
    case 'asset_service_plan_delete_forbidden':
      return new DomainError(
        'SERVICE_PLAN_IMMUTABLE',
        'ServicePlan definition/history cannot be rewritten.',
      );
    case 'asset_service_event_plan_asset_mismatch':
      return new DomainError(
        'SERVICE_EVENT_PLAN_ASSET_MISMATCH',
        'ServicePlan must belong to the serviced Asset.',
      );
    case 'asset_service_event_claim_asset_mismatch':
      return new DomainError(
        'SERVICE_EVENT_CLAIM_ASSET_MISMATCH',
        'WarrantyClaim must resolve to the serviced Asset.',
      );
    case 'asset_service_event_immutable':
      return new DomainError(
        'SERVICE_EVENT_IMMUTABLE',
        'ServiceEvent history is append-only.',
      );
    case 'asset_service_part_immutable':
      return new DomainError(
        'SERVICE_PART_IMMUTABLE',
        'ServicePart history is append-only.',
      );
    default:
      return null;
  }
}

async function translated<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const mapped = translate(error);
    if (mapped) throw mapped;
    throw error;
  }
}

const warrantySelect = `
  select
    id, asset_id, warranty_type, provider_party_id, reference,
    valid_from, valid_to, terms, recorded_at, recorded_by_user_id
  from public.asset_warranties
`;

const claimSelect = `
  select
    id, warranty_id, incident_on, description, status,
    provider_reference, submitted_at, resolved_at, closed_at,
    cancelled_at, recorded_at, recorded_by_user_id, version
  from public.asset_warranty_claims
`;

const planSelect = `
  select
    id, asset_id, name, schedule_kind, first_due_on, interval_months,
    provider_party_id, notes, status, version, created_at, created_by_user_id
  from public.asset_service_plans
`;

const eventSelect = `
  select
    id, asset_id, service_plan_id, warranty_claim_id, event_type,
    performed_at, provider_party_id, description, reference,
    recorded_at, recorded_by_user_id
  from public.asset_service_events
`;

export class PostgresAssetServiceRepository implements AssetServiceRepository {
  constructor(private readonly sql: Sql) {}

  async getWarrantyById(id: WarrantyId): Promise<Warranty | null> {
    const rows = await this.sql<WarrantyRow[]>`
      ${this.sql.unsafe(warrantySelect)}
      where id = ${id}
      limit 1
    `;
    return rows.length === 0 ? null : mapWarranty(rows[0]!);
  }

  async listWarrantiesByAsset(assetId: AssetId): Promise<readonly Warranty[]> {
    const rows = await this.sql<WarrantyRow[]>`
      ${this.sql.unsafe(warrantySelect)}
      where asset_id = ${assetId}
      order by valid_from, id
    `;
    return rows.map(mapWarranty);
  }

  async insertWarranty(warranty: Warranty): Promise<void> {
    await translated(() => this.sql`
      insert into public.asset_warranties (
        id, asset_id, warranty_type, provider_party_id, reference,
        valid_from, valid_to, terms, recorded_at, recorded_by_user_id
      ) values (
        ${warranty.id}, ${warranty.assetId}, ${warranty.warrantyType},
        ${warranty.providerPartyId}, ${warranty.reference},
        ${warranty.validFrom}, ${warranty.validTo}, ${warranty.terms},
        ${warranty.recordedAt}, ${warranty.recordedByUserId}
      )
    `);
  }

  async getWarrantyClaimById(
    id: WarrantyClaimId,
  ): Promise<WarrantyClaim | null> {
    const rows = await this.sql<ClaimRow[]>`
      ${this.sql.unsafe(claimSelect)}
      where id = ${id}
      limit 1
    `;
    return rows.length === 0 ? null : mapClaim(rows[0]!);
  }

  async listWarrantyClaimsByWarranty(
    warrantyId: WarrantyId,
  ): Promise<readonly WarrantyClaim[]> {
    const rows = await this.sql<ClaimRow[]>`
      ${this.sql.unsafe(claimSelect)}
      where warranty_id = ${warrantyId}
      order by incident_on, id
    `;
    return rows.map(mapClaim);
  }

  async insertWarrantyClaim(claim: WarrantyClaim): Promise<void> {
    await translated(() => this.sql`
      insert into public.asset_warranty_claims (
        id, warranty_id, incident_on, description, status,
        provider_reference, submitted_at, resolved_at, closed_at,
        cancelled_at, recorded_at, recorded_by_user_id, version
      ) values (
        ${claim.id}, ${claim.warrantyId}, ${claim.incidentOn},
        ${claim.description}, ${claim.status}, ${claim.providerReference},
        ${claim.submittedAt}, ${claim.resolvedAt}, ${claim.closedAt},
        ${claim.cancelledAt}, ${claim.recordedAt},
        ${claim.recordedByUserId}, ${claim.version}
      )
    `);
  }

  async updateWarrantyClaim(
    claim: WarrantyClaim,
    expectedVersion: number,
  ): Promise<void> {
    const rows = await translated(() => this.sql<{ id: string }[]>`
      update public.asset_warranty_claims
      set
        status = ${claim.status},
        provider_reference = ${claim.providerReference},
        submitted_at = ${claim.submittedAt},
        resolved_at = ${claim.resolvedAt},
        closed_at = ${claim.closedAt},
        cancelled_at = ${claim.cancelledAt},
        version = ${claim.version}
      where id = ${claim.id}
        and version = ${expectedVersion}
      returning id
    `);

    if (rows.length === 0) {
      throw new DomainError(
        'WARRANTY_CLAIM_VERSION_CONFLICT',
        'WarrantyClaim changed before the transition completed.',
      );
    }
  }

  async getServicePlanById(id: ServicePlanId): Promise<ServicePlan | null> {
    const rows = await this.sql<ServicePlanRow[]>`
      ${this.sql.unsafe(planSelect)}
      where id = ${id}
      limit 1
    `;
    return rows.length === 0 ? null : mapServicePlan(rows[0]!);
  }

  async listServicePlansByAsset(
    assetId: AssetId,
  ): Promise<readonly ServicePlan[]> {
    const rows = await this.sql<ServicePlanRow[]>`
      ${this.sql.unsafe(planSelect)}
      where asset_id = ${assetId}
      order by first_due_on, id
    `;
    return rows.map(mapServicePlan);
  }

  async insertServicePlan(plan: ServicePlan): Promise<void> {
    await translated(() => this.sql`
      insert into public.asset_service_plans (
        id, asset_id, name, schedule_kind, first_due_on, interval_months,
        provider_party_id, notes, status, version, created_at, created_by_user_id
      ) values (
        ${plan.id}, ${plan.assetId}, ${plan.name}, ${plan.scheduleKind},
        ${plan.firstDueOn}, ${plan.intervalMonths}, ${plan.providerPartyId},
        ${plan.notes}, ${plan.status}, ${plan.version}, ${plan.createdAt},
        ${plan.createdByUserId}
      )
    `);
  }

  async updateServicePlan(
    plan: ServicePlan,
    expectedVersion: number,
  ): Promise<void> {
    const rows = await translated(() => this.sql<{ id: string }[]>`
      update public.asset_service_plans
      set status = ${plan.status},
          version = ${plan.version}
      where id = ${plan.id}
        and version = ${expectedVersion}
      returning id
    `);

    if (rows.length === 0) {
      throw new DomainError(
        'SERVICE_PLAN_VERSION_CONFLICT',
        'ServicePlan changed before the transition completed.',
      );
    }
  }

  private async partsFor(
    serviceEventId: ReturnType<typeof asServiceEventId>,
  ): Promise<readonly ServicePart[]> {
    const rows = await this.sql<ServicePartRow[]>`
      select
        id, service_event_id, name, part_number, serial_number,
        quantity, notes
      from public.asset_service_parts
      where service_event_id = ${serviceEventId}
      order by id
    `;
    return rows.map(mapServicePart);
  }

  async listServiceEventsByAsset(
    assetId: AssetId,
  ): Promise<readonly ServiceEvent[]> {
    const rows = await this.sql<ServiceEventRow[]>`
      ${this.sql.unsafe(eventSelect)}
      where asset_id = ${assetId}
      order by performed_at, id
    `;

    return Promise.all(
      rows.map(async (row) => {
        const id = asServiceEventId(row.id);
        return {
          id,
          assetId: asAssetId(row.asset_id),
          servicePlanId:
            row.service_plan_id === null
              ? null
              : asServicePlanId(row.service_plan_id),
          warrantyClaimId:
            row.warranty_claim_id === null
              ? null
              : asWarrantyClaimId(row.warranty_claim_id),
          eventType: row.event_type,
          performedAt: instant(row.performed_at),
          providerPartyId:
            row.provider_party_id === null
              ? null
              : asPartyId(row.provider_party_id),
          description: row.description,
          reference: row.reference,
          parts: await this.partsFor(id),
          recordedAt: instant(row.recorded_at),
          recordedByUserId: asUserId(row.recorded_by_user_id),
        };
      }),
    );
  }

  async insertServiceEvent(event: ServiceEvent): Promise<void> {
    await translated(async () => {
      await this.sql.begin(async (tx) => {
        await tx`
          insert into public.asset_service_events (
            id, asset_id, service_plan_id, warranty_claim_id, event_type,
            performed_at, provider_party_id, description, reference,
            recorded_at, recorded_by_user_id
          ) values (
            ${event.id}, ${event.assetId}, ${event.servicePlanId},
            ${event.warrantyClaimId}, ${event.eventType},
            ${event.performedAt}, ${event.providerPartyId},
            ${event.description}, ${event.reference},
            ${event.recordedAt}, ${event.recordedByUserId}
          )
        `;

        for (const part of event.parts) {
          await tx`
            insert into public.asset_service_parts (
              id, service_event_id, name, part_number, serial_number,
              quantity, notes
            ) values (
              ${part.id}, ${part.serviceEventId}, ${part.name},
              ${part.partNumber}, ${part.serialNumber},
              ${part.quantity}, ${part.notes}
            )
          `;
        }
      });
    });
  }
}

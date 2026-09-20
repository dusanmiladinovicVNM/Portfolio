import {
  DomainError,
  buildMeterConsumptionIntervals,
  type MeterId,
  type TenancyId,
  type UnitId,
} from '@portfolio/domain';
import { requireCapability, type Actor } from '../security/access.js';
import type { MeterRepository } from './meter-repository.js';

export async function getMeterQuery(
  repository: MeterRepository,
  actor: Actor,
  meterId: MeterId,
) {
  requireCapability(actor, 'meters:read');
  const meter = await repository.getMeterById(meterId);
  if (!meter) {
    throw new DomainError('METER_NOT_FOUND', 'Meter not found.');
  }

  const readings = await repository.listReadings(meterId);
  return {
    meter,
    readings,
    consumptionIntervals: buildMeterConsumptionIntervals(readings),
  };
}

export async function listMetersByUnitQuery(
  repository: MeterRepository,
  actor: Actor,
  unitId: UnitId,
) {
  requireCapability(actor, 'meters:read');
  return repository.listMetersByUnit(unitId);
}

export async function listMeterBoundaryReadingsByTenancyQuery(
  repository: MeterRepository,
  actor: Actor,
  tenancyId: TenancyId,
) {
  requireCapability(actor, 'meters:read');
  return repository.listBoundaryReadingsByTenancy(tenancyId);
}

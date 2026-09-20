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

  const [readings, boundaries] = await Promise.all([
    repository.listReadings(meterId),
    repository.listBoundariesByMeter(meterId),
  ]);

  return {
    meter,
    readings,
    boundaries,
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

export async function listMeterReadingBoundariesByTenancyQuery(
  repository: MeterRepository,
  actor: Actor,
  tenancyId: TenancyId,
) {
  requireCapability(actor, 'meters:read');
  const boundaries = await repository.listBoundariesByTenancy(tenancyId);
  return Promise.all(
    boundaries.map(async (boundary) => {
      const reading = await repository.getReadingById(boundary.readingId);
      if (!reading) {
        throw new DomainError(
          'METER_READING_NOT_FOUND',
          'Meter reading boundary references a missing reading.',
        );
      }
      return { boundary, reading };
    }),
  );
}

import {
  DomainError,
  asUnitId,
  createUnit,
  type CreateUnitInput,
  type Unit,
} from '@portfolio/domain';
import type { IdGenerator } from '../shared/id-generator.js';
import { requireCapability, type Actor } from '../security/access.js';
import type { PortfolioRepository } from './portfolio-repository.js';

export type CreateUnitCommandInput = Omit<CreateUnitInput, 'id'>;

export interface CreateUnitDependencies {
  portfolioRepository: PortfolioRepository;
  idGenerator: IdGenerator;
}

export async function createUnitCommand(
  deps: CreateUnitDependencies,
  actor: Actor,
  input: CreateUnitCommandInput,
): Promise<Unit> {
  requireCapability(actor, 'portfolio:write');

  const property = await deps.portfolioRepository.getPropertyById(input.propertyId);
  if (!property) {
    throw new DomainError('PROPERTY_NOT_FOUND', 'Property not found.');
  }

  const unit = createUnit({
    ...input,
    id: asUnitId(deps.idGenerator.next()),
  });

  if (await deps.portfolioRepository.unitCodeExists(unit.code)) {
    throw new DomainError('UNIT_CODE_ALREADY_EXISTS', `Unit code '${unit.code}' already exists.`);
  }

  if (await deps.portfolioRepository.unitNumberExists(unit.propertyId, unit.unitNumber)) {
    throw new DomainError(
      'UNIT_NUMBER_ALREADY_EXISTS',
      `Unit number '${unit.unitNumber}' already exists in this property.`,
    );
  }

  await deps.portfolioRepository.insertUnit(unit);
  return unit;
}

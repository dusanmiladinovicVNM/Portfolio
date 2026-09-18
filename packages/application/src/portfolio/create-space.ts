import {
  DomainError,
  asSpaceId,
  createSpace,
  type CreateSpaceInput,
  type Space,
} from '@portfolio/domain';
import type { IdGenerator } from '../shared/id-generator.js';
import type { PortfolioRepository } from './portfolio-repository.js';

export type CreateSpaceCommandInput = Omit<CreateSpaceInput, 'id'>;

export interface CreateSpaceDependencies {
  portfolioRepository: PortfolioRepository;
  idGenerator: IdGenerator;
}

export async function createSpaceCommand(
  deps: CreateSpaceDependencies,
  input: CreateSpaceCommandInput,
): Promise<Space> {
  const unit = await deps.portfolioRepository.getUnitById(input.unitId);
  if (!unit) {
    throw new DomainError('UNIT_NOT_FOUND', 'Unit not found.');
  }

  const space = createSpace({
    ...input,
    id: asSpaceId(deps.idGenerator.next()),
  });

  if (await deps.portfolioRepository.spaceCodeExists(space.unitId, space.code)) {
    throw new DomainError(
      'SPACE_CODE_ALREADY_EXISTS',
      `Space code '${space.code}' already exists in this unit.`,
    );
  }

  await deps.portfolioRepository.insertSpace(space);
  return space;
}

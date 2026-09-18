import {
  DomainError,
  asPropertyId,
  createProperty,
  type CreatePropertyInput,
  type Property,
} from '@portfolio/domain';
import type { IdGenerator } from '../shared/id-generator.js';
import type { PortfolioRepository } from './portfolio-repository.js';

export type CreatePropertyCommandInput = Omit<CreatePropertyInput, 'id'>;

export interface CreatePropertyDependencies {
  portfolioRepository: PortfolioRepository;
  idGenerator: IdGenerator;
}

export async function createPropertyCommand(
  deps: CreatePropertyDependencies,
  input: CreatePropertyCommandInput,
): Promise<Property> {
  const property = createProperty({
    ...input,
    id: asPropertyId(deps.idGenerator.next()),
  });

  if (await deps.portfolioRepository.propertyCodeExists(property.code)) {
    throw new DomainError(
      'PROPERTY_CODE_ALREADY_EXISTS',
      `Property code '${property.code}' already exists.`,
    );
  }

  await deps.portfolioRepository.insertProperty(property);
  return property;
}

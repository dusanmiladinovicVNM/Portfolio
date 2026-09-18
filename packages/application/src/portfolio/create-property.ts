import {
  DomainError,
  createProperty,
  type CreatePropertyInput,
  type Property,
} from '@portfolio/domain';
import type { PortfolioRepository } from './portfolio-repository.js';

export interface CreatePropertyDependencies {
  portfolioRepository: PortfolioRepository;
}

export async function createPropertyCommand(
  deps: CreatePropertyDependencies,
  input: CreatePropertyInput,
): Promise<Property> {
  const property = createProperty(input);

  if (await deps.portfolioRepository.propertyCodeExists(property.code)) {
    throw new DomainError(
      'PROPERTY_CODE_ALREADY_EXISTS',
      `Property code '${property.code}' already exists.`,
    );
  }

  await deps.portfolioRepository.insertProperty(property);
  return property;
}

import type {
  OperationalWorkProjection,
  WorkRepository,
} from '@portfolio/application';
import type { DateOnly } from '@portfolio/domain';

export class InMemoryWorkRepository implements WorkRepository {
  projection: OperationalWorkProjection = {
    inspections: [],
    maintenance: [],
    occupancy: [],
  };

  lastReferenceDate: DateOnly | null = null;

  async getOperationalWork(
    referenceDate: DateOnly,
  ): Promise<OperationalWorkProjection> {
    this.lastReferenceDate = referenceDate;
    return this.projection;
  }
}

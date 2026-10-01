import type {
  OperationalWorkProjection,
  WorkRepository,
} from '@portfolio/application';
import type { DateOnly } from '@portfolio/domain';

export class InMemoryWorkRepository implements WorkRepository {
  projection: OperationalWorkProjection = {
    inspections: [],
    maintenance: [],
    service: [],
    occupancy: [],
  };

  readCount = 0;
  lastOperationalDate: DateOnly | null = null;

  async getOperationalWork(
    operationalDate: DateOnly,
  ): Promise<OperationalWorkProjection> {
    this.readCount += 1;
    this.lastOperationalDate = operationalDate;
    return this.projection;
  }
}

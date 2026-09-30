import type {
  OperationalWorkProjection,
  WorkRepository,
} from '@portfolio/application';

export class InMemoryWorkRepository implements WorkRepository {
  projection: OperationalWorkProjection = {
    inspections: [],
    maintenance: [],
    occupancy: [],
  };

  readCount = 0;

  async getOperationalWork(): Promise<OperationalWorkProjection> {
    this.readCount += 1;
    return this.projection;
  }
}

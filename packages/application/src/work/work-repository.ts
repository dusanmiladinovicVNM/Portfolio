import type {
  DateOnly,
  InspectionId,
  InspectionStatus,
  InspectionType,
  LeaseAgreementId,
  MaintenanceIssueId,
  MaintenanceIssuePriority,
  PropertyId,
  TenancyId,
  TenancyStatus,
  UnitId,
  UserId,
} from '@portfolio/domain';
import type { StaffRole } from '../security/access.js';

export interface WorkInspectionProjection {
  readonly kind: 'inspection';
  readonly inspectionId: InspectionId;
  readonly inspectionCode: string;
  readonly inspectionType: InspectionType;
  readonly inspectionStatus: InspectionStatus;
  readonly scheduledFor: DateOnly | null;
  readonly assignedToUserId: UserId;
  readonly assignedToDisplayName: string | null;
  readonly assignedToRole: StaffRole | null;
  readonly propertyId: PropertyId;
  readonly propertyCode: string;
  readonly propertyName: string;
  readonly unitId: UnitId;
  readonly unitCode: string;
  readonly unitNumber: string;
}

export interface WorkMaintenanceProjection {
  readonly kind: 'maintenance';
  readonly issueId: MaintenanceIssueId;
  readonly issueCode: string;
  readonly title: string;
  readonly priority: MaintenanceIssuePriority;
  readonly reportedAt: string;
  readonly propertyId: PropertyId;
  readonly propertyCode: string;
  readonly propertyName: string;
  readonly unitId: UnitId | null;
  readonly unitCode: string | null;
  readonly unitNumber: string | null;
  readonly activeWorkOrderCount: number;
  readonly assignedUserIds: readonly UserId[];
}

export type WorkOccupancyReason =
  | 'contract_missing'
  | 'contract_draft'
  | 'move_out';

export interface WorkOccupancyProjection {
  readonly kind: 'occupancy';
  readonly reason: WorkOccupancyReason;
  readonly tenancyId: TenancyId;
  readonly tenancyCode: string;
  readonly tenancyStatus: TenancyStatus;
  readonly agreementId: LeaseAgreementId | null;
  readonly agreementCode: string | null;
  readonly dueDate: DateOnly | null;
  readonly propertyId: PropertyId;
  readonly propertyCode: string;
  readonly propertyName: string;
  readonly unitId: UnitId;
  readonly unitCode: string;
  readonly unitNumber: string;
}

export interface OperationalWorkProjection {
  readonly inspections: readonly WorkInspectionProjection[];
  readonly maintenance: readonly WorkMaintenanceProjection[];
  readonly occupancy: readonly WorkOccupancyProjection[];
}

export interface WorkRepository {
  getOperationalWork(
    operationalDate: DateOnly,
  ): Promise<OperationalWorkProjection>;
}

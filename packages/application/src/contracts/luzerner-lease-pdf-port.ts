import type { LuzernerLeaseFormContent } from '@portfolio/domain';
import type { PdfRenderResult } from '../documents/pdf-port.js';

export interface LuzernerLeasePdfParty {
  readonly displayName: string;
  readonly addressLine: string | null;
  readonly postalCode: string | null;
  readonly city: string | null;
}

export interface LuzernerLeasePdfRenderInput {
  readonly agreementCode: string;
  readonly agreementEffectiveFrom: string;
  readonly form: LuzernerLeaseFormContent;
  readonly property: {
    readonly street: string;
    readonly houseNumber: string;
    readonly postalCode: string;
    readonly city: string;
  };
  readonly unit: {
    readonly unitNumber: string;
    readonly unitType: 'apartment' | 'house' | 'studio' | 'office' | 'commercial' | 'other';
    readonly rooms: number | null;
  };
  readonly landlords: readonly LuzernerLeasePdfParty[];
  readonly landlordRepresentatives: readonly LuzernerLeasePdfParty[];
  readonly tenants: readonly LuzernerLeasePdfParty[];
}

export type LuzernerLeasePdfSnapshot = Omit<
  LuzernerLeasePdfRenderInput,
  'form'
> & {
  readonly formRevision: number;
};

export interface LuzernerLeasePdfPort {
  renderLuzernerLeaseAgreement(
    input: LuzernerLeasePdfRenderInput,
  ): Promise<PdfRenderResult>;
}

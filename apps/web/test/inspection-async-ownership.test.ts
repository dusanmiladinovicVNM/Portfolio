import { describe, expect, it } from 'vitest';
import type {
  InspectionBundleResponse,
  InspectionResponseDto,
  SaveInspectionSectionResponse,
} from '@portfolio/contracts';
import { inspectionSectionInstancePath } from '../src/api/paths.js';
import {
  canEditInspectionSection,
  inspectionDraftResetKey,
  inspectionSectionOperationKey,
  mergeInspectionSectionSave,
  mergeInspectionStart,
  withInspectionOperationFinished,
  withInspectionOperationStarted,
} from '../src/dossier/UnitInspections.js';

const inspectionA = 'b1000000-0000-4000-8000-000000000001';
const inspectionB = 'b1000000-0000-4000-8000-000000000002';
const schemaId = 'b1000000-0000-4000-8000-000000000003';
const section1 = 'b1000000-0000-4000-8000-000000000004';
const section2 = 'b1000000-0000-4000-8000-000000000005';
const instance1 = 'b1000000-0000-4000-8000-000000000008';
const instance2 = 'b1000000-0000-4000-8000-000000000009';
const unitId = 'b1000000-0000-4000-8000-000000000006';
const userId = 'b1000000-0000-4000-8000-000000000007';

function inspection(id: string, status: 'draft' | 'in_progress'): InspectionResponseDto {
  return {
    id,
    code: id === inspectionA ? 'INS-A' : 'INS-B',
    inspectionType: 'move_in',
    unitId,
    tenancyId: null,
    schemaVersionId: schemaId,
    assignedToUserId: userId,
    createdByUserId: userId,
    scheduledFor: '2026-09-21',
    status,
    startedAt:
      status === 'in_progress' ? '2026-09-21T08:00:00.000Z' : null,
    lockedAt: null,
    finalizedAt: null,
    cancelledAt: null,
    version: status === 'in_progress' ? 2 : 1,
    contentRevision: 0,
  };
}

function bundle(
  id: string,
  revisions: readonly [number, number] = [0, 0],
): InspectionBundleResponse {
  return {
    inspection: inspection(id, id === inspectionB ? 'in_progress' : 'draft'),
    schema: {
      id: schemaId,
      schemaCode: 'MOVE-IN',
      versionNumber: 1,
      inspectionType: 'move_in',
      title: 'Move-in',
      status: 'published',
      requiredSignatureRoles: [],
      sections: [
        {
          id: section1,
          key: 'one',
          title: 'One',
          description: null,
          sortOrder: 0,
          scope: 'unit',
          spaceTypes: [],
          items: [],
        },
        {
          id: section2,
          key: 'two',
          title: 'Two',
          description: null,
          sortOrder: 1,
          scope: 'unit',
          spaceTypes: [],
          items: [],
        },
      ],
    },
    sectionInstances: [
      {
        id: instance1,
        inspectionId: id,
        sectionId: section1,
        scope: 'unit',
        spaceId: null,
        spaceCode: null,
        spaceName: null,
        spaceType: null,
        spaceSortOrder: null,
      },
      {
        id: instance2,
        inspectionId: id,
        sectionId: section2,
        scope: 'unit',
        spaceId: null,
        spaceCode: null,
        spaceName: null,
        spaceType: null,
        spaceSortOrder: null,
      },
    ],
    sectionStates: [
      { sectionInstanceId: instance1, sectionId: section1, revision: revisions[0] },
      { sectionInstanceId: instance2, sectionId: section2, revision: revisions[1] },
    ],
    responses: [],
    findings: [],
    evidence: [],
    signatures: [],
    finalSnapshot: null,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

describe('Inspection async ownership', () => {
  it('ignores a late Start completion after navigation to another Inspection', async () => {
    let current = bundle(inspectionA);
    const pending = deferred<InspectionResponseDto>();

    const completion = pending.promise.then((result) => {
      current = mergeInspectionStart(current, inspectionA, 1, result);
    });

    current = bundle(inspectionB);
    pending.resolve({
      ...inspection(inspectionA, 'in_progress'),
      version: 2,
    });
    await completion;

    expect(current.inspection.id).toBe(inspectionB);
    expect(
      inspectionSectionInstancePath(current.inspection.id, instance1),
    ).toBe(
      `/inspections/${inspectionB}/section-instances/${instance1}`,
    );
  });

  it('keeps the active S2 draft identity stable when a delayed S1 save completes', async () => {
    let current = bundle(inspectionA, [0, 4]);
    let localSection2Draft = 'local S2 edit';
    const section2KeyBefore = inspectionDraftResetKey(current, instance2);
    const pending = deferred<SaveInspectionSectionResponse>();

    const completion = pending.promise.then((saved) => {
      current = mergeInspectionSectionSave(
        current,
        inspectionA,
        instance1,
        0,
        saved,
      );
      if (inspectionDraftResetKey(current, instance2) !== section2KeyBefore) {
        localSection2Draft = 'RESET';
      }
    });

    pending.resolve({
      revision: 1,
      contentRevision: 1,
      responses: [],
      clearedItemIds: [],
    });
    await completion;

    expect(inspectionDraftResetKey(current, instance2)).toBe(section2KeyBefore);
    expect(localSection2Draft).toBe('local S2 edit');
    expect(
      current.sectionStates.find((state) => state.sectionInstanceId === instance1)
        ?.revision,
    ).toBe(1);
    expect(
      current.sectionStates.find((state) => state.sectionInstanceId === instance2)
        ?.revision,
    ).toBe(4);
  });

  it('never regresses global contentRevision when section saves complete out of order', async () => {
    let current = {
      ...bundle(inspectionA, [0, 0]),
      inspection: {
        ...bundle(inspectionA, [0, 0]).inspection,
        contentRevision: 2,
      },
    };

    current = mergeInspectionSectionSave(
      current,
      inspectionA,
      instance1,
      0,
      {
        revision: 1,
        contentRevision: 1,
        responses: [],
        clearedItemIds: [],
      },
    );

    expect(current.inspection.contentRevision).toBe(2);
    expect(
      current.sectionStates.find((state) => state.sectionInstanceId === instance1)
        ?.revision,
    ).toBe(1);
  });


  it('ignores a late Start result if the same Inspection was reloaded at a newer lifecycle version', () => {
    const current = {
      ...bundle(inspectionA),
      inspection: {
        ...inspection(inspectionA, 'in_progress'),
        version: 3,
      },
    };

    const merged = mergeInspectionStart(
      current,
      inspectionA,
      1,
      {
        ...inspection(inspectionA, 'in_progress'),
        version: 2,
      },
    );

    expect(merged).toBe(current);
    expect(merged.inspection.version).toBe(3);
  });

  it('ignores a late section-save result if that section already has a newer canonical revision', () => {
    const current = bundle(inspectionA, [2, 0]);

    const merged = mergeInspectionSectionSave(
      current,
      inspectionA,
      instance1,
      0,
      {
        revision: 1,
        contentRevision: 1,
        responses: [],
        clearedItemIds: [],
      },
    );

    expect(merged).toBe(current);
    expect(
      merged.sectionStates.find((state) => state.sectionInstanceId === instance1)
        ?.revision,
    ).toBe(2);
  });


  it('keeps S1 locked while S1 and S2 saves are concurrently in flight', () => {
    const s1Key = inspectionSectionOperationKey(inspectionA, instance1);
    const s2Key = inspectionSectionOperationKey(inspectionA, instance2);

    let inFlight: ReadonlySet<string> = new Set();
    inFlight = withInspectionOperationStarted(inFlight, s1Key);
    inFlight = withInspectionOperationStarted(inFlight, s2Key);

    expect(
      canEditInspectionSection(
        'in_progress',
        inFlight,
        inspectionA,
        instance1,
      ),
    ).toBe(false);
    expect(
      canEditInspectionSection(
        'in_progress',
        inFlight,
        inspectionA,
        instance2,
      ),
    ).toBe(false);

    inFlight = withInspectionOperationFinished(inFlight, s1Key);

    expect(
      canEditInspectionSection(
        'in_progress',
        inFlight,
        inspectionA,
        instance1,
      ),
    ).toBe(true);
    expect(
      canEditInspectionSection(
        'in_progress',
        inFlight,
        inspectionA,
        instance2,
      ),
    ).toBe(false);
  });

  it('finishing S1 never clears the independently pending S2 operation', () => {
    const s1Key = inspectionSectionOperationKey(inspectionA, instance1);
    const s2Key = inspectionSectionOperationKey(inspectionA, instance2);

    let inFlight: ReadonlySet<string> = new Set();
    inFlight = withInspectionOperationStarted(inFlight, s1Key);
    inFlight = withInspectionOperationStarted(inFlight, s2Key);
    inFlight = withInspectionOperationFinished(inFlight, s1Key);

    expect(inFlight.has(s1Key)).toBe(false);
    expect(inFlight.has(s2Key)).toBe(true);
  });

});

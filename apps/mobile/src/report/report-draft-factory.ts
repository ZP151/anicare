import type { StoredDraft } from '../offline/draft-policy';
import { createReportDraftPayload, type ReportAreaSelectionMode, type ReportDraftStep } from './report-draft';
import { isOpaqueReportId } from './ReportRouteShell';

export type ReportDraftAuthSnapshot = Readonly<{
  ownerSubject: string | null;
}>;

export type OwnerAwareReportDraftFactoryDependencies = Readonly<{
  readAuthSnapshot(): Promise<ReportDraftAuthSnapshot>;
  saveDraft(input: Record<string, unknown>): Promise<StoredDraft>;
  createId(): string;
  now(): Date;
}>;

export async function createOwnerAwareReportDraft(
  dependencies: OwnerAwareReportDraftFactoryDependencies,
  options: Readonly<{ step?: ReportDraftStep; areaSelectionMode?: ReportAreaSelectionMode }> = {},
): Promise<string> {
  const before = await dependencies.readAuthSnapshot();
  const id = dependencies.createId();
  if (!isOpaqueReportId(id)) throw new Error('invalid_draft_id');
  const report = createReportDraftPayload(dependencies.now(), {
    creatorMode: before.ownerSubject ? 'authenticated' : 'anonymous',
    areaSelectionMode: options.areaSelectionMode,
  });
  await dependencies.saveDraft({
    id,
    notes: '',
    risk: 'normal',
    ...(before.ownerSubject ? { ownerSubject: before.ownerSubject } : {}),
    report: { ...report, ...(options.step ? { step: options.step } : {}) },
  });
  const after = await dependencies.readAuthSnapshot();
  if (after.ownerSubject !== before.ownerSubject) throw new Error('authentication_changed');
  return id;
}

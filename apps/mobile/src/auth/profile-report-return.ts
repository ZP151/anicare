import { isOpaqueReportId } from '../report/ReportRouteShell';

export function validatedReturnDraftId(value: unknown): string | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return isOpaqueReportId(candidate) ? candidate : null;
}

export async function resumeValidatedReportDraft(
  value: unknown,
  getSessionSubject: () => Promise<string | null>,
  authorizeDraft: (draftId: string, ownerSubject: string) => Promise<boolean>,
  navigate: (path: string) => void,
): Promise<'invalid' | 'signed_out' | 'unauthorized' | 'resumed'> {
  const draftId = validatedReturnDraftId(value);
  if (!draftId) return 'invalid';
  const subject = await getSessionSubject().catch(() => null);
  if (!subject) return 'signed_out';
  if (!await authorizeDraft(draftId, subject).catch(() => false)) return 'unauthorized';
  navigate(`/report/new?draftId=${encodeURIComponent(draftId)}`);
  return 'resumed';
}

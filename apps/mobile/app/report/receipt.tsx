import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import * as Crypto from 'expo-crypto';

import { getMySightingSummary } from '../../src/api/my-reports';
import { getPublicCatSummary } from '../../src/api/cats';
import { getMyIdentityResult } from '../../src/api/identity-result';
import { listPublicSightings } from '../../src/api/feed';
import { submitIdentityProposal } from '../../src/api/identity';
import { readSessionSubjectStrict, subscribeSessionSubject } from '../../src/auth/session-subject';
import { useLocale } from '../../src/i18n/LocaleContext';
import { attachSightingToDraft, clearIdentityContinuation, deleteOfflineDraft, getOfflineDraft, listOfflineDrafts, saveOfflineDraft } from '../../src/offline/draft-store';
import { ReportReceipt, type ReportReceiptDependencies } from '../../src/report/ReportReceipt';

export default function ReportReceiptRoute() {
  const { sightingId } = useLocalSearchParams<{ sightingId?: string | string[] }>();
  const router = useRouter();
  const { locale } = useLocale();
  const dependencies = useMemo<ReportReceiptDependencies>(() => ({
    getSessionSubject: readSessionSubjectStrict,
    subscribeToAuthChanges: subscribeSessionSubject,
    getSummary: getMySightingSummary,
    getIdentityResult: getMyIdentityResult,
    getPublicCatSummary,
    loadDrafts: listOfflineDrafts,
    deleteReceiptAnchor: (draftId, ownerSubject) => deleteOfflineDraft(draftId, ownerSubject),
    clearIdentityContinuation,
    listPublicSightings,
    saveIdentityIntent: async (draft, sightingId, ownerSubject, intent) => {
      const requireOwner = async () => {
        if (await readSessionSubjectStrict() !== ownerSubject) throw new Error('authentication_changed');
      };
      await requireOwner();
      const existingAnchor = draft ?? (await listOfflineDrafts()).find((candidate) => candidate.ownerSubject === ownerSubject && candidate.sightingId === sightingId);
      await requireOwner();
      const draftId = existingAnchor?.id ?? Crypto.randomUUID();
      const current = await getOfflineDraft(draftId);
      await requireOwner();
      if (current && (current.ownerSubject !== ownerSubject || current.sightingId !== sightingId)) throw new Error('identity_proposal_unavailable');
      if (current?.identityContinuation) return { intent: current.identityContinuation.intent, requestId: current.identityContinuation.requestId };
      const requestId = Crypto.randomUUID();
      await saveOfflineDraft({
        ...(current ?? { id: draftId, ownerSubject, sightingId }), notes: '', risk: 'normal', report: undefined,
        identityContinuation: { intent, requestId },
      });
      await requireOwner();
      if (!current && !await attachSightingToDraft(draftId, sightingId, ownerSubject)) throw new Error('identity_proposal_unavailable');
      const stored = await getOfflineDraft(draftId);
      await requireOwner();
      if (stored?.ownerSubject !== ownerSubject || stored?.sightingId !== sightingId || !stored.identityContinuation) {
        throw new Error('identity_proposal_unavailable');
      }
      return { intent: stored.identityContinuation.intent, requestId: stored.identityContinuation.requestId };
    },
    submitIdentityProposal: (stableSightingId, intent, requestId) => submitIdentityProposal({ sightingId: stableSightingId, intent, requestId }),
    navigate: (path) => router.replace(path as never),
  }), [router]);
  return <ReportReceipt sightingId={sightingId} dependencies={dependencies} locale={locale} />;
}

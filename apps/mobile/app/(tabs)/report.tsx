import * as Crypto from 'expo-crypto';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';

import { readSessionSubjectStrict, subscribeSessionSubject } from '../../src/auth/session-subject';
import { useLocale } from '../../src/i18n/LocaleContext';
import { claimOfflineDraftOwner, deleteOfflineDraft, listOfflineDrafts, saveOfflineDraft } from '../../src/offline/draft-store';
import { ReportHub, type ReportHubDependencies } from '../../src/report/ReportHub';

export default function ReportScreen() {
  const { locale } = useLocale();
  const router = useRouter();
  const dependencies = useMemo<ReportHubDependencies>(() => ({
    loadDrafts: listOfflineDrafts,
    saveDraft: saveOfflineDraft,
    deleteDraft: deleteOfflineDraft,
    getSessionSubject: readSessionSubjectStrict,
    subscribeToAuthChanges: subscribeSessionSubject,
    claimDraftOwner: claimOfflineDraftOwner,
    createId: Crypto.randomUUID,
    now: () => new Date(),
    navigate: (path) => router.push(path as never),
  }), [router]);
  return <ReportHub dependencies={dependencies} locale={locale} />;
}

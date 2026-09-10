import * as Crypto from 'expo-crypto';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';

import { readSessionSubjectStrict, subscribeSessionSubject } from '../../src/auth/session-subject';
import { useLocale } from '../../src/i18n/LocaleContext';
import { claimOfflineDraftOwner, deleteOfflineDraft, listOfflineDrafts, saveOfflineDraft } from '../../src/offline/draft-store';
import { ReportHub, type ReportHubDependencies } from '../../src/report/ReportHub';

export default function ReportScreen({ allDrafts = false }: { allDrafts?: boolean }) {
  const { locale } = useLocale();
  const router = useRouter();
  const [revision, setRevision] = useState(0);
  useFocusEffect(useCallback(() => { setRevision(n => n + 1); }, []));
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
  }), [router, revision]);
  return <ReportHub onClose={()=>router.canGoBack()?router.back():router.replace('/' as never)} allDrafts={allDrafts} dependencies={dependencies} locale={locale} />;
}

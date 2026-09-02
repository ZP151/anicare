import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';

import { listMyReports } from '../../src/api/my-reports';
import { readSessionSubjectStrict, subscribeSessionSubject } from '../../src/auth/session-subject';
import { useLocale } from '../../src/i18n/LocaleContext';
import { deleteOfflineDraft, listOfflineDrafts } from '../../src/offline/draft-store';
import { ReportReceipt, type ReportReceiptDependencies } from '../../src/report/ReportReceipt';

export default function ReportReceiptRoute() {
  const { sightingId } = useLocalSearchParams<{ sightingId?: string | string[] }>();
  const router = useRouter();
  const { locale } = useLocale();
  const dependencies = useMemo<ReportReceiptDependencies>(() => ({
    getSessionSubject: readSessionSubjectStrict,
    subscribeToAuthChanges: subscribeSessionSubject,
    listReports: ({ cursor }) => listMyReports({ cursor }),
    loadDrafts: listOfflineDrafts,
    deleteReceiptAnchor: (draftId, ownerSubject) => deleteOfflineDraft(draftId, ownerSubject),
    navigate: (path) => router.replace(path as never),
  }), [router]);
  return <ReportReceipt sightingId={sightingId} dependencies={dependencies} locale={locale} />;
}

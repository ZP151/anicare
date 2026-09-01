import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';

import { listMyReports } from '../../src/api/my-reports';
import { useLocale } from '../../src/i18n/LocaleContext';
import { listOfflineDrafts } from '../../src/offline/draft-store';
import { ReportReceipt, type ReportReceiptDependencies } from '../../src/report/ReportReceipt';

export default function ReportReceiptRoute() {
  const { sightingId } = useLocalSearchParams<{ sightingId?: string | string[] }>();
  const router = useRouter();
  const { locale } = useLocale();
  const dependencies = useMemo<ReportReceiptDependencies>(() => ({
    listReports: ({ cursor }) => listMyReports({ cursor }),
    loadDrafts: listOfflineDrafts,
    navigate: (path) => router.replace(path as never),
  }), [router]);
  return <ReportReceipt sightingId={sightingId} dependencies={dependencies} locale={locale} />;
}

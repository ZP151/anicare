import { useLocalSearchParams, useRouter } from 'expo-router';

import { useLocale } from '../../src/i18n/LocaleContext';
import { ReportRouteShell } from '../../src/report/ReportRouteShell';

export default function NewReportRoute() {
  const { draftId } = useLocalSearchParams<{ draftId?: string | string[] }>();
  const router = useRouter();
  const { locale } = useLocale();
  return <ReportRouteShell kind="draft" locale={locale} navigate={(path) => router.replace(path as never)} reportId={draftId} />;
}

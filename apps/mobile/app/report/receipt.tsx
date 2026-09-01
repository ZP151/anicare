import { useLocalSearchParams, useRouter } from 'expo-router';

import { useLocale } from '../../src/i18n/LocaleContext';
import { ReportRouteShell } from '../../src/report/ReportRouteShell';

export default function ReportReceiptRoute() {
  const { sightingId } = useLocalSearchParams<{ sightingId?: string | string[] }>();
  const router = useRouter();
  const { locale } = useLocale();
  return <ReportRouteShell kind="receipt" locale={locale} navigate={(path) => router.replace(path as never)} reportId={sightingId} />;
}

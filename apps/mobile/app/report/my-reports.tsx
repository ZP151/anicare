import { useRouter } from 'expo-router';

import { useLocale } from '../../src/i18n/LocaleContext';
import { ReportRouteShell } from '../../src/report/ReportRouteShell';

export default function MyReportsRoute() {
  const router = useRouter();
  const { locale } = useLocale();
  return <ReportRouteShell kind="history" locale={locale} navigate={(path) => router.replace(path as never)} />;
}

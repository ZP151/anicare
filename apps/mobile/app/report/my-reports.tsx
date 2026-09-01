import { useRouter } from 'expo-router';
import { useMemo } from 'react';

import { listMyReports } from '../../src/api/my-reports';
import { getSupabaseClient } from '../../src/api/supabase';
import { useLocale } from '../../src/i18n/LocaleContext';
import { listOfflineDrafts } from '../../src/offline/draft-store';
import { MyReportsScreen, type MyReportsDependencies } from '../../src/report/MyReportsScreen';

export default function MyReportsRoute() {
  const router = useRouter();
  const { locale } = useLocale();
  const dependencies = useMemo<MyReportsDependencies>(() => ({
    getSessionSubject: async () => {
      const client = getSupabaseClient();
      if (!client) return null;
      const { data } = await client.auth.getSession();
      return data.session?.user.id ?? null;
    },
    listReports: ({ cursor }) => listMyReports({ cursor }),
    loadDrafts: listOfflineDrafts,
    navigate: (path) => router.replace(path as never),
  }), [router]);
  return <MyReportsScreen dependencies={dependencies} locale={locale} />;
}

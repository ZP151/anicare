import * as Crypto from 'expo-crypto';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { listPublicSightings, type NarrowRpcClient } from '../../src/api/feed';
import { getSupabaseClient } from '../../src/api/supabase';
import { CatDetailScreen } from '../../src/components/CatDetailScreen';
import type { SelectedCatSummary } from '../../src/components/AnchoredCatSheet';
import { ScreenScaffold } from '../../src/components/ScreenScaffold';
import { colors } from '../../src/design/theme';
import { useLocale } from '../../src/i18n/LocaleContext';
import { toPublicMapPresentation } from '../../src/maps/public-map-policy';
import { saveOfflineDraft } from '../../src/offline/draft-store';
import { createReportDraftPayload } from '../../src/report/report-draft';

const previewCat: SelectedCatSummary = {
  animalId: 'demo-cat',
  primaryAlias: 'Mochi',
  verificationLabel: 'Community confirmed',
  timeLabel: 'Seen this afternoon',
};

const opaqueAnimalId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function CatRoute() {
  const { locale } = useLocale();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const animalId = typeof id === 'string' ? id : null;
  const fixture = animalId === previewCat.animalId;
  const [cat, setCat] = useState<SelectedCatSummary | null>(fixture ? previewCat : null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'unavailable'>(fixture ? 'ready' : 'loading');

  useEffect(() => {
    if (fixture) return;
    const client = getSupabaseClient() as unknown as NarrowRpcClient | null;
    if (!client || !animalId) {
      setStatus('unavailable');
      return;
    }
    let active = true;
    void listPublicSightings({ limit: 50 }, client)
      .then((page) => {
        if (!active) return;
        const row = page.items.find((item) => item.animalId === animalId);
        if (!row) {
          setStatus('unavailable');
          return;
        }
        const safe = toPublicMapPresentation(row);
        setCat({
          animalId: safe.animalId,
          primaryAlias: safe.alias,
          verificationLabel: safe.verificationLabel,
          timeLabel: safe.timeLabel,
        });
        setStatus('ready');
      })
      .catch(() => {
        if (active) setStatus('unavailable');
      });
    return () => { active = false; };
  }, [animalId, fixture]);

  if (status === 'ready' && cat) {
    return (
      <CatDetailScreen
        cat={cat}
        fixture={fixture}
        locale={locale}
        onReportSighting={async (selectedAnimalId) => {
          const draftId = Crypto.randomUUID();
          await saveOfflineDraft({ id: draftId, notes: '', risk: 'normal', report: createReportDraftPayload(new Date()) });
          const params = opaqueAnimalId.test(selectedAnimalId) ? { draftId, animalId: selectedAnimalId } : { draftId };
          router.push({ pathname: '/report/new', params } as never);
        }}
      />
    );
  }

  return (
    <ScreenScaffold
      subtitle="Public identity details are loaded only from the delayed community feed."
      title={status === 'loading' ? 'Loading cat profile' : 'Cat profile unavailable'}
    >
      <Text accessibilityLiveRegion="polite" style={styles.status}>
        {status === 'loading'
          ? 'Checking the privacy-safe public identity feed…'
          : 'This profile is not available in the current public window.'}
      </Text>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({ status: { color: colors.muted, fontSize: 14, lineHeight: 21 } });

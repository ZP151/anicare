import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { listPublicSightings, type NarrowRpcClient } from '../../src/api/feed';
import { getSupabaseClient } from '../../src/api/supabase';
import { CatDetailScreen } from '../../src/components/CatDetailScreen';
import type { SelectedCatSummary } from '../../src/components/AnchoredCatSheet';
import { ScreenScaffold } from '../../src/components/ScreenScaffold';
import { colors } from '../../src/design/theme';
import { toPublicMapPresentation } from '../../src/maps/public-map-policy';

const previewCat: SelectedCatSummary = {
  animalId: 'demo-cat',
  primaryAlias: 'Mochi',
  verificationLabel: 'Community confirmed',
  timeLabel: 'Seen this afternoon',
};

export default function CatRoute() {
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
        onReportSighting={() => router.push({ pathname: '/report', params: { animalId: cat.animalId } } as never)}
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

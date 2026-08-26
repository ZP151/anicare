import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { CatCard } from '../../src/components/CatCard';
import { ScreenScaffold } from '../../src/components/ScreenScaffold';
import { GlassSurface } from '../../src/design/GlassSurface';
import { colors, radii } from '../../src/design/theme';
import { useLocale } from '../../src/i18n/LocaleContext';
import { listPublicSightings, type NarrowRpcClient, type PublicSighting } from '../../src/api/feed';
import { getSupabaseClient } from '../../src/api/supabase';

type FeedStatus = 'demo' | 'loading' | 'live' | 'unavailable';

export default function NearbyScreen() {
  const { t } = useLocale();
  const client = getSupabaseClient() as unknown as NarrowRpcClient | null;
  const [status, setStatus] = useState<FeedStatus>(client ? 'loading' : 'demo');
  const [sightings, setSightings] = useState<readonly PublicSighting[]>([]);

  useEffect(() => {
    if (!client) {
      setStatus('demo');
      setSightings([]);
      return;
    }
    let active = true;
    setStatus('loading');
    void listPublicSightings({ limit: 20 }, client)
      .then((page) => {
        if (!active) return;
        setSightings(page.items);
        setStatus('live');
      })
      .catch(() => {
        if (!active) return;
        setSightings([]);
        setStatus('unavailable');
      });
    return () => { active = false; };
  }, [client]);

  return (
    <ScreenScaffold eyebrow={t('common.beta')} title={t('nearby.title')} subtitle={t('nearby.subtitle')}>
      <GlassSurface style={styles.notice}>
        <Text style={styles.noticeText}>◷ {t('nearby.privacyNote')}</Text>
      </GlassSurface>
      {status === 'demo' ? (
        <>
          <Text style={styles.modeLabel}>Demo mode · live feed unavailable</Text>
          <CatCard />
        </>
      ) : null}
      {status === 'loading' ? <Text style={styles.status}>Loading delayed public sightings…</Text> : null}
      {status === 'unavailable' ? <Text style={styles.error}>Live feed unavailable</Text> : null}
      {status === 'live' && sightings.length === 0 ? (
        <Text style={styles.status}>No delayed public sightings available.</Text>
      ) : null}
      {status === 'live' ? sightings.map((sighting) => (
        <GlassSurface key={sighting.sightingId} style={styles.card}>
          <View style={styles.cardBody}>
            <Text style={styles.name}>{sighting.primaryAlias}</Text>
            <Text style={styles.verification}>{sighting.verification.replaceAll('_', ' ')}</Text>
            <Text style={styles.meta}>Approx. cell {sighting.publicCellId} · {sighting.timeBucket}</Text>
            <Text style={styles.location}>Delayed coarse community data · exact place and time protected</Text>
          </View>
        </GlassSurface>
      )) : null}
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  notice: { padding: 14, borderRadius: radii.medium, backgroundColor: colors.leafSoft },
  noticeText: { color: colors.leaf, fontWeight: '600', lineHeight: 20 },
  modeLabel: { color: colors.amber, fontWeight: '800' },
  status: { color: colors.muted, lineHeight: 20 },
  error: { color: colors.danger, fontWeight: '700' },
  card: { overflow: 'hidden', borderRadius: radii.large, borderWidth: 1, borderColor: colors.line },
  cardBody: { padding: 18, gap: 8 },
  name: { color: colors.ink, fontSize: 22, fontWeight: '800' },
  verification: { color: colors.leaf, fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
  meta: { color: colors.ink, fontSize: 15 },
  location: { color: colors.muted, fontSize: 13, lineHeight: 19 },
});

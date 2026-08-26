import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ScreenScaffold } from '../../src/components/ScreenScaffold';
import { colors, radii } from '../../src/design/theme';
import { useLocale } from '../../src/i18n/LocaleContext';
import { listPublicSightings, type NarrowRpcClient, type PublicSighting } from '../../src/api/feed';
import { getSupabaseClient } from '../../src/api/supabase';

type FeedStatus = 'demo' | 'loading' | 'live' | 'unavailable';

export default function MapScreen() {
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

  const cells = sightings.filter(
    (sighting, index) => sightings.findIndex((candidate) => candidate.publicCellId === sighting.publicCellId) === index,
  );

  return (
    <ScreenScaffold title={t('map.title')} subtitle={t('map.subtitle')}>
      {status === 'demo' ? <Text style={styles.modeLabel}>Demo map · live feed unavailable</Text> : null}
      {status === 'loading' ? <Text style={styles.status}>Loading coarse public cells…</Text> : null}
      {status === 'unavailable' ? <Text style={styles.error}>Live coarse-cell feed unavailable</Text> : null}
      <View style={styles.map} accessibilityLabel="Coarse community cell list">
        <Text style={styles.legend}>
          {status === 'live' ? 'Coarse cells from live feed · no precise markers' : 'Demo coarse cells · no precise markers'}
        </Text>
        {status === 'demo' ? (
          <>
            <View style={styles.cellRow}><Text style={styles.cellName}>Demo cell 8928308280fffff</Text></View>
            <View style={styles.cellRow}><Text style={styles.cellName}>Demo cell 8928308280bffff</Text></View>
          </>
        ) : null}
        {status === 'live' && cells.length === 0 ? <Text style={styles.status}>No delayed public cells available.</Text> : null}
        {status === 'live' ? cells.map((sighting) => (
          <View key={sighting.publicCellId} style={styles.cellRow}>
            <Text style={styles.cellName}>Cell {sighting.publicCellId}</Text>
            <Text style={styles.cellMeta}>{sighting.primaryAlias} · {sighting.timeBucket}</Text>
          </View>
        )) : null}
      </View>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  map: { minHeight: 320, padding: 18, gap: 12, borderRadius: radii.large, backgroundColor: '#DEE8DB' },
  modeLabel: { color: colors.amber, fontWeight: '800' },
  status: { color: colors.muted, lineHeight: 20 },
  error: { color: colors.danger, fontWeight: '700' },
  legend: { color: colors.muted, fontWeight: '700', marginBottom: 4 },
  cellRow: { borderWidth: 1, borderColor: colors.leaf, borderRadius: radii.medium, padding: 14, gap: 4, backgroundColor: colors.leafSoft },
  cellName: { color: colors.ink, fontWeight: '800' },
  cellMeta: { color: colors.muted, fontSize: 13 },
});

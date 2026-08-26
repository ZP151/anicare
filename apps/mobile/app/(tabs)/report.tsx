import * as Crypto from 'expo-crypto';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { getSupabaseClient } from '../../src/api/supabase';
import { SightingRisk, submitSighting } from '../../src/api/sightings';
import { ScreenScaffold } from '../../src/components/ScreenScaffold';
import { colors, radii } from '../../src/design/theme';
import { useLocale } from '../../src/i18n/LocaleContext';
import { deleteOfflineDraft, saveOfflineDraft } from '../../src/offline/draft-store';

export default function ReportScreen() {
  const { t } = useLocale();
  const [coordinates, setCoordinates] = useState<{ latitude: number; longitude: number } | null>(null);
  const [notes, setNotes] = useState('');
  const [risk, setRisk] = useState<SightingRisk>('normal');
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [draftId] = useState(() => Crypto.randomUUID());

  async function choosePhoto() {
    router.push({ pathname: '/report/redaction-review', params: { draftId } });
  }

  async function useCurrentLocation() {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Location not shared', 'You can keep this report as a draft and try again later.');
      return;
    }
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    setCoordinates({
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    });
    setStatus('Location captured privately. It will never be sent to a public API response.');
  }

  async function submit() {
    if (!coordinates) {
      Alert.alert('Location needed', 'Choose the location only when you are ready to submit.');
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) {
      setStatus('Development backend is not configured. Your report has not been transmitted.');
      return;
    }
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      setStatus('Sign in from Profile before contributing. Anonymous browsing remains available.');
      return;
    }

    setSubmitting(true);
    try {
      const endpoint = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/create-sighting`;
      const result = await submitSighting({
        endpoint,
        accessToken: data.session.access_token,
        draft: {
          ...coordinates,
          occurredAt: new Date(),
          risk,
          traits: {},
          notes: notes.trim() || null,
          clientDedupeKey: draftId,
        },
      });
      setStatus(
        result.visibility === 'hidden'
          ? 'Submitted for private safety review.'
          : 'Submitted. The public update will appear after its safety delay.',
      );
      await deleteOfflineDraft(draftId).catch(() => undefined);
    } catch (error) {
      setStatus(`Submission failed: ${error instanceof Error ? error.message : 'unknown_error'}`);
    } finally {
      setSubmitting(false);
    }
  }

  async function saveDraft() {
    try {
      await saveOfflineDraft({ id: draftId, notes, risk });
      setStatus('Draft saved without precise location. Confirmed media remains encrypted on this device.');
    } catch {
      setStatus('Encrypted offline drafts are available in native iOS and Android builds.');
    }
  }

  return (
    <ScreenScaffold title={t('report.title')} subtitle={t('report.subtitle')}>
      <Pressable accessibilityRole="button" onPress={choosePhoto} style={styles.photo}>
        <Text style={styles.photoCopy}>＋ Review a cat photo privately</Text>
      </Pressable>
      <Text style={styles.warning}>Automatic people, licence-plate and cat detectors are unavailable. Add opaque masks manually before confirming.</Text>
      <TextInput
        accessibilityLabel="Sighting notes"
        multiline
        onChangeText={setNotes}
        placeholder="Coat, ear tip, markings and condition"
        placeholderTextColor={colors.muted}
        style={styles.input}
        value={notes}
      />
      <View style={styles.field}>
        <Text style={styles.label}>Safety sensitivity</Text>
        <View style={styles.row}>
          {(['normal', 'sensitive', 'critical'] as const).map((option) => (
            <Pressable key={option} onPress={() => setRisk(option)} style={[styles.choice, risk === option && styles.selected]}>
              <Text>{option}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <Pressable accessibilityRole="button" onPress={useCurrentLocation} style={styles.secondary}>
        <Text style={styles.secondaryText}>{coordinates ? 'Location ready · private' : 'Use location once'}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={saveDraft} style={styles.secondary}>
        <Text style={styles.secondaryText}>Save encrypted draft</Text>
      </Pressable>
      <Pressable accessibilityRole="button" disabled={submitting} onPress={submit} style={styles.action}>
        <Text style={styles.actionText}>{submitting ? 'Submitting…' : t('report.action')}</Text>
      </Pressable>
      {status ? <Text accessibilityLiveRegion="polite" style={styles.status}>{status}</Text> : null}
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  photo: { height: 230, borderRadius: radii.large, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.leaf, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.leafSoft, overflow: 'hidden' },
  photoCopy: { color: colors.leaf, fontWeight: '700' },
  warning: { color: colors.amber, fontSize: 13, lineHeight: 19 },
  input: { minHeight: 120, padding: 16, textAlignVertical: 'top', borderRadius: radii.medium, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, color: colors.ink },
  field: { padding: 16, borderRadius: radii.medium, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, gap: 10 },
  label: { color: colors.ink, fontSize: 16, fontWeight: '700' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: radii.small, borderWidth: 1, borderColor: colors.line },
  selected: { backgroundColor: colors.leafSoft, borderColor: colors.leaf },
  secondary: { minHeight: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.leaf },
  secondaryText: { color: colors.leaf, fontWeight: '800' },
  action: { minHeight: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.leaf },
  actionText: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },
  status: { color: colors.muted, lineHeight: 20, textAlign: 'center' },
});

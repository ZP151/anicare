import * as Crypto from 'expo-crypto';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { getSupabaseClient } from '../../src/api/supabase';
import { recoverSightingSubmission, SightingRisk, submitSighting } from '../../src/api/sightings';
import { ScreenScaffold } from '../../src/components/ScreenScaffold';
import { colors, radii } from '../../src/design/theme';
import { useLocale } from '../../src/i18n/LocaleContext';
import {
  attachSightingToDraft,
  deleteOfflineDraft,
  getOfflineDraft,
  saveOfflineDraft,
} from '../../src/offline/draft-store';
import { uploadDraftMediaNow } from '../../src/media/media-upload-runtime';
import {
  persistReportDraftBeforeReview,
  submitReportWithMedia,
  type ReportSubmissionOutcome,
} from '../../src/report/report-submission';

export default function ReportScreen() {
  const { t } = useLocale();
  const [coordinates, setCoordinates] = useState<{ latitude: number; longitude: number } | null>(null);
  const [notes, setNotes] = useState('');
  const [risk, setRisk] = useState<SightingRisk>('normal');
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [draftId] = useState(() => Crypto.randomUUID());

  async function choosePhoto() {
    try {
      await persistReportDraftBeforeReview({ draftId, notes, risk }, { saveDraft: saveOfflineDraft });
      router.push({ pathname: '/report/redaction-review', params: { draftId } });
    } catch {
      setStatus('Encrypted offline drafts are available in native iOS and Android builds.');
    }
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
    const supabase = getSupabaseClient();
    if (!supabase) {
      await saveOfflineDraft({ id: draftId, notes, risk }).catch(() => undefined);
      setStatus('Development backend is not configured. Your report has not been transmitted.');
      return;
    }

    setSubmitting(true);
    try {
      const endpoint = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/create-sighting`;
      const withCurrentToken = async () => {
        const { data } = await supabase.auth.getSession();
        if (!data.session) throw new Error('authentication_required');
        return data.session.access_token;
      };
      const result = await submitReportWithMedia({
        draftId,
        notes,
        risk,
        coordinates,
        occurredAt: new Date(),
      }, {
        saveDraft: saveOfflineDraft,
        getDraft: getOfflineDraft,
        recoverSighting: async (clientDedupeKey) => recoverSightingSubmission({
          endpoint, accessToken: await withCurrentToken(), clientDedupeKey,
        }),
        createSighting: async (draft) => submitSighting({
          endpoint,
          accessToken: await withCurrentToken(),
          draft: { ...draft, traits: {} },
        }),
        attachSighting: attachSightingToDraft,
        uploadMedia: uploadDraftMediaNow,
        deleteDraft: deleteOfflineDraft,
      });
      setStatus(submissionStatus(result));
    } catch (error) {
      setStatus(error instanceof Error && error.message === 'authentication_required'
        ? 'Sign in from Profile before contributing. Anonymous browsing remains available.'
        : 'Submission could not be completed. Your durable draft remains available for recovery.');
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

function submissionStatus(result: ReportSubmissionOutcome): string {
  switch (result.state) {
    case 'submitted_text_only':
      return result.visibility === 'hidden'
        ? 'Submitted for private safety review.'
        : 'Submitted. The public update will appear after its safety delay.';
    case 'quarantined':
      return 'Reviewed media is in private quarantine. It is not publicly available.';
    case 'upload_pending':
      return 'Reviewed media is queued for a private upload and remains on this device.';
    case 'uploading':
      return 'Reviewed media is uploading privately. It is not publicly available.';
    case 'finalizing':
      return 'Reviewed media is awaiting private quarantine confirmation.';
    case 'waiting':
      return 'Private media upload retry is scheduled. It is not publicly available.';
    case 'needs_user':
      return 'The encrypted media needs review or recapture before it can be retried.';
    case 'recovery_miss':
      return 'No prior submission was found. Choose a location to submit this draft again, or recapture and re-review if its media cannot be recovered.';
    case 'not_ready':
      return 'Private media remains on this device until an authenticated upload can run.';
    case 'unavailable':
      return 'Secure media transport is unavailable on this platform. Nothing was uploaded.';
    case 'stale':
      return 'Another recovery run owns this media state. It remains private and will be rechecked.';
    default:
      return 'Your durable report state is awaiting safe recovery.';
  }
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

import * as Location from 'expo-location';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';

import { developmentInsecureOrigins } from '../../src/api/development-origin';
import { recoverSightingSubmission, submitSighting } from '../../src/api/sightings';
import { getSupabaseClient } from '../../src/api/supabase';
import { uploadDraftMediaNow } from '../../src/media/media-upload-runtime';
import {
  attachSightingToDraft,
  claimOfflineDraftOwner,
  deleteOfflineDraft,
  getOfflineDraft,
  removeReviewedMediaFromDraft,
  saveOfflineDraft,
} from '../../src/offline/draft-store';
import { ReportWizard, type ReportWizardDependencies } from '../../src/report/ReportWizard';
import { isOpaqueReportId, ReportRouteShell } from '../../src/report/ReportRouteShell';
import { submitReportWithMedia } from '../../src/report/report-submission';
import { useLocale } from '../../src/i18n/LocaleContext';

export default function NewReportRoute() {
  const { draftId } = useLocalSearchParams<{ draftId?: string | string[] }>();
  const router = useRouter();
  const { locale } = useLocale();
  const [focusRevision, setFocusRevision] = useState(0);
  useFocusEffect(useCallback(() => {
    setFocusRevision((current) => current + 1);
  }, []));
  const dependencies = useMemo<ReportWizardDependencies>(() => {
    const configuredUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
    const insecureOrigins = developmentInsecureOrigins(configuredUrl, process.env.NODE_ENV === 'production');
    const currentSession = async () => {
      const client = getSupabaseClient();
      const { data } = await client?.auth.getSession() ?? { data: { session: null } };
      if (!data.session?.access_token || !data.session.user.id) throw new Error('authentication_required');
      return { accessToken: data.session.access_token, ownerSubject: data.session.user.id };
    };
    return {
      loadDraft: getOfflineDraft,
      getSessionSubject: async () => {
        try { return (await currentSession()).ownerSubject; } catch { return null; }
      },
      saveDraft: saveOfflineDraft,
      removeReviewedMedia: removeReviewedMediaFromDraft,
      requestDeviceLocation: async () => {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.status !== 'granted') return { kind: 'denied' as const };
        const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        return { kind: 'granted' as const, latitude: position.coords.latitude, longitude: position.coords.longitude };
      },
      submit: async (input) => {
        const result = await submitReportWithMedia(input, {
          saveDraft: async (draft) => saveOfflineDraft(draft),
          getDraft: getOfflineDraft,
          acquireAuthContext: currentSession,
          verifyOwnerSubject: async (expectedOwnerSubject) => {
            try { return (await currentSession()).ownerSubject === expectedOwnerSubject; } catch { return false; }
          },
          claimDraftOwner: claimOfflineDraftOwner,
          recoverSighting: async (stableDraftId, session) => {
            return recoverSightingSubmission({
              supabaseUrl: configuredUrl,
              accessToken: session.accessToken,
              clientDedupeKey: stableDraftId,
              insecureOrigins,
            });
          },
          createSighting: async (draft, session) => {
            return submitSighting({
              supabaseUrl: configuredUrl,
              accessToken: session.accessToken,
              draft,
              insecureOrigins,
            });
          },
          attachSighting: attachSightingToDraft,
          uploadMedia: (stableDraftId, expectedOwnerSubject) => uploadDraftMediaNow(
            stableDraftId, undefined, expectedOwnerSubject,
          ),
          deleteDraft: deleteOfflineDraft,
        });
        return { sightingId: result.sightingId, state: result.state };
      },
      now: () => new Date(),
      navigate: (path) => router.push(path as never),
      exit: () => router.replace('/report'),
    };
  }, [router]);

  if (!isOpaqueReportId(draftId)) {
    return <ReportRouteShell kind="draft" locale={locale} navigate={(path) => router.replace(path as never)} reportId={draftId} />;
  }
  return <ReportWizard key={`${draftId}:${focusRevision}`} draftId={draftId} dependencies={dependencies} locale={locale} />;
}

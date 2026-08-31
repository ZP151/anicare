import * as Crypto from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Image,
  type LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ScreenScaffold } from '../../src/components/ScreenScaffold';
import { getSupabaseClient } from '../../src/api/supabase';
import { colors, radii } from '../../src/design/theme';
import type { MediaReviewState, PrivacyMask, RenderedMedia } from '../../src/media/contracts';
import { cleanupProcessorCacheUris, persistReviewedMedia, verifyReviewedMedia } from '../../src/media/draft-media';
import { MaskEditorOverlay } from '../../src/media/MaskEditorOverlay';
import { prepareCanonical, renderOpaqueMasks } from '../../src/media/processor';
import { canStageMedia, reduceMediaReview } from '../../src/media/review-policy';
import { createRenderCoordinator } from '../../src/media/render-coordinator';
import { createProcessorCacheLifecycle } from '../../src/media/processor-cache-lifecycle';
import {
  commitReviewedDraft,
  resumeReviewedDraftCommit,
  type ReviewedDraftCommitDependencies,
  type ReviewedMediaJournal,
} from '../../src/media/reviewed-draft';
import { saveReviewedMediaJournal } from '../../src/offline/draft-store';

const EMPTY_REVIEW: MediaReviewState = { status: 'idle', rendered: null, masks: [], receipt: null };
const PREVIEW_HEIGHT = 360;

function sameMaskSnapshots(left: readonly PrivacyMask[], right: readonly PrivacyMask[]): boolean {
  return left.length === right.length && left.every((mask, index) => {
    const other = right[index];
    return other?.id === mask.id && other.rect.x === mask.rect.x && other.rect.y === mask.rect.y &&
      other.rect.width === mask.rect.width && other.rect.height === mask.rect.height;
  });
}

export default function RedactionReviewScreen() {
  const params = useLocalSearchParams<{ draftId?: string }>();
  const draftId = typeof params.draftId === 'string' ? params.draftId : '';
  const [mediaId] = useState(() => `media-${Crypto.randomUUID()}`);
  const [canonical, setCanonical] = useState<RenderedMedia | null>(null);
  const [review, setReview] = useState<MediaReviewState>(EMPTY_REVIEW);
  const [previewWidth, setPreviewWidth] = useState(1);
  const [selectedMaskId, setSelectedMaskId] = useState<string | null>(null);
  const [renderCurrent, setRenderCurrent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, setPending] = useState<ReviewedMediaJournal | null>(null);
  const renderCoordinator = useRef(createRenderCoordinator()).current;
  const cacheLifecycle = useRef(createProcessorCacheLifecycle(cleanupProcessorCacheUris)).current;
  const mountedRef = useRef(true);
  const busyRef = useRef(false);
  const renderCurrentRef = useRef(false);
  const renderedMasksRef = useRef<readonly PrivacyMask[]>([]);
  const gestureStartRenderCurrentRef = useRef<boolean | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    cacheLifecycle.reactivate();
    return () => {
      mountedRef.current = false;
      renderCurrentRef.current = false;
      gestureStartRenderCurrentRef.current = null;
      renderCoordinator.cancel();
      void cacheLifecycle.requestCleanup();
    };
  }, [cacheLifecycle, renderCoordinator]);

  async function choosePhoto() {
    const operation = renderCoordinator.beginSelection();
    renderCurrentRef.current = false;
    gestureStartRenderCurrentRef.current = null;
    setRenderCurrent(false);
    setSelectedMaskId(null);
    cacheLifecycle.beginAsyncWork();
    busyRef.current = true;
    setBusy(true);
    setStatus('Preparing a private review copy…');
    try {
      const selected = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        exif: false,
        quality: 1,
      });
      if (selected.canceled || !selected.assets[0]?.uri || !renderCoordinator.isCurrent(operation.token)) return;
      if (!mountedRef.current) return;
      setCanonical(null);
      setReview(EMPTY_REVIEW);
      renderedMasksRef.current = [];
      await cacheLifecycle.startSelection(operation.token);
      if (!mountedRef.current || !renderCoordinator.isCurrent(operation.token)) return;
      const sourceUri = selected.assets[0].uri;
      const prepared = await prepareCanonical(sourceUri);
      await cacheLifecycle.adopt(operation.token, prepared.uri);
      if (!renderCoordinator.isCurrent(operation.token)) return;
      setCanonical(prepared);
      const rendered = await renderOpaqueMasks({ canonical: prepared, masks: [] });
      await cacheLifecycle.adopt(operation.token, rendered.uri);
      if (!renderCoordinator.isCurrent(operation.token)) return;
      renderedMasksRef.current = [];
      renderCurrentRef.current = true;
      setRenderCurrent(true);
      setReview(reduceMediaReview(EMPTY_REVIEW, { type: 'rendered_changed', rendered }));
      setStatus('Add, select and adjust opaque masks, then review every pixel before confirming.');
    } catch (error) {
      await cacheLifecycle.release(operation.token);
      if (!mountedRef.current || !renderCoordinator.isCurrent(operation.token)) return;
      setStatus(error instanceof Error && error.message === 'secure_media_processing_unavailable'
        ? 'Secure media processing is unavailable on this device.'
        : 'The photo could not be prepared safely. Nothing was staged.');
    } finally {
      await cacheLifecycle.endAsyncWork();
      if (renderCoordinator.finish(operation.token)) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  }

  async function commitMaskMutation(nextMasks: readonly PrivacyMask[]): Promise<void> {
    if (!canonical || busyRef.current || pending) return;
    const operation = renderCoordinator.beginMutation(nextMasks);
    if (!operation) return;
    gestureStartRenderCurrentRef.current = null;
    renderCurrentRef.current = false;
    setRenderCurrent(false);
    setReview((current) => reduceMediaReview(current, { type: 'masks_changed', masks: operation.masks }));
    cacheLifecycle.startMutation(operation.token);
    cacheLifecycle.beginAsyncWork();
    busyRef.current = true;
    setBusy(true);
    setStatus('Rendering the updated opaque masks…');
    try {
      const rendered = await renderOpaqueMasks({ canonical, masks: operation.masks });
      await cacheLifecycle.adopt(operation.token, rendered.uri);
      if (!renderCoordinator.isCurrent(operation.token)) return;
      renderedMasksRef.current = operation.masks;
      renderCurrentRef.current = true;
      setRenderCurrent(true);
      setReview((current) => reduceMediaReview(current, { type: 'rendered_changed', rendered }));
      setStatus(operation.masks.length === 0
        ? 'Masks cleared. Review the newly rendered pixels before confirming.'
        : 'Mask applied to final pixels. Review again before confirming.');
    } catch {
      await cacheLifecycle.release(operation.token);
      if (!mountedRef.current || !renderCoordinator.isCurrent(operation.token)) return;
      setStatus('The mask could not be rendered safely. Confirmation remains disabled.');
    } finally {
      await cacheLifecycle.endAsyncWork();
      if (renderCoordinator.finish(operation.token)) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  }

  function previewMaskMutation(nextMasks: readonly PrivacyMask[]) {
    if (!canonical || busyRef.current || pending) return;
    if (gestureStartRenderCurrentRef.current === null) {
      gestureStartRenderCurrentRef.current = renderCurrentRef.current;
    }
    renderCurrentRef.current = false;
    setRenderCurrent(false);
    setReview((current) => reduceMediaReview(current, { type: 'masks_changed', masks: nextMasks }));
  }

  function cancelMaskMutation(originalMasks: readonly PrivacyMask[]) {
    if (!canonical || busyRef.current || pending) return;
    const hadRenderAuthority = gestureStartRenderCurrentRef.current === true;
    gestureStartRenderCurrentRef.current = null;
    const restoresRenderAuthority = hadRenderAuthority &&
      sameMaskSnapshots(originalMasks, renderedMasksRef.current);
    renderCurrentRef.current = restoresRenderAuthority;
    setRenderCurrent(restoresRenderAuthority);
    setReview((current) => reduceMediaReview(current, { type: 'masks_changed', masks: originalMasks }));
  }

  async function confirmPrivateCopy() {
    if (!draftId || !review.rendered || busyRef.current ||
      (!pending && (!renderCurrentRef.current || !renderedMasksAreCurrent))) return;
    const confirmed = pending ? review : reduceMediaReview(review, { type: 'confirm' });
    if (!pending) setReview(confirmed);
    if (!pending && (!canStageMedia(confirmed) || !confirmed.receipt)) {
      setStatus('The exact rendered pixels must be reviewed again.');
      return;
    }

    busyRef.current = true;
    setBusy(true);
    setStatus('Encrypting the reviewed copy on this device…');
    cacheLifecycle.beginAsyncWork();
    try {
      const dependencies: ReviewedDraftCommitDependencies = {
        createCommitId: () => `commit-${Crypto.randomUUID()}`,
        prepareJournal: async (journal) => { await saveJournal(journal, 'local_persisting', null); },
        inspectArtifact: verifyReviewedMedia,
        commitMedia: persistReviewedMedia,
        finalizeJournal: async (journal) => { await saveJournal(journal, 'upload_pending', null); },
        markNeedsUser: async (journal, error) => { await saveJournal(journal, 'needs_user', error); },
        cleanupCaches: (uris) => cacheLifecycle.cleanupOwned(uris),
      };
      const result = pending
        ? await resumeReviewedDraftCommit(pending, {
            review: confirmed,
            processorCacheUris: cacheLifecycle.ownedUris(),
          }, dependencies)
        : await commitReviewedDraft({
            draftId,
            mediaId,
            review: confirmed,
            processorCacheUris: cacheLifecycle.ownedUris(),
          }, dependencies);
      if (!mountedRef.current) return;
      if (result.status === 'local_persisting') {
        setPending(result.journal);
        setStatus('Private persistence is pending. Retry safely with the same immutable encrypted reference.');
        return;
      }
      if (result.status === 'needs_user') {
        await cacheLifecycle.abandonAll();
        setPending(null);
        setReview((current) => ({ ...current, status: 'needs_review', receipt: null }));
        setStatus('The encrypted copy could not be authenticated. Select and review the photo again.');
        return;
      }
      await cacheLifecycle.abandonAll();
      setPending(null);
      setStatus('Encrypted reviewed media saved privately. It has not been uploaded or published.');
      router.back();
    } catch (error) {
      await cacheLifecycle.abandonAll();
      if (mountedRef.current) {
        if (!pending) setReview((current) => ({ ...current, status: 'needs_review', receipt: null }));
        setStatus(error instanceof Error && error.message === 'authentication_required'
          ? 'Sign in again before saving reviewed media. No media was staged.'
          : 'Private encrypted storage failed. The media was not staged.');
      }
    } finally {
      await cacheLifecycle.endAsyncWork();
      if (mountedRef.current) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  }

  async function saveJournal(
    journal: ReviewedMediaJournal,
    state: 'local_persisting' | 'upload_pending' | 'needs_user',
    lastError: 'local_media_missing' | 'local_media_corrupt' | 'version_mismatch' | null,
  ) {
    const supabase = getSupabaseClient();
    const { data } = await supabase?.auth.getSession() ?? { data: { session: null } };
    const ownerSubject = data.session?.user.id;
    if (!ownerSubject) throw new Error('authentication_required');
    await saveReviewedMediaJournal(journal, state, lastError, ownerSubject);
  }

  function rememberPreviewSize(event: LayoutChangeEvent) {
    setPreviewWidth(event.nativeEvent.layout.width);
  }

  const renderedMasksAreCurrent = sameMaskSnapshots(review.masks, renderedMasksRef.current);
  const editorDisabled = busy || !!pending;
  const confirmationDisabled = busy || (!pending && (!renderCurrent || !renderedMasksAreCurrent));

  return (
    <ScreenScaffold title="Private photo review" subtitle="Only a newly rendered, confirmed copy can be encrypted for this draft.">
      <View style={styles.detectors}>
        <Text style={styles.detector}>People detection: unavailable</Text>
        <Text style={styles.detector}>Licence-plate detection: unavailable</Text>
        <Text style={styles.detector}>Cat detection: unavailable</Text>
        <Text style={styles.warning}>No automatic detector has checked this image. You must inspect it manually.</Text>
      </View>

      {review.rendered ? (
        <View onLayout={rememberPreviewSize} style={styles.editor}>
          <View pointerEvents="none" style={styles.previewFrame}>
            <Image accessibilityLabel="Reviewed private image" resizeMode="contain" source={{ uri: review.rendered.uri }} style={styles.preview} />
          </View>
          <MaskEditorOverlay
            imageWidth={review.rendered.width}
            imageHeight={review.rendered.height}
            frameWidth={previewWidth}
            frameHeight={PREVIEW_HEIGHT}
            masks={review.masks}
            selectedMaskId={selectedMaskId}
            disabled={editorDisabled}
            createMaskId={() => Crypto.randomUUID()}
            onSelectionChange={setSelectedMaskId}
            onMutationPreview={previewMaskMutation}
            onMutationCommit={(masks) => { void commitMaskMutation(masks); }}
            onMutationCancel={cancelMaskMutation}
          />
        </View>
      ) : (
        <Pressable accessibilityLabel="Choose photo for private review" accessibilityRole="button" disabled={busy} onPress={choosePhoto} style={styles.photoButton}>
          <Text style={styles.photoButtonText}>{busy ? 'Preparing…' : 'Choose photo for private review'}</Text>
        </Pressable>
      )}

      {review.rendered ? (
        <>
          <Pressable accessibilityRole="button" disabled={editorDisabled || review.masks.length === 0} onPress={() => { void commitMaskMutation([]); }} style={styles.secondary}>
            <Text style={styles.secondaryText}>Clear all masks</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: confirmationDisabled }} disabled={confirmationDisabled} onPress={confirmPrivateCopy} style={styles.action}>
            <Text style={styles.actionText}>{busy ? 'Working…' : pending ? 'Retry saving encrypted reference' : 'Confirm exact pixels and encrypt'}</Text>
          </Pressable>
        </>
      ) : null}
      {status ? <Text accessibilityLiveRegion="polite" style={styles.status}>{status}</Text> : null}
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  detectors: { padding: 16, gap: 6, borderRadius: radii.medium, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  detector: { color: colors.danger, fontWeight: '700' },
  warning: { color: colors.muted, lineHeight: 19, marginTop: 4 },
  photoButton: { minHeight: 180, alignItems: 'center', justifyContent: 'center', borderRadius: radii.large, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.leaf, backgroundColor: colors.leafSoft },
  photoButtonText: { color: colors.leaf, fontWeight: '800' },
  editor: { position: 'relative', alignSelf: 'stretch' },
  previewFrame: { position: 'absolute', top: 0, right: 0, left: 0, height: PREVIEW_HEIGHT, overflow: 'hidden', borderRadius: radii.large, backgroundColor: '#111111' },
  preview: { width: '100%', height: '100%' },
  secondary: { minHeight: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.leaf },
  secondaryText: { color: colors.leaf, fontWeight: '800' },
  action: { minHeight: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.leaf },
  actionText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  status: { color: colors.muted, lineHeight: 20, textAlign: 'center' },
});

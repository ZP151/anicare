import * as Crypto from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import {
  Image,
  type LayoutChangeEvent,
  type GestureResponderEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ScreenScaffold } from '../../src/components/ScreenScaffold';
import { colors, radii } from '../../src/design/theme';
import type { MediaReviewState, PrivacyMask, RenderedMedia } from '../../src/media/contracts';
import { cleanupProcessorCacheUris, persistReviewedMedia, verifyReviewedMedia } from '../../src/media/draft-media';
import { prepareCanonical, renderOpaqueMasks } from '../../src/media/processor';
import { normalizePreviewTap } from '../../src/media/redaction-geometry';
import { canStageMedia, reduceMediaReview } from '../../src/media/review-policy';
import { createRenderCoordinator } from '../../src/media/render-coordinator';
import {
  commitReviewedDraft,
  resumeReviewedDraftCommit,
  type ReviewedDraftCommitDependencies,
  type ReviewedMediaJournal,
} from '../../src/media/reviewed-draft';
import { saveOfflineDraft } from '../../src/offline/draft-store';

const EMPTY_REVIEW: MediaReviewState = { status: 'idle', rendered: null, masks: [], receipt: null };

function maskAt(x: number, y: number): PrivacyMask {
  const width = 0.24;
  const height = 0.14;
  return {
    id: Crypto.randomUUID(),
    rect: {
      x: Math.min(1 - width, Math.max(0, x - width / 2)),
      y: Math.min(1 - height, Math.max(0, y - height / 2)),
      width,
      height,
    },
  };
}

export default function RedactionReviewScreen() {
  const params = useLocalSearchParams<{ draftId?: string }>();
  const draftId = typeof params.draftId === 'string' ? params.draftId : '';
  const [mediaId] = useState(() => `media-${Crypto.randomUUID()}`);
  const [canonical, setCanonical] = useState<RenderedMedia | null>(null);
  const [review, setReview] = useState<MediaReviewState>(EMPTY_REVIEW);
  const [previewSize, setPreviewSize] = useState({ width: 1, height: 1 });
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, setPending] = useState<ReviewedMediaJournal | null>(null);
  const processorCacheUris = useRef<string[]>([]);
  const renderCoordinator = useRef(createRenderCoordinator()).current;

  async function choosePhoto() {
    const operation = renderCoordinator.beginSelection();
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
      const sourceUri = selected.assets[0].uri;
      processorCacheUris.current = [];
      const prepared = await prepareCanonical(sourceUri);
      processorCacheUris.current.push(prepared.uri);
      if (!renderCoordinator.isCurrent(operation.token)) return;
      setCanonical(prepared);
      const rendered = await renderOpaqueMasks({ canonical: prepared, masks: [] });
      processorCacheUris.current.push(rendered.uri);
      if (!renderCoordinator.isCurrent(operation.token)) return;
      setReview(reduceMediaReview(EMPTY_REVIEW, { type: 'rendered_changed', rendered }));
      setStatus('Tap anywhere on the image to burn in an opaque mask. Review every pixel before confirming.');
    } catch (error) {
      if (!renderCoordinator.isCurrent(operation.token)) return;
      setStatus(error instanceof Error && error.message === 'secure_media_processing_unavailable'
        ? 'Secure media processing is unavailable on this device.'
        : 'The photo could not be prepared safely. Nothing was staged.');
    } finally {
      if (renderCoordinator.finish(operation.token)) setBusy(false);
    }
  }

  async function addMask(event: GestureResponderEvent) {
    if (!canonical || busy || pending) return;
    const tap = normalizePreviewTap({
      imageWidth: review.rendered?.width ?? canonical.width,
      imageHeight: review.rendered?.height ?? canonical.height,
      frameWidth: previewSize.width,
      frameHeight: previewSize.height,
      x: event.nativeEvent.locationX,
      y: event.nativeEvent.locationY,
    });
    if (!tap) return;
    const operation = renderCoordinator.beginMutation([...review.masks, maskAt(tap.x, tap.y)]);
    if (!operation) return;
    setReview((current) => reduceMediaReview(current, { type: 'masks_changed', masks: operation.masks }));
    setBusy(true);
    setStatus('Rendering the updated opaque masks…');
    try {
      const rendered = await renderOpaqueMasks({ canonical, masks: operation.masks });
      processorCacheUris.current.push(rendered.uri);
      if (!renderCoordinator.isCurrent(operation.token)) return;
      setReview((current) => reduceMediaReview(
        { ...current, masks: operation.masks },
        { type: 'rendered_changed', rendered },
      ));
      setStatus('Mask applied to final pixels. Review again before confirming.');
    } catch {
      if (!renderCoordinator.isCurrent(operation.token)) return;
      setStatus('The mask could not be rendered safely. Confirmation remains disabled.');
    } finally {
      if (renderCoordinator.finish(operation.token)) setBusy(false);
    }
  }

  async function clearMasks() {
    if (!canonical || busy || pending) return;
    const operation = renderCoordinator.beginMutation([]);
    if (!operation) return;
    setReview((current) => reduceMediaReview(current, { type: 'masks_changed', masks: operation.masks }));
    setBusy(true);
    try {
      const rendered = await renderOpaqueMasks({ canonical, masks: operation.masks });
      processorCacheUris.current.push(rendered.uri);
      if (!renderCoordinator.isCurrent(operation.token)) return;
      setReview((current) => reduceMediaReview(
        { ...current, masks: operation.masks },
        { type: 'rendered_changed', rendered },
      ));
      setStatus('Masks cleared. Review the newly rendered pixels before confirming.');
    } catch {
      if (!renderCoordinator.isCurrent(operation.token)) return;
      setStatus('The clean review copy could not be rendered. Confirmation remains disabled.');
    } finally {
      if (renderCoordinator.finish(operation.token)) setBusy(false);
    }
  }

  async function confirmPrivateCopy() {
    if (!draftId || !review.rendered || busy) return;
    const confirmed = pending ? review : reduceMediaReview(review, { type: 'confirm' });
    if (!pending) setReview(confirmed);
    if (!pending && (!canStageMedia(confirmed) || !confirmed.receipt)) {
      setStatus('The exact rendered pixels must be reviewed again.');
      return;
    }

    setBusy(true);
    setStatus('Encrypting the reviewed copy on this device…');
    try {
      const dependencies: ReviewedDraftCommitDependencies = {
        createCommitId: () => `commit-${Crypto.randomUUID()}`,
        prepareJournal: async (journal) => { await saveJournal(journal, 'local_persisting', null); },
        inspectArtifact: verifyReviewedMedia,
        commitMedia: persistReviewedMedia,
        finalizeJournal: async (journal) => { await saveJournal(journal, 'upload_pending', null); },
        markNeedsUser: async (journal, error) => { await saveJournal(journal, 'needs_user', error); },
        cleanupCaches: cleanupProcessorCacheUris,
      };
      const result = pending
        ? await resumeReviewedDraftCommit(pending, {
            review: confirmed,
            processorCacheUris: processorCacheUris.current,
          }, dependencies)
        : await commitReviewedDraft({
            draftId,
            mediaId,
            review: confirmed,
            processorCacheUris: processorCacheUris.current,
          }, dependencies);
      if (result.status === 'local_persisting') {
        setPending(result.journal);
        setStatus('Private persistence is pending. Retry safely with the same immutable encrypted reference.');
        return;
      }
      if (result.status === 'needs_user') {
        setPending(null);
        setReview((current) => ({ ...current, status: 'needs_review', receipt: null }));
        setStatus('The encrypted copy could not be authenticated. Select and review the photo again.');
        return;
      }
      setPending(null);
      setStatus('Encrypted reviewed media saved privately. It has not been uploaded or published.');
      router.back();
    } catch {
      if (!pending) setReview((current) => ({ ...current, status: 'needs_review', receipt: null }));
      setStatus('Private encrypted storage failed. The media was not staged.');
    } finally {
      setBusy(false);
    }
  }

  async function saveJournal(journal: ReviewedMediaJournal, state: 'local_persisting' | 'upload_pending' | 'needs_user', lastError: string | null) {
    await saveOfflineDraft({
      id: journal.draftId,
      mediaId: journal.mediaId,
      encryptedReviewedRef: journal.encryptedReviewedRef,
      receipt: journal.receipt,
      uploadJob: { state, attempts: 0, nextAttemptAt: null, lastError },
    });
  }

  function rememberPreviewSize(event: LayoutChangeEvent) {
    setPreviewSize(event.nativeEvent.layout);
  }

  return (
    <ScreenScaffold title="Private photo review" subtitle="Only a newly rendered, confirmed copy can be encrypted for this draft.">
      <View style={styles.detectors}>
        <Text style={styles.detector}>People detection: unavailable</Text>
        <Text style={styles.detector}>Licence-plate detection: unavailable</Text>
        <Text style={styles.detector}>Cat detection: unavailable</Text>
        <Text style={styles.warning}>No automatic detector has checked this image. You must inspect it manually.</Text>
      </View>

      {review.rendered ? (
        <Pressable
          accessibilityLabel="Reviewed image. Tap to add an opaque mask"
          disabled={busy || !!pending}
          onLayout={rememberPreviewSize}
          onPress={addMask}
          style={styles.previewFrame}
        >
          <Image resizeMode="contain" source={{ uri: review.rendered.uri }} style={styles.preview} />
        </Pressable>
      ) : (
        <Pressable accessibilityLabel="Choose photo for private review" accessibilityRole="button" disabled={busy} onPress={choosePhoto} style={styles.photoButton}>
          <Text style={styles.photoButtonText}>{busy ? 'Preparing…' : 'Choose photo for private review'}</Text>
        </Pressable>
      )}

      {review.rendered ? (
        <>
          <Text style={styles.help}>{review.masks.length} manual opaque mask{review.masks.length === 1 ? '' : 's'} · tap the image to add one.</Text>
          <Pressable accessibilityRole="button" disabled={busy || !!pending || review.masks.length === 0} onPress={clearMasks} style={styles.secondary}>
            <Text style={styles.secondaryText}>Clear all masks</Text>
          </Pressable>
          <Pressable accessibilityRole="button" disabled={busy} onPress={confirmPrivateCopy} style={styles.action}>
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
  previewFrame: { height: 360, overflow: 'hidden', borderRadius: radii.large, backgroundColor: '#111111' },
  preview: { width: '100%', height: '100%' },
  help: { color: colors.muted, lineHeight: 20 },
  secondary: { minHeight: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.leaf },
  secondaryText: { color: colors.leaf, fontWeight: '800' },
  action: { minHeight: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.leaf },
  actionText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  status: { color: colors.muted, lineHeight: 20, textAlign: 'center' },
});

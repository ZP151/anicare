import { useEffect, useMemo, useRef } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
} from 'react-native';

import type { PrivacyMask } from './contracts';
import {
  adjustMask,
  createDefaultMask,
  hitTestMasks,
  moveMask,
  normalizePreviewTap,
  normalizedRectToPreview,
  resizeMaskFromCorner,
  type AccessibleMaskAction,
  type MaskCorner,
  type NormalizedPoint,
} from './redaction-geometry';

export type MaskEditorOverlayProps = Readonly<{
  imageWidth: number;
  imageHeight: number;
  frameWidth: number;
  frameHeight: number;
  masks: readonly PrivacyMask[];
  selectedMaskId: string | null;
  disabled: boolean;
  createMaskId(): string;
  onSelectionChange(maskId: string | null): void;
  onMutationPreview(masks: readonly PrivacyMask[]): void;
  onMutationCommit(masks: readonly PrivacyMask[]): void;
}>;

type DragGesture = Readonly<{
  mask: PrivacyMask;
  masks: readonly PrivacyMask[];
  start: NormalizedPoint;
  part: 'body' | MaskCorner;
  latest: readonly PrivacyMask[];
  previewed: boolean;
}>;

type PendingAdd = Readonly<{
  mask: PrivacyMask;
  masks: readonly PrivacyMask[];
}>;

type ActiveGesture = DragGesture | PendingAdd;

const HANDLE_RADIUS_PX = 22;

const controlActions: readonly Readonly<{ label: string; action: AccessibleMaskAction }>[] = [
  { label: 'Move selected mask left', action: 'move_left' },
  { label: 'Move selected mask right', action: 'move_right' },
  { label: 'Move selected mask up', action: 'move_up' },
  { label: 'Move selected mask down', action: 'move_down' },
  { label: 'Make selected mask wider', action: 'wider' },
  { label: 'Make selected mask narrower', action: 'narrower' },
  { label: 'Make selected mask taller', action: 'taller' },
  { label: 'Make selected mask shorter', action: 'shorter' },
];

function replaceMask(masks: readonly PrivacyMask[], replacement: PrivacyMask): readonly PrivacyMask[] {
  const index = masks.findIndex((mask) => mask.id === replacement.id);
  if (index < 0 || masks[index] === replacement) return masks;
  return masks.map((mask, maskIndex) => maskIndex === index ? replacement : mask);
}

export function MaskEditorOverlay({
  imageWidth,
  imageHeight,
  frameWidth,
  frameHeight,
  masks,
  selectedMaskId,
  disabled,
  createMaskId,
  onSelectionChange,
  onMutationPreview,
  onMutationCommit,
}: MaskEditorOverlayProps) {
  const activeGesture = useRef<ActiveGesture | null>(null);
  const selectedMask = useMemo(
    () => masks.find((mask) => mask.id === selectedMaskId) ?? null,
    [masks, selectedMaskId],
  );

  useEffect(() => {
    if (selectedMaskId !== null && !selectedMask) onSelectionChange(null);
  }, [onSelectionChange, selectedMask, selectedMaskId]);

  const frame = { imageWidth, imageHeight, frameWidth, frameHeight };

  function pointFor(event: GestureResponderEvent): NormalizedPoint | null {
    return normalizePreviewTap({
      ...frame,
      x: event.nativeEvent.locationX,
      y: event.nativeEvent.locationY,
    });
  }

  function nextMasksFor(active: DragGesture, point: NormalizedPoint): readonly PrivacyMask[] {
    const nextMask = active.part === 'body'
      ? moveMask(active.mask, { x: point.x - active.start.x, y: point.y - active.start.y })
      : resizeMaskFromCorner(active.mask, active.part, point);
    return replaceMask(active.masks, nextMask);
  }

  function beginResponder(event: GestureResponderEvent) {
    if (disabled) return;
    const point = pointFor(event);
    if (!point) return;

    const hit = hitTestMasks({
      ...frame,
      masks,
      x: event.nativeEvent.locationX,
      y: event.nativeEvent.locationY,
      handleRadiusPx: HANDLE_RADIUS_PX,
    });
    if (!hit) {
      const created = createDefaultMask(createMaskId(), point);
      activeGesture.current = { mask: created, masks };
      return;
    }

    const hitMask = masks.find((mask) => mask.id === hit.maskId);
    if (!hitMask) return;
    const isSelected = hitMask.id === selectedMaskId;
    if (!isSelected) onSelectionChange(hitMask.id);
    activeGesture.current = {
      mask: hitMask,
      masks,
      start: point,
      part: isSelected ? hit.part : 'body',
      latest: masks,
      previewed: false,
    };
  }

  function moveResponder(event: GestureResponderEvent) {
    if (disabled) return;
    const active = activeGesture.current;
    const point = pointFor(event);
    if (!active || !point || !('part' in active)) return;
    const next = nextMasksFor(active, point);
    if (next === active.latest) return;
    onMutationPreview(next);
    activeGesture.current = { ...active, latest: next, previewed: true };
  }

  function endResponder(event: GestureResponderEvent) {
    const active = activeGesture.current;
    activeGesture.current = null;
    if (disabled || !active) return;
    if (!('part' in active)) {
      onSelectionChange(active.mask.id);
      onMutationCommit([...active.masks, active.mask]);
      return;
    }
    const point = pointFor(event);
    const finalMasks = point ? nextMasksFor(active, point) : active.latest;
    if (active.previewed || finalMasks !== active.masks) onMutationCommit(finalMasks);
  }

  function commitAdjustment(action: AccessibleMaskAction) {
    if (disabled || !selectedMask) return;
    const nextMask = adjustMask(selectedMask, action);
    const nextMasks = replaceMask(masks, nextMask);
    if (nextMasks !== masks) onMutationCommit(nextMasks);
  }

  function deleteSelectedMask() {
    if (disabled || !selectedMaskId || !selectedMask) return;
    onMutationCommit(masks.filter((mask) => mask.id !== selectedMaskId));
    onSelectionChange(null);
  }

  const selectedIndex = selectedMask ? masks.findIndex((mask) => mask.id === selectedMask.id) : -1;

  return (
    <View style={styles.root}>
      <View style={[styles.previewArea, { width: frameWidth, height: frameHeight }]}>
        <View
          testID="mask-editor-overlay"
          style={styles.overlay}
          onStartShouldSetResponder={() => !disabled}
          onMoveShouldSetResponder={() => !disabled}
          onResponderGrant={beginResponder}
          onResponderMove={moveResponder}
          onResponderRelease={endResponder}
          onResponderTerminate={endResponder}
        >
          {masks.map((mask) => {
            const rect = normalizedRectToPreview(mask.rect, frame);
            if (!rect) return null;
            const selected = mask.id === selectedMaskId;
            return (
              <View
                key={mask.id}
                pointerEvents="none"
                style={[
                  styles.mask,
                  selected ? styles.selectedMask : styles.unselectedMask,
                  { left: rect.x, top: rect.y, width: rect.width, height: rect.height },
                ]}
              >
                {selected ? (['topLeft', 'topRight', 'bottomLeft', 'bottomRight'] as const).map((corner) => (
                  <View key={corner} style={[styles.handleTarget, styles[corner]]}>
                    <View style={styles.handleDot} />
                  </View>
                )) : null}
              </View>
            );
          })}
        </View>
      </View>

      <Text accessibilityLiveRegion="polite" style={styles.selectionText}>
        {selectedIndex >= 0
          ? `Mask ${selectedIndex + 1} of ${masks.length} selected.`
          : `${masks.length} manual opaque masks. No mask selected.`}
      </Text>

      <View style={styles.controls}>
        {controlActions.map(({ label, action }) => {
          const noChange = !selectedMask || adjustMask(selectedMask, action) === selectedMask;
          const controlDisabled = disabled || noChange;
          return (
            <Pressable
              key={action}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityState={{ disabled: controlDisabled }}
              disabled={controlDisabled}
              onPress={() => commitAdjustment(action)}
              style={[styles.control, controlDisabled && styles.controlDisabled]}
            >
              <Text style={styles.controlText}>{label}</Text>
            </Pressable>
          );
        })}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Delete selected mask"
          accessibilityState={{ disabled: disabled || !selectedMask }}
          disabled={disabled || !selectedMask}
          onPress={deleteSelectedMask}
          style={[styles.control, styles.deleteControl, (disabled || !selectedMask) && styles.controlDisabled]}
        >
          <Text style={styles.controlText}>Delete selected mask</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 10 },
  previewArea: { position: 'relative' },
  overlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  mask: { position: 'absolute', borderWidth: 2 },
  selectedMask: { borderColor: '#FFFFFF', backgroundColor: 'rgba(255, 255, 255, 0.08)' },
  unselectedMask: { borderColor: 'rgba(255, 255, 255, 0.62)' },
  handleTarget: {
    position: 'absolute', width: HANDLE_RADIUS_PX * 2, height: HANDLE_RADIUS_PX * 2,
    alignItems: 'center', justifyContent: 'center',
  },
  topLeft: { left: -HANDLE_RADIUS_PX, top: -HANDLE_RADIUS_PX },
  topRight: { right: -HANDLE_RADIUS_PX, top: -HANDLE_RADIUS_PX },
  bottomLeft: { left: -HANDLE_RADIUS_PX, bottom: -HANDLE_RADIUS_PX },
  bottomRight: { right: -HANDLE_RADIUS_PX, bottom: -HANDLE_RADIUS_PX },
  handleDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#172116' },
  selectionText: { color: '#536050', lineHeight: 20 },
  controls: { gap: 8 },
  control: {
    minHeight: 44, paddingHorizontal: 12, borderRadius: 12, justifyContent: 'center',
    borderWidth: 1, borderColor: '#61845C', backgroundColor: 'rgba(255, 255, 255, 0.72)',
  },
  deleteControl: { borderColor: '#A64040' },
  controlDisabled: { opacity: 0.45 },
  controlText: { color: '#21301F', fontWeight: '700', textAlign: 'center' },
});

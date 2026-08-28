import { useEffect, useMemo, useRef } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
} from 'react-native';

import { GlassSurface } from '../design/GlassSurface';
import { colors, radii } from '../design/theme';
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
  onMutationCancel(originalMasks: readonly PrivacyMask[]): void;
}>;

type DragGesture = Readonly<{
  mask: PrivacyMask;
  masks: readonly PrivacyMask[];
  start: NormalizedPoint;
  startPixel: NormalizedPoint;
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
// Keeps ordinary tap jitter selection-only while remaining small relative to a 44pt handle.
const DRAG_THRESHOLD_PX = 6;

const controlActions: readonly Readonly<{
  label: string;
  visibleLabel: string;
  action: AccessibleMaskAction;
  group: 'position' | 'size';
}>[] = [
  { label: 'Move selected mask left', visibleLabel: 'Left', action: 'move_left', group: 'position' },
  { label: 'Move selected mask right', visibleLabel: 'Right', action: 'move_right', group: 'position' },
  { label: 'Move selected mask up', visibleLabel: 'Up', action: 'move_up', group: 'position' },
  { label: 'Move selected mask down', visibleLabel: 'Down', action: 'move_down', group: 'position' },
  { label: 'Make selected mask wider', visibleLabel: 'Wider', action: 'wider', group: 'size' },
  { label: 'Make selected mask narrower', visibleLabel: 'Narrower', action: 'narrower', group: 'size' },
  { label: 'Make selected mask taller', visibleLabel: 'Taller', action: 'taller', group: 'size' },
  { label: 'Make selected mask shorter', visibleLabel: 'Shorter', action: 'shorter', group: 'size' },
];

function replaceMask(masks: readonly PrivacyMask[], replacement: PrivacyMask): readonly PrivacyMask[] {
  const index = masks.findIndex((mask) => mask.id === replacement.id);
  if (index < 0 || masks[index] === replacement) return masks;
  return masks.map((mask, maskIndex) => maskIndex === index ? replacement : mask);
}

function sameMaskSnapshots(left: readonly PrivacyMask[], right: readonly PrivacyMask[]): boolean {
  return left.length === right.length && left.every((mask, index) => {
    const other = right[index];
    return other?.id === mask.id && other.rect.x === mask.rect.x && other.rect.y === mask.rect.y &&
      other.rect.width === mask.rect.width && other.rect.height === mask.rect.height;
  });
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
  onMutationCancel,
}: MaskEditorOverlayProps) {
  const activeGesture = useRef<ActiveGesture | null>(null);
  const selectedMask = useMemo(
    () => masks.find((mask) => mask.id === selectedMaskId) ?? null,
    [masks, selectedMaskId],
  );

  useEffect(() => {
    if (!disabled && selectedMaskId !== null && !selectedMask) onSelectionChange(null);
  }, [disabled, onSelectionChange, selectedMask, selectedMaskId]);

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

  function passedDragThreshold(active: DragGesture, event: GestureResponderEvent): boolean {
    const x = event.nativeEvent.locationX;
    const y = event.nativeEvent.locationY;
    return [x, y].every(Number.isFinite) &&
      (x - active.startPixel.x) ** 2 + (y - active.startPixel.y) ** 2 >= DRAG_THRESHOLD_PX ** 2;
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
      startPixel: { x: event.nativeEvent.locationX, y: event.nativeEvent.locationY },
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
    if (!passedDragThreshold(active, event)) return;
    const next = nextMasksFor(active, point);
    if (sameMaskSnapshots(next, active.latest)) return;
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
    const thresholdPassed = passedDragThreshold(active, event);
    if (!active.previewed && !thresholdPassed) return;
    const finalMasks = point ? nextMasksFor(active, point) : active.latest;
    if (active.previewed || !sameMaskSnapshots(finalMasks, active.masks)) onMutationCommit(finalMasks);
  }

  function terminateResponder() {
    const active = activeGesture.current;
    activeGesture.current = null;
    if (active && 'part' in active && active.previewed) onMutationCancel(active.masks);
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
          onResponderTerminate={terminateResponder}
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

      <GlassSurface interactive style={styles.controlsPanel}>
        {(['position', 'size'] as const).map((group) => (
          <View key={group} style={styles.controlGroup}>
            <Text style={styles.groupLabel}>{group === 'position' ? 'Position' : 'Size'}</Text>
            <View style={styles.controlRow}>
              {controlActions.filter((control) => control.group === group).map(({ label, visibleLabel, action }) => {
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
                    style={[
                      styles.control,
                      frameWidth < 240 && styles.narrowControl,
                      controlDisabled && styles.controlDisabled,
                    ]}
                  >
                    <Text numberOfLines={1} style={styles.controlText}>{visibleLabel}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
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
      </GlassSurface>
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
  selectionText: { color: colors.muted, lineHeight: 20 },
  controlsPanel: {
    padding: 10,
    gap: 8,
    overflow: 'hidden',
    borderRadius: radii.medium,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.78)',
  },
  controlGroup: { gap: 5 },
  groupLabel: { color: colors.muted, fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 },
  controlRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  control: {
    flexGrow: 1, flexShrink: 1, flexBasis: 44, minWidth: 44, minHeight: 44,
    paddingHorizontal: 4, borderRadius: 14, justifyContent: 'center',
    borderWidth: 1, borderColor: colors.leaf, backgroundColor: 'rgba(255, 255, 255, 0.68)',
  },
  narrowControl: { flexBasis: '46%' },
  deleteControl: {
    flexGrow: 0, flexShrink: 0, flexBasis: 'auto', minWidth: 0,
    borderColor: colors.danger, backgroundColor: 'rgba(158, 61, 56, 0.08)',
  },
  controlDisabled: { opacity: 0.45 },
  controlText: { color: colors.ink, fontWeight: '700', textAlign: 'center' },
});

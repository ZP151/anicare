import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react';
import { AppState, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { SightingRisk } from '../api/sightings';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { colors, radii } from '../design/theme';
import type { Locale } from '../i18n/catalog';
import type { StoredDraft } from '../offline/draft-policy';
import { earliestIncompleteStep, reportTraits } from './report-flow';
import { createReportDraftPayload, sanitizeReportDraftPayload, type ReportCondition, type ReportDraftStep } from './report-draft';
import { ReportAreaPicker } from './ReportAreaPicker';
import { getReportCopy } from './report-copy';

type DeviceLocationResult =
  | Readonly<{ kind: 'granted'; latitude: number; longitude: number }>
  | Readonly<{ kind: 'denied' }>;

export type ReportWizardDependencies = Readonly<{
  loadDraft(draftId: string): Promise<StoredDraft | null>;
  saveDraft(input: Record<string, unknown>): Promise<unknown>;
  removeReviewedMedia(draftId: string): Promise<void>;
  requestDeviceLocation(): Promise<DeviceLocationResult>;
  submit(input: Readonly<{
    draftId: string;
    notes: string;
    risk: SightingRisk;
    traits: Readonly<Record<string, unknown>>;
    occurredAt: Date;
    location: Readonly<{ kind: 'device_once'; latitude: number; longitude: number }> | Readonly<{ kind: 'manual_area'; publicCellId: string }> | null;
  }>): Promise<Readonly<{ sightingId: string | null; state: string }>>;
  now(): Date;
  navigate(path: string): void;
  exit(): void;
}>;

const stages: readonly ReportDraftStep[] = ['photo', 'details', 'safety', 'area', 'review'];

function followingStage(stage: ReportDraftStep): ReportDraftStep {
  return stages[Math.min(stages.indexOf(stage) + 1, stages.length - 1)]!;
}

function reviewedMediaPresent(draft: StoredDraft): boolean {
  return !!draft.mediaId && !!draft.encryptedReviewedRef;
}

export function ReportWizard({
  draftId,
  dependencies,
  initialStage,
  AreaPicker = ReportAreaPicker,
  captureAvailable = Platform.OS !== 'web',
  locale = 'en',
}: Readonly<{
  draftId: string;
  dependencies: ReportWizardDependencies;
  initialStage?: ReportDraftStep;
  AreaPicker?: ComponentType<Readonly<{ onSelect(selection: { publicCellId: string }): void }>>;
  captureAvailable?: boolean;
  locale?: Locale;
}>) {
  const copy = getReportCopy(locale);
  const [draft, setDraft] = useState<StoredDraft | null>(null);
  const [stage, setStage] = useState<ReportDraftStep | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [manualSelectionRequested, setManualSelectionRequested] = useState(false);
  const [deviceAreaSelected, setDeviceAreaSelected] = useState(false);
  const coordinatesRef = useRef<Readonly<{ latitude: number; longitude: number }> | null>(null);
  const locationPromptedRef = useRef(false);
  const mountedRef = useRef(true);
  const currentDraftRef = useRef<StoredDraft | null>(null);
  const currentStageRef = useRef<ReportDraftStep | null>(null);

  const clearActiveDeviceLocation = useCallback(() => {
    coordinatesRef.current = null;
    if (mountedRef.current) setDeviceAreaSelected(false);
  }, []);

  useEffect(() => {
    currentDraftRef.current = draft;
    currentStageRef.current = stage;
  }, [draft, stage]);

  useEffect(() => {
    let active = true;
    mountedRef.current = true;
    void dependencies.loadDraft(draftId).then((loaded) => {
      if (!active || !loaded?.report) {
        if (active) setStatus('This saved report is unavailable. Return to Report and start again.');
        return;
      }
      try {
        const report = sanitizeReportDraftPayload(loaded.report);
        const validDraft = { ...loaded, report };
        setDraft(validDraft);
        setStage(initialStage ?? earliestIncompleteStep(validDraft));
      } catch {
        setStatus('This saved report is unavailable. Return to Report and start again.');
      }
    }).catch(() => { if (active) setStatus('This saved report is unavailable. Return to Report and start again.'); });
    return () => {
      active = false;
      mountedRef.current = false;
      clearActiveDeviceLocation();
    };
  }, [clearActiveDeviceLocation, dependencies, draftId, initialStage]);

  const save = useCallback(async (nextDraft: StoredDraft, nextStage: ReportDraftStep) => {
    const current = nextDraft.report ?? createReportDraftPayload(dependencies.now());
    const report = sanitizeReportDraftPayload({ ...current, step: nextStage, updatedAt: dependencies.now().toISOString() });
    const updated = { ...nextDraft, report };
    await dependencies.saveDraft({ id: updated.id, notes: updated.notes, risk: updated.risk, report });
    setDraft(updated);
    setStage(nextStage);
    return updated;
  }, [dependencies]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'background' && nextState !== 'inactive') return;
      clearActiveDeviceLocation();
      const currentDraft = currentDraftRef.current;
      const currentStage = currentStageRef.current;
      if (currentDraft && currentStage) {
        void save(currentDraft, currentStage).catch(() => setStatus('Your changes could not be saved. Please try again.'));
      }
    });
    return () => subscription?.remove?.();
  }, [clearActiveDeviceLocation, save]);

  const advance = async () => {
    if (!draft || !stage) return;
    try {
      await save(draft, followingStage(stage));
      setStatus(null);
    } catch {
      setStatus('Your changes could not be saved. Please try again.');
    }
  };

  const setCondition = (condition: ReportCondition) => {
    if (!draft?.report) return;
    setDraft({ ...draft, report: { ...draft.report, condition } });
  };

  const selectDeviceArea = () => {
    if (locationPromptedRef.current) return;
    setDeviceAreaSelected(true);
    setManualSelectionRequested(false);
    setStatus('Your device location will be requested only when you submit this report.');
  };

  const selectManualArea = (selection: { publicCellId: string }) => {
    if (!draft?.report) return;
    setDraft({
      ...draft,
      report: sanitizeReportDraftPayload({
        ...draft.report,
        manualPublicCellId: selection.publicCellId,
        updatedAt: dependencies.now().toISOString(),
      }),
    });
    setManualSelectionRequested(false);
    setStatus('A broad area was selected. Your exact map tap was discarded.');
  };

  const submit = async () => {
    if (!draft?.report) return;
    try {
      let location: Readonly<{ kind: 'device_once'; latitude: number; longitude: number }> | Readonly<{ kind: 'manual_area'; publicCellId: string }> | null = null;
      if (deviceAreaSelected) {
        locationPromptedRef.current = true;
        const result = await dependencies.requestDeviceLocation();
        if (result.kind !== 'granted') {
          setManualSelectionRequested(true);
          setStatus('Location permission was not granted. Choose an area manually instead.');
          return;
        }
        coordinatesRef.current = { latitude: result.latitude, longitude: result.longitude };
        location = { kind: 'device_once', ...coordinatesRef.current };
      } else if (draft.report.manualPublicCellId) {
        location = { kind: 'manual_area', publicCellId: draft.report.manualPublicCellId };
      }
      if (!location) {
        setStatus('Choose an area before submitting.');
        return;
      }
      const result = await dependencies.submit({
        draftId,
        notes: draft.notes,
        risk: draft.risk,
        traits: reportTraits(draft.report),
        occurredAt: new Date(draft.report.occurredAt),
        location,
      });
      if (!mountedRef.current) return;
      if (result.sightingId) dependencies.navigate(`/report/receipt?sightingId=${result.sightingId}`);
      else setStatus('Your saved draft remains available. Try again when ready.');
    } catch {
      setStatus('Your saved draft remains available. Try again when ready.');
    } finally {
      clearActiveDeviceLocation();
    }
  };

  const saveAndExit = async () => {
    clearActiveDeviceLocation();
    if (draft && stage) {
      try { await save(draft, stage); } catch { setStatus('Your changes could not be saved. Please try again.'); return; }
    }
    dependencies.exit();
  };

  const removePhoto = async () => {
    try {
      await dependencies.removeReviewedMedia(draftId);
      if (draft) setDraft({ ...draft, mediaId: undefined, encryptedReviewedRef: undefined });
      setStatus('The private photo was removed from this saved report.');
    } catch {
      setStatus('The private photo could not be removed safely. Please try again.');
    }
  };

  if (!stage) return <ScreenScaffold title={copy.wizardTitle} subtitle={status ?? copy.wizardLoading} />;
  if (!draft?.report) return <ScreenScaffold title={copy.wizardUnavailableTitle} subtitle={status ?? copy.wizardUnavailableCopy} />;

  const photoReady = reviewedMediaPresent(draft);
  const canSubmit = deviceAreaSelected || !!draft.report.manualPublicCellId;

  return (
    <ScreenScaffold title={copy.wizardTitle} subtitle={`Step ${stages.indexOf(stage) + 1} of 5 · ${copy.stepLabel(stage)}`} trailing={
      <Pressable accessibilityLabel={copy.wizardSaveAndExit} accessibilityRole="button" onPress={() => { void saveAndExit(); }} style={styles.exit}><Text style={styles.exitText}>{copy.wizardSaveAndExit}</Text></Pressable>
    }>
      <View accessibilityLabel="Report stages" style={styles.stages}>{stages.map((item) => <Text key={item} style={item === stage ? styles.currentStage : styles.stage}>{copy.stepLabel(item)}</Text>)}</View>
      <Text accessibilityRole="header" style={styles.sectionTitle}>{copy.stepLabel(stage)}</Text>

      {stage === 'photo' ? <View style={styles.group}>
        <Text style={styles.copy}>{photoReady ? 'Private photo ready' : 'A photo is optional. If you add one, review and redact it before it is saved privately.'}</Text>
        <Pressable accessibilityLabel={photoReady ? 'Replace private photo' : 'Add private photo'} accessibilityRole="button" onPress={() => dependencies.navigate(`/report/redaction-review?draftId=${draftId}`)} style={styles.primary}><Text style={styles.primaryText}>{photoReady ? 'Replace private photo' : 'Add private photo'}</Text></Pressable>
        {photoReady ? <Pressable accessibilityLabel="Remove private photo" accessibilityRole="button" onPress={() => { void removePhoto(); }} style={styles.secondary}><Text style={styles.secondaryText}>Remove private photo</Text></Pressable> : <Pressable accessibilityLabel="Skip photo for now" accessibilityRole="button" onPress={() => { void advance(); }} style={styles.secondary}><Text style={styles.secondaryText}>Skip photo for now</Text></Pressable>}
      </View> : null}

      {stage === 'details' ? <View style={styles.group}>
        <Text style={styles.copy}>How did the cat appear?</Text>
        {(['appears_well', 'needs_attention', 'urgent'] as const).map((condition) => <Pressable key={condition} accessibilityRole="button" accessibilityState={{ selected: draft.report!.condition === condition }} onPress={() => setCondition(condition)} style={styles.option}><Text style={styles.optionText}>{condition.replace('_', ' ')}</Text></Pressable>)}
        <TextInput accessibilityLabel="Optional notes" multiline onChangeText={(notes) => setDraft({ ...draft, notes })} placeholder="Optional notes" style={styles.notes} value={draft.notes} />
        <Pressable accessibilityLabel="Continue to safety" accessibilityRole="button" disabled={!draft.report.condition} onPress={() => { void advance(); }} style={styles.primary}><Text style={styles.primaryText}>Continue</Text></Pressable>
      </View> : null}

      {stage === 'safety' ? <View style={styles.group}>
        <Text style={styles.copy}>Choose the level of care needed. Critical reports are not publicly visible.</Text>
        {(['normal', 'sensitive', 'critical'] as const).map((risk) => <Pressable key={risk} accessibilityRole="button" accessibilityState={{ selected: draft.risk === risk }} onPress={() => setDraft({ ...draft, risk })} style={styles.option}><Text style={styles.optionText}>{risk}</Text></Pressable>)}
        <Text style={styles.copy}>{draft.risk === 'critical' ? 'Critical reports are not publicly visible.' : draft.risk === 'sensitive' ? 'Sensitive reports reduce public visibility.' : 'Normal reports use the standard community visibility.'}</Text>
        <Pressable accessibilityLabel="Continue to area" accessibilityRole="button" onPress={() => { void advance(); }} style={styles.primary}><Text style={styles.primaryText}>Continue</Text></Pressable>
      </View> : null}

      {stage === 'area' || stage === 'review' ? <View style={styles.group}>
        <Text style={styles.copy}>Choose a broad area. Exact device coordinates are used only for this active submission and are never saved in the draft.</Text>
        {!captureAvailable ? <AreaPicker onSelect={selectManualArea} /> : <>
          <Pressable accessibilityLabel="Use device location" accessibilityRole="button" accessibilityState={{ disabled: locationPromptedRef.current }} disabled={locationPromptedRef.current} onPress={selectDeviceArea} style={styles.primary}><Text style={styles.primaryText}>Use device location</Text></Pressable>
          {manualSelectionRequested ? <AreaPicker onSelect={selectManualArea} /> : <Pressable accessibilityLabel="Choose an area manually" accessibilityRole="button" onPress={() => setManualSelectionRequested(true)} style={styles.secondary}><Text style={styles.secondaryText}>Choose an area manually</Text></Pressable>}
          {stage === 'area' ? <Pressable accessibilityLabel="Continue to review" accessibilityRole="button" disabled={!canSubmit} onPress={() => { void advance(); }} style={styles.secondary}><Text style={styles.secondaryText}>Continue to review</Text></Pressable> : null}
        </>}
      </View> : null}

      {stage === 'review' ? <View style={styles.group}>
        <Text style={styles.copy}>Check your details, safety choice and broad area before submitting. You can use the stages above to edit any section.</Text>
        <View style={styles.reviewLinks}>
          {(['photo', 'details', 'safety', 'area'] as const).map((item) => <Pressable key={item} accessibilityLabel={`Edit ${copy.stepLabel(item).toLowerCase()}`} accessibilityRole="button" onPress={() => setStage(item)} style={styles.editLink}><Text style={styles.editLinkText}>Edit {copy.stepLabel(item).toLowerCase()}</Text></Pressable>)}
        </View>
        {!canSubmit ? <Text style={styles.disabledReason}>Choose a device or broad manual area before submitting.</Text> : null}
        <Pressable accessibilityLabel="Submit report" accessibilityRole="button" accessibilityState={{ disabled: !canSubmit }} disabled={!canSubmit} onPress={() => { void submit(); }} style={[styles.primary, !canSubmit && styles.disabled]}><Text style={styles.primaryText}>Submit report</Text></Pressable>
      </View> : null}
      {status ? <Text accessibilityLiveRegion="polite" style={styles.status}>{status}</Text> : null}
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  exit: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 6 },
  exitText: { color: colors.actionPrimary, fontWeight: '700' },
  stages: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stage: { color: colors.muted, fontSize: 13 },
  currentStage: { color: colors.leaf, fontSize: 13, fontWeight: '800' },
  sectionTitle: { color: colors.ink, fontSize: 22, lineHeight: 28, fontWeight: '800' },
  group: { gap: 12 },
  copy: { color: colors.muted, fontSize: 16, lineHeight: 23 },
  primary: { minHeight: 50, paddingHorizontal: 16, borderRadius: radii.small, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.actionPrimary },
  primaryText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  disabled: { opacity: 0.45 },
  secondary: { minHeight: 48, paddingHorizontal: 16, borderRadius: radii.small, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.actionPrimary },
  secondaryText: { color: colors.actionPrimary, fontSize: 16, fontWeight: '800' },
  option: { minHeight: 48, paddingHorizontal: 16, borderRadius: radii.small, justifyContent: 'center', borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  optionText: { color: colors.ink, fontSize: 16, textTransform: 'capitalize' },
  notes: { minHeight: 96, padding: 14, borderRadius: radii.small, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, color: colors.ink, textAlignVertical: 'top' },
  status: { color: colors.muted, fontSize: 15, lineHeight: 21 },
  disabledReason: { color: colors.muted, fontSize: 15, lineHeight: 21 },
  reviewLinks: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  editLink: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 10, borderRadius: radii.small, borderWidth: 1, borderColor: colors.line },
  editLinkText: { color: colors.actionPrimary, fontSize: 15, fontWeight: '700' },
});

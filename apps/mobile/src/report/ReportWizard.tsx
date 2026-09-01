import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react';
import { AppState, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { SightingRisk } from '../api/sightings';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { colors, radii } from '../design/theme';
import type { Locale } from '../i18n/catalog';
import type { StoredDraft } from '../offline/draft-policy';
import { earliestIncompleteStep, reportTraits, validateReportForSubmission } from './report-flow';
import { createReportDraftPayload, sanitizeReportDraftPayload, type ReportCondition, type ReportDraftStep } from './report-draft';
import { ReportAreaPicker } from './ReportAreaPicker';
import { getReportCopy } from './report-copy';
import { isOpaqueReportId } from './ReportRouteShell';

type DeviceLocationResult =
  | Readonly<{ kind: 'granted'; latitude: number; longitude: number }>
  | Readonly<{ kind: 'denied' }>;

export type ReportWizardDependencies = Readonly<{
  loadDraft(draftId: string): Promise<StoredDraft | null>;
  getSessionSubject(): Promise<string | null>;
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
const coatValues = ['tabby', 'black', 'white', 'ginger', 'grey', 'calico', 'tortoiseshell', 'brown'] as const;
const markingValues = ['white-paws', 'white-chest', 'white-tail-tip', 'ear-tip', 'collar', 'scar', 'striped', 'spotted'] as const;

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
  AreaPicker?: ComponentType<Readonly<{ locale?: Locale; onSelect(selection: { publicCellId: string }): void }>>;
  captureAvailable?: boolean;
  locale?: Locale;
}>) {
  const copy = getReportCopy(locale);
  const [draft, setDraft] = useState<StoredDraft | null>(null);
  const [stage, setStage] = useState<ReportDraftStep | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [manualSelectionRequested, setManualSelectionRequested] = useState(false);
  const [deviceAreaSelected, setDeviceAreaSelected] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const coordinatesRef = useRef<Readonly<{ latitude: number; longitude: number }> | null>(null);
  const locationPromptedRef = useRef(false);
  const submitInFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const deviceAttemptRef = useRef(0);
  const currentDraftRef = useRef<StoredDraft | null>(null);
  const currentStageRef = useRef<ReportDraftStep | null>(null);
  const conditionLabels: Readonly<Record<ReportCondition, string>> = {
    appears_well: copy.wizardConditionWell,
    needs_attention: copy.wizardConditionNeedsAttention,
    urgent: copy.wizardConditionUrgent,
  };
  const riskLabels: Readonly<Record<SightingRisk, string>> = {
    normal: copy.wizardRiskNormal,
    sensitive: copy.wizardRiskSensitive,
    critical: copy.wizardRiskCritical,
  };

  const clearActiveDeviceLocation = useCallback(() => {
    deviceAttemptRef.current += 1;
    coordinatesRef.current = null;
    if (mountedRef.current) setDeviceAreaSelected(false);
  }, []);

  const completeDeviceAttempt = useCallback((attempt: number) => {
    if (deviceAttemptRef.current !== attempt) return;
    deviceAttemptRef.current += 1;
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
    void Promise.all([dependencies.loadDraft(draftId), dependencies.getSessionSubject().catch(() => null)]).then(([loaded, ownerSubject]) => {
      if (!active || !loaded?.report) {
        if (active) setStatus(copy.wizardUnavailableCopy);
        return;
      }
      if (loaded.ownerSubject !== undefined && loaded.ownerSubject !== ownerSubject) {
        setStatus(copy.wizardUnavailableCopy);
        return;
      }
      try {
        const report = sanitizeReportDraftPayload(loaded.report);
        const validDraft = { ...loaded, report };
        setDraft(validDraft);
        setStage(initialStage ?? earliestIncompleteStep(validDraft));
        if (!initialStage && report.step === 'area' && report.condition === null) setManualSelectionRequested(true);
      } catch {
        setStatus(copy.wizardUnavailableCopy);
      }
    }).catch(() => { if (active) setStatus(copy.wizardUnavailableCopy); });
    return () => {
      active = false;
      mountedRef.current = false;
      clearActiveDeviceLocation();
    };
  }, [clearActiveDeviceLocation, copy.wizardUnavailableCopy, dependencies, draftId, initialStage]);

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
        void save(currentDraft, currentStage).catch(() => setStatus(copy.wizardSaveFailed));
      }
    });
    return () => subscription?.remove?.();
  }, [clearActiveDeviceLocation, copy.wizardSaveFailed, save]);

  const advance = async () => {
    if (!draft || !stage) return;
    try {
      await save(draft, stage === 'area' && draft.report?.condition === null ? 'details' : followingStage(stage));
      setStatus(null);
    } catch {
      setStatus(copy.wizardSaveFailed);
    }
  };

  const setCondition = (condition: ReportCondition) => {
    if (!draft?.report) return;
    setDraft({ ...draft, report: { ...draft.report, condition } });
  };

  const toggleTrait = (kind: 'coat' | 'markings', value: string) => {
    if (!draft?.report) return;
    const current = draft.report[kind];
    const next = current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
    setDraft({ ...draft, report: sanitizeReportDraftPayload({ ...draft.report, [kind]: next }) });
  };

  const selectDeviceArea = () => {
    if (locationPromptedRef.current) return;
    setDeviceAreaSelected(true);
    setManualSelectionRequested(false);
    setStatus(copy.wizardDevicePending);
  };

  const selectManualArea = (selection: { publicCellId: string }) => {
    if (!draft?.report) return;
    setDeviceAreaSelected(false);
    setDraft({
      ...draft,
      report: sanitizeReportDraftPayload({
        ...draft.report,
        manualPublicCellId: selection.publicCellId,
        updatedAt: dependencies.now().toISOString(),
      }),
    });
    setManualSelectionRequested(false);
    setStatus(copy.wizardManualSelected);
  };

  const submit = async () => {
    if (!draft?.report || !stage || submitInFlightRef.current) return;
    submitInFlightRef.current = true;
    setSubmitting(true);
    const attempt = ++deviceAttemptRef.current;
    const attemptIsCurrent = () => mountedRef.current && deviceAttemptRef.current === attempt;
    try {
      let location: Readonly<{ kind: 'device_once'; latitude: number; longitude: number }> | Readonly<{ kind: 'manual_area'; publicCellId: string }> | null = null;
      if (deviceAreaSelected) {
        locationPromptedRef.current = true;
        const result = await dependencies.requestDeviceLocation();
        if (!attemptIsCurrent()) return;
        if (result.kind !== 'granted') {
          setManualSelectionRequested(true);
          setStatus(copy.wizardLocationDenied);
          return;
        }
        coordinatesRef.current = { latitude: result.latitude, longitude: result.longitude };
        location = { kind: 'device_once', ...coordinatesRef.current };
      } else if (draft.report.manualPublicCellId) {
        location = { kind: 'manual_area', publicCellId: draft.report.manualPublicCellId };
      }
      if (!location) {
        setStatus(copy.wizardAreaRequired);
        return;
      }
      const submissionDraft = draft.report.step === stage ? draft : await save(draft, stage);
      const issues = validateReportForSubmission(submissionDraft, location);
      if (issues.length > 0) {
        const issue = issues[0];
        if (issue === 'details_required') { setStage('details'); setStatus(copy.wizardDetailsRequired); }
        else if (issue === 'review_required') { setStage('review'); setStatus(copy.wizardReviewRequired); }
        else setStatus(copy.wizardAreaRequired);
        return;
      }
      if (!attemptIsCurrent()) return;
      const result = await dependencies.submit({
        draftId,
        notes: submissionDraft.notes,
        risk: submissionDraft.risk,
        traits: reportTraits(submissionDraft.report!),
        occurredAt: new Date(submissionDraft.report!.occurredAt),
        location,
      });
      if (!attemptIsCurrent()) return;
      if (isOpaqueReportId(result.sightingId)) dependencies.navigate(`/report/receipt?sightingId=${result.sightingId}`);
      else setStatus(copy.wizardRecovery);
    } catch (error) {
      if (attemptIsCurrent() && error instanceof Error &&
          (error.message === 'authentication_required' || error.message === 'authentication_changed' || error.message === 'auth_ownership')) {
        setStatus(copy.wizardSignInRequired);
        dependencies.navigate(`/profile?returnDraftId=${encodeURIComponent(draftId)}`);
      } else if (attemptIsCurrent()) setStatus(copy.wizardRecovery);
    } finally {
      completeDeviceAttempt(attempt);
      submitInFlightRef.current = false;
      if (mountedRef.current) setSubmitting(false);
    }
  };

  const saveAndExit = async () => {
    clearActiveDeviceLocation();
    if (draft && stage) {
      try { await save(draft, stage); } catch { setStatus(copy.wizardSaveFailed); return; }
    }
    dependencies.exit();
  };

  const removePhoto = async () => {
    try {
      await dependencies.removeReviewedMedia(draftId);
      if (draft) setDraft({ ...draft, mediaId: undefined, encryptedReviewedRef: undefined });
      setStatus(copy.wizardPhotoRemoved);
    } catch {
      setStatus(copy.wizardPhotoRemoveFailed);
    }
  };

  if (!stage) return <ScreenScaffold title={copy.wizardTitle} subtitle={status ?? copy.wizardLoading} />;
  if (!draft?.report) return <ScreenScaffold title={copy.wizardUnavailableTitle} subtitle={status ?? copy.wizardUnavailableCopy} />;

  const photoReady = reviewedMediaPresent(draft);
  const validationLocation = draft.report.manualPublicCellId
    ? { kind: 'manual_area' as const, publicCellId: draft.report.manualPublicCellId }
    : deviceAreaSelected ? { kind: 'device_once' as const, latitude: 0, longitude: 0 } : null;
  const validationDraft = stage === draft.report.step ? draft : { ...draft, report: { ...draft.report, step: stage } };
  const prerequisiteIssues = validateReportForSubmission(validationDraft, validationLocation);
  const canSubmit = prerequisiteIssues.length === 0;
  const canContinueFromArea = validationLocation !== null;
  const areaContinueLabel = draft.report.condition === null ? copy.wizardContinue : copy.wizardContinueToReview;
  const disabledReason = prerequisiteIssues[0] === 'details_required'
    ? copy.wizardDetailsRequired
    : prerequisiteIssues[0] === 'review_required' ? copy.wizardReviewRequired : copy.wizardSubmitDisabledReason;

  return (
    <ScreenScaffold title={copy.wizardTitle} subtitle={copy.wizardProgress(stages.indexOf(stage) + 1, stages.length, copy.stepLabel(stage))} trailing={
      <Pressable accessibilityLabel={copy.wizardSaveAndExit} accessibilityRole="button" onPress={() => { void saveAndExit(); }} style={styles.exit}><Text style={styles.exitText}>{copy.wizardSaveAndExit}</Text></Pressable>
    }>
      <View
        accessibilityLabel={copy.wizardStagesLabel}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 1, now: stages.indexOf(stage) + 1, max: stages.length, text: copy.wizardProgress(stages.indexOf(stage) + 1, stages.length, copy.stepLabel(stage)) }}
        style={styles.stages}
      >
        {stages.map((item) => <Text key={item} style={item === stage ? styles.currentStage : styles.stage}>{copy.stepLabel(item)}</Text>)}
      </View>
      <Text accessibilityRole="header" style={styles.sectionTitle}>{copy.stepLabel(stage)}</Text>

      {stage === 'photo' ? <View style={styles.group}>
        <Text style={styles.copy}>{photoReady ? copy.wizardPhotoReady : copy.wizardPhotoIntro}</Text>
        <Pressable accessibilityLabel={photoReady ? copy.wizardPhotoReplace : copy.wizardPhotoAdd} accessibilityRole="button" onPress={() => dependencies.navigate(`/report/redaction-review?draftId=${draftId}`)} style={styles.primary}><Text style={styles.primaryText}>{photoReady ? copy.wizardPhotoReplace : copy.wizardPhotoAdd}</Text></Pressable>
        {photoReady ? <Pressable accessibilityLabel={copy.wizardPhotoRetake} accessibilityRole="button" onPress={() => dependencies.navigate(`/report/redaction-review?draftId=${draftId}`)} style={styles.secondary}><Text style={styles.secondaryText}>{copy.wizardPhotoRetake}</Text></Pressable> : null}
        {photoReady ? <Pressable accessibilityLabel={copy.wizardPhotoRemove} accessibilityRole="button" onPress={() => { void removePhoto(); }} style={styles.secondary}><Text style={styles.secondaryText}>{copy.wizardPhotoRemove}</Text></Pressable> : <Pressable accessibilityLabel={copy.wizardPhotoSkip} accessibilityRole="button" onPress={() => { void advance(); }} style={styles.secondary}><Text style={styles.secondaryText}>{copy.wizardPhotoSkip}</Text></Pressable>}
      </View> : null}

      {stage === 'details' ? <View style={styles.group}>
        <Text style={styles.copy}>{copy.wizardDetailsIntro}</Text>
        <Text accessibilityRole="header" style={styles.traitTitle}>{copy.wizardCoatTitle}</Text>
        <View style={styles.traitGrid}>{coatValues.map((value) => <Pressable key={value} accessibilityLabel={copy.wizardCoatLabel(value)} accessibilityRole="button" accessibilityState={{ selected: draft.report!.coat.includes(value) }} onPress={() => toggleTrait('coat', value)} style={[styles.trait, draft.report!.coat.includes(value) && styles.optionSelected]}><Text style={styles.optionText}>{copy.wizardCoatLabel(value)}</Text></Pressable>)}</View>
        <Text accessibilityRole="header" style={styles.traitTitle}>{copy.wizardMarkingsTitle}</Text>
        <View style={styles.traitGrid}>{markingValues.map((value) => <Pressable key={value} accessibilityLabel={copy.wizardMarkingLabel(value)} accessibilityRole="button" accessibilityState={{ selected: draft.report!.markings.includes(value) }} onPress={() => toggleTrait('markings', value)} style={[styles.trait, draft.report!.markings.includes(value) && styles.optionSelected]}><Text style={styles.optionText}>{copy.wizardMarkingLabel(value)}</Text></Pressable>)}</View>
        {(['appears_well', 'needs_attention', 'urgent'] as const).map((condition) => <Pressable key={condition} accessibilityLabel={conditionLabels[condition]} accessibilityRole="button" accessibilityState={{ selected: draft.report!.condition === condition }} onPress={() => setCondition(condition)} style={[styles.option, draft.report!.condition === condition && styles.optionSelected]}><Text style={styles.optionText}>{conditionLabels[condition]}</Text>{draft.report!.condition === condition ? <MaterialCommunityIcons accessibilityElementsHidden color={colors.actionPrimary} name="check-circle" size={20} /> : null}</Pressable>)}
        <TextInput accessibilityLabel={copy.wizardNotesLabel} multiline onChangeText={(notes) => setDraft({ ...draft, notes })} placeholder={copy.wizardNotesPlaceholder} style={styles.notes} value={draft.notes} />
        <Pressable accessibilityLabel={copy.wizardContinueToSafety} accessibilityRole="button" disabled={!draft.report.condition} onPress={() => { void advance(); }} style={styles.primary}><Text style={styles.primaryText}>{copy.wizardContinue}</Text></Pressable>
      </View> : null}

      {stage === 'safety' ? <View style={styles.group}>
        <Text style={styles.copy}>{copy.wizardSafetyIntro}</Text>
        {(['normal', 'sensitive', 'critical'] as const).map((risk) => <Pressable key={risk} accessibilityLabel={riskLabels[risk]} accessibilityRole="button" accessibilityState={{ selected: draft.risk === risk }} onPress={() => setDraft({ ...draft, risk })} style={[styles.option, draft.risk === risk && styles.optionSelected]}><Text style={styles.optionText}>{riskLabels[risk]}</Text>{draft.risk === risk ? <MaterialCommunityIcons accessibilityElementsHidden color={colors.actionPrimary} name="check-circle" size={20} /> : null}</Pressable>)}
        <Text style={styles.copy}>{draft.risk === 'critical' ? copy.wizardRiskCriticalConsequence : draft.risk === 'sensitive' ? copy.wizardRiskSensitiveConsequence : copy.wizardRiskNormalConsequence}</Text>
        <Pressable accessibilityLabel={copy.wizardContinueToArea} accessibilityRole="button" onPress={() => { void advance(); }} style={styles.primary}><Text style={styles.primaryText}>{copy.wizardContinue}</Text></Pressable>
      </View> : null}

      {stage === 'area' || stage === 'review' ? <View style={styles.group}>
        <Text style={styles.copy}>{copy.wizardAreaIntro}</Text>
        {!captureAvailable ? <AreaPicker locale={locale} onSelect={selectManualArea} /> : <>
          <Pressable accessibilityLabel={copy.wizardDeviceLocation} accessibilityRole="button" accessibilityState={{ disabled: locationPromptedRef.current }} disabled={locationPromptedRef.current} onPress={selectDeviceArea} style={styles.primary}><Text style={styles.primaryText}>{copy.wizardDeviceLocation}</Text></Pressable>
          {manualSelectionRequested ? <AreaPicker locale={locale} onSelect={selectManualArea} /> : <Pressable accessibilityLabel={copy.wizardManualArea} accessibilityRole="button" onPress={() => setManualSelectionRequested(true)} style={styles.secondary}><Text style={styles.secondaryText}>{copy.wizardManualArea}</Text></Pressable>}
          {stage === 'area' ? <Pressable accessibilityLabel={areaContinueLabel} accessibilityRole="button" disabled={!canContinueFromArea} onPress={() => { void advance(); }} style={styles.secondary}><Text style={styles.secondaryText}>{areaContinueLabel}</Text></Pressable> : null}
        </>}
      </View> : null}

      {stage === 'review' ? <View style={styles.group}>
        <Text style={styles.copy}>{copy.wizardReviewIntro}</Text>
        <View style={styles.reviewSummary}>
          <Text style={styles.summaryItem}>{photoReady ? copy.wizardPhotoReady : copy.wizardPhotoSkip}</Text>
          {draft.report.condition ? <Text style={styles.summaryItem}>{conditionLabels[draft.report.condition]}</Text> : null}
          <Text style={styles.summaryItem}>{riskLabels[draft.risk]}</Text>
          <Text style={styles.summaryItem}>{draft.report.manualPublicCellId ? copy.wizardManualSelected : copy.wizardDevicePending}</Text>
        </View>
        <View style={styles.reviewLinks}>
          {(['photo', 'details', 'safety', 'area'] as const).map((item) => {
            const label = locale === 'en' ? copy.stepLabel(item).toLowerCase() : copy.stepLabel(item);
            return <Pressable key={item} accessibilityLabel={copy.wizardEdit(label)} accessibilityRole="button" onPress={() => setStage(item)} style={styles.editLink}><Text style={styles.editLinkText}>{copy.wizardEdit(label)}</Text></Pressable>;
          })}
        </View>
        {!canSubmit ? <Text style={styles.disabledReason}>{disabledReason}</Text> : null}
        <Pressable accessibilityLabel={copy.wizardSubmit} accessibilityRole="button" accessibilityState={{ disabled: !canSubmit || submitting, busy: submitting }} disabled={!canSubmit || submitting} onPress={() => { void submit(); }} style={[styles.primary, (!canSubmit || submitting) && styles.disabled]}><Text style={styles.primaryText}>{copy.wizardSubmit}</Text></Pressable>
      </View> : null}
      {status ? <Text accessibilityLiveRegion="polite" style={styles.status}>{status}</Text> : null}
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  exit: { minHeight: Platform.OS === 'android' ? 48 : 44, justifyContent: 'center', paddingHorizontal: 6 },
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
  option: { minHeight: 48, paddingHorizontal: 16, borderRadius: radii.small, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  optionSelected: { borderColor: colors.actionPrimary, borderWidth: 2 },
  optionText: { color: colors.ink, fontSize: 16, textTransform: 'capitalize' },
  traitTitle: { color: colors.ink, fontSize: 16, lineHeight: 22, fontWeight: '800' },
  traitGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  trait: { minHeight: 48, paddingHorizontal: 12, borderRadius: radii.small, justifyContent: 'center', borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  notes: { minHeight: 96, padding: 14, borderRadius: radii.small, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, color: colors.ink, textAlignVertical: 'top' },
  status: { color: colors.muted, fontSize: 15, lineHeight: 21 },
  disabledReason: { color: colors.muted, fontSize: 15, lineHeight: 21 },
  reviewLinks: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  reviewSummary: { gap: 4, paddingVertical: 4 },
  summaryItem: { color: colors.ink, fontSize: 15, lineHeight: 21, fontWeight: '700' },
  editLink: { minHeight: Platform.OS === 'android' ? 48 : 44, justifyContent: 'center', paddingHorizontal: 10, borderRadius: radii.small, borderWidth: 1, borderColor: colors.line },
  editLinkText: { color: colors.actionPrimary, fontSize: 15, fontWeight: '700' },
});

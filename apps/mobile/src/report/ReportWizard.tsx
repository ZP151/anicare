import {AppIcon} from '../components/AppIcon';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react';
import { AppState, Linking, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { SightingRisk } from '../api/sightings';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { colors, radii } from '../design/theme';
import { useNativeColors } from '../design/native-colors';
import type { Locale } from '../i18n/catalog';
import type { StoredDraft } from '../offline/draft-policy';
import { earliestIncompleteStep, reportTraits, validateReportForSubmission } from './report-flow';
import { createReportDraftPayload, sanitizeReportDraftPayload, type ReportCondition, type ReportDraftStep, type ReportPublicPlace } from './report-draft';
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

const stages: readonly ReportDraftStep[] = ['photo', 'details', 'area', 'review'];
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
  const palette = useNativeColors();
  const styles = makeStyles(palette);
  const copy = getReportCopy(locale);
  const [draft, setDraft] = useState<StoredDraft | null>(null);
  const [stage, setStage] = useState<ReportDraftStep | null>(null);
  const [furthest,setFurthest]=useState(0),[showAppearance,setShowAppearance]=useState(false),[showPlace,setShowPlace]=useState(false);
  const displayStage=(value:ReportDraftStep):ReportDraftStep=>value==='safety'?'area':value;
  const [status, setStatus] = useState<string | null>(null);
  const [manualSelectionRequested, setManualSelectionRequested] = useState(false);
  const [deviceAreaSelected, setDeviceAreaSelected] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [publicPlaceType, setPublicPlaceType] = useState<ReportPublicPlace['residenceType'] | null>(null);
  const [placeNameInput, setPlaceNameInput] = useState<string | null>(null);
  const coordinatesRef = useRef<Readonly<{ latitude: number; longitude: number }> | null>(null);
  const automaticLocationRef=useRef(false);
  const navigationInFlightRef=useRef(false);
  const finishedRef=useRef(false);
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
    void Promise.all([dependencies.loadDraft(draftId), dependencies.getSessionSubject()]).then(async ([loaded, ownerSubject]) => {
      if(active&&loaded&&!loaded.report&&typeof loaded.ownerSubject==='string'&&loaded.ownerSubject===ownerSubject&&isOpaqueReportId(loaded.sightingId)){
        if(await dependencies.getSessionSubject()!==loaded.ownerSubject||!active){if(active)setStatus(copy.wizardUnavailableCopy);return;}
        finishedRef.current=true;
        dependencies.navigate(`/report/receipt?sightingId=${loaded.sightingId}`);return;
      }
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
        if (loaded.ownerSubject === undefined &&
            (report.creatorMode !== 'anonymous' || ownerSubject !== null)) {
          setStatus(copy.wizardUnavailableCopy);
          return;
        }
        const validDraft = { ...loaded, report };
        setDraft(validDraft);
        const restored=displayStage(initialStage ?? earliestIncompleteStep(validDraft));
        setStage(restored);setFurthest(Math.max(stages.indexOf(restored),stages.indexOf(displayStage(report.step))));
        setShowAppearance(report.coat.length+report.markings.length>0);setShowPlace(!!report.publicPlace);
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
    // Visiting earlier fields never erases the furthest durable step. Legacy visibility
    // drafts map to the combined area step without losing their saved risk selection.
    const durableStage=stages[Math.max(stages.indexOf(displayStage(current.step)),stages.indexOf(displayStage(nextStage)))]!;
    const report = sanitizeReportDraftPayload({ ...current, step: durableStage, updatedAt: dependencies.now().toISOString() });
    const updated = { ...nextDraft, report };
    if(finishedRef.current||!mountedRef.current)return updated;
    await dependencies.saveDraft({ id: updated.id, notes: updated.notes, risk: updated.risk, report });
    if(finishedRef.current||!mountedRef.current)return updated;
    setDraft(updated);
    setStage(displayStage(nextStage));setFurthest(value=>Math.max(value,stages.indexOf(displayStage(nextStage))));
    return updated;
  }, [dependencies]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      // iOS permission sheets make the app inactive; only a real background invalidates GPS.
      if (nextState !== 'background'||finishedRef.current||submitInFlightRef.current) return;
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
    if (!draft || !stage || navigationInFlightRef.current || submitInFlightRef.current) return;
    navigationInFlightRef.current=true;
    try {
      await save(draft, stage === 'area' && draft.report?.condition === null ? 'details' : followingStage(stage));
      setStatus(null);
    } catch {
      setStatus(copy.wizardSaveFailed);
    } finally {navigationInFlightRef.current=false;}
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

  const selectDeviceArea = async () => {
    if (locationPromptedRef.current) return;
    clearActiveDeviceLocation();
    if (draft?.report) setDraft(current=>current?.report?{ ...current, report: { ...current.report, manualPublicCellId: null } }:current);
    const attempt = deviceAttemptRef.current;
    locationPromptedRef.current = true;
    setManualSelectionRequested(false);
    setStatus(locale === 'zh-CN' ? '正在获取当前位置…' : 'Finding your location…');
    try {
      const result = await dependencies.requestDeviceLocation();
      if (!mountedRef.current || attempt !== deviceAttemptRef.current) return;
      if (result.kind !== 'granted') {
        setManualSelectionRequested(true);
        setStatus(copy.wizardLocationDenied);
        return;
      }
      coordinatesRef.current = { latitude: result.latitude, longitude: result.longitude };
      setDeviceAreaSelected(true);
      setStatus(copy.wizardDevicePending);
    } catch {
      if (mountedRef.current && attempt === deviceAttemptRef.current) {
        setManualSelectionRequested(true);
        setStatus(locale === 'zh-CN' ? '暂时无法定位。请检查系统定位设置，或在地图上选择。' : 'Location unavailable. Check location settings or choose a place on the map.');
      }
    } finally {
      locationPromptedRef.current = false;
    }
  };

  useEffect(()=>{
    if(stage!=='area'||deviceAreaSelected||automaticLocationRef.current||!captureAvailable||!draft?.report||draft.report.areaSelectionMode==='manual_required'||draft.report.manualPublicCellId||manualSelectionRequested)return;
    automaticLocationRef.current=true;
    void selectDeviceArea();
  },[stage,draft?.id,captureAvailable]);

  const selectManualArea = (selection: { publicCellId: string }) => {
    if (!draft?.report) return;
    clearActiveDeviceLocation();
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

  const updatePublicPlace = (residenceType: ReportPublicPlace['residenceType'] | null, name: string) => {
    if (!draft?.report) return;
    setPlaceNameInput(name);
    const trimmed = name.trim();
    setDraft({ ...draft, report: sanitizeReportDraftPayload({
      ...draft.report,
      ...(residenceType && trimmed ? { publicPlace: { residenceType, name } } : { publicPlace: undefined }),
    }) });
  };

  const submit = async () => {
    if (!draft?.report || !stage || submitInFlightRef.current) return;
    submitInFlightRef.current = true;
    setSubmitting(true);
    const attempt = ++deviceAttemptRef.current;
    const attemptIsCurrent = () => mountedRef.current && deviceAttemptRef.current === attempt;
    try {
      let location: Readonly<{ kind: 'device_once'; latitude: number; longitude: number }> | Readonly<{ kind: 'manual_area'; publicCellId: string }> | null = null;
      if (deviceAreaSelected && coordinatesRef.current) {
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
      if (isOpaqueReportId(result.sightingId)) {finishedRef.current=true;dependencies.navigate(`/report/receipt?sightingId=${result.sightingId}`);}
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
    if(submitInFlightRef.current||navigationInFlightRef.current||finishedRef.current)return;
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

  if (!stage) return <ScreenScaffold compact title={copy.wizardTitle} subtitle={status ?? copy.wizardLoading}>{status?<Pressable accessibilityRole="button" onPress={dependencies.exit} style={styles.primary}><Text style={styles.primaryText}>{locale==='zh-CN'?'返回报告':'Back to Report'}</Text></Pressable>:null}</ScreenScaffold>;
  if (!draft?.report) return <ScreenScaffold title={copy.wizardUnavailableTitle} subtitle={status ?? copy.wizardUnavailableCopy} />;

  const photoReady = reviewedMediaPresent(draft);
  const manualAreaRequired = draft.report.areaSelectionMode === 'manual_required';
  const validationLocation = draft.report.manualPublicCellId
    ? { kind: 'manual_area' as const, publicCellId: draft.report.manualPublicCellId }
    : deviceAreaSelected ? { kind: 'device_once' as const, latitude: 0, longitude: 0 } : null;
  const validationDraft = stage === draft.report.step ? draft : { ...draft, report: { ...draft.report, step: stage } };
  const prerequisiteIssues = validateReportForSubmission(validationDraft, validationLocation);
  const canSubmit = prerequisiteIssues.length === 0;
  const canContinueFromArea = validationLocation !== null;
  const areaContinueLabel = draft.report.condition === null ? copy.wizardContinue : copy.wizardContinueToReview;
  const selectedPlaceType = publicPlaceType ?? draft.report.publicPlace?.residenceType ?? null;
  const publicPlaceName = placeNameInput ?? draft.report.publicPlace?.name ?? '';
  const disabledReason = prerequisiteIssues[0] === 'details_required'
    ? copy.wizardDetailsRequired
    : prerequisiteIssues[0] === 'review_required' ? copy.wizardReviewRequired : copy.wizardSubmitDisabledReason;

  const backStep=async()=>{
    if(submitInFlightRef.current||navigationInFlightRef.current)return;
    if(stage==='photo'){await saveAndExit();return;}
    navigationInFlightRef.current=true;
    try{await save(draft,stages[Math.max(0,stages.indexOf(stage)-1)]!);setStatus(null);}catch{setStatus(copy.wizardSaveFailed);}finally{navigationInFlightRef.current=false;}
  };
  const footerLabel=stage==='review'?copy.wizardSubmit:stage==='area'?areaContinueLabel:stage==='photo'&&!photoReady?copy.wizardPhotoSkip:copy.wizardContinue;
  const footerDisabled=submitting||(stage==='details'&&!draft.report.condition)||(stage==='area'&&!canContinueFromArea)||(stage==='review'&&!canSubmit);
  return (
    <ScreenScaffold compact avoidKeyboard title={copy.wizardTitle} header={<View style={{gap:4}}><View style={{flexDirection:'row',alignItems:'center'}}><Pressable accessibilityRole="button" accessibilityLabel={locale==='zh-CN'?'上一步':'Previous step'} disabled={submitting} onPress={()=>void backStep()} style={styles.back}><AppIcon name="back" size={18} color={palette.ink}/></Pressable><Text style={{flex:1,fontSize:17,fontWeight:'600',color:palette.ink}}>{copy.wizardTitle}</Text><Pressable accessibilityLabel={copy.wizardSaveAndExit} accessibilityRole="button" disabled={submitting} onPress={()=>void saveAndExit()} style={styles.exit}><Text style={styles.exitText}>{copy.wizardSaveAndExit}</Text></Pressable></View><Text style={styles.stageCounter}>{copy.wizardProgress(stages.indexOf(stage)+1,stages.length,copy.stepLabel(stage))}</Text></View>} footer={<Pressable accessibilityRole="button" accessibilityLabel={stage==='details'?copy.wizardContinueToArea:footerLabel} accessibilityState={{disabled:footerDisabled,busy:submitting}} disabled={footerDisabled} onPress={()=>void (stage==='review'?submit():advance())} style={[styles.primary,footerDisabled&&styles.disabled]}><Text style={styles.primaryText}>{submitting?(locale==='zh-CN'?'正在提交…':'Submitting…'):footerLabel}</Text></Pressable>}>
      <Text accessibilityLabel={copy.wizardStagesLabel} accessibilityRole="progressbar" accessibilityValue={{min:1,now:stages.indexOf(stage)+1,max:stages.length,text:copy.wizardProgress(stages.indexOf(stage)+1,stages.length,copy.stepLabel(stage))}} style={{height:0,overflow:'hidden'}}/>
      <View style={styles.progressTrack}>
        {stages.map((item,index)=><Pressable key={item} accessibilityRole="button" accessibilityLabel={locale==='zh-CN'?`返回${copy.stepLabel(item)}`:`Go to ${copy.stepLabel(item)}`} accessibilityState={{disabled:index>furthest||submitting,selected:item===stage}} disabled={index>furthest||submitting} onPress={()=>{if(navigationInFlightRef.current||submitInFlightRef.current)return;navigationInFlightRef.current=true;void save(draft,item).then(()=>setStatus(null)).catch(()=>setStatus(copy.wizardSaveFailed)).finally(()=>{navigationInFlightRef.current=false;});}} style={{flex:1,minHeight:44,gap:7,justifyContent:'center'}}><View style={[styles.progressSegment,index<=stages.indexOf(stage)&&styles.progressSegmentActive]}/><Text numberOfLines={1} style={{color:item===stage?palette.actionPrimary:palette.muted,fontSize:12,fontWeight:item===stage?'600':'400'}}>{item==='area'?(locale==='zh-CN'?'位置与可见性':'Location & sharing'):copy.stepLabel(item)}</Text></Pressable>)}
      </View>
      <Text accessibilityRole="header" style={styles.sectionTitle}>{stage==='area'?(locale==='zh-CN'?'位置与可见性':'Location & sharing'):copy.stepLabel(stage)}</Text>

      {stage === 'photo' ? <View style={styles.group}>
        <Pressable accessibilityLabel={photoReady ? copy.wizardPhotoReplace : copy.wizardPhotoAdd} accessibilityRole="button" onPress={() => dependencies.navigate(`/report/redaction-review?draftId=${draftId}`)} style={{minHeight:180,borderRadius:16,borderWidth:1,borderStyle:photoReady?'solid':'dashed',borderColor:palette.line,alignItems:'center',justifyContent:'center',gap:12,padding:20,backgroundColor:palette.paper}}>
          <AppIcon name={photoReady?'check':'photo'} size={32} color={palette.actionPrimary}/>
          <Text style={{color:palette.ink,fontSize:16,fontWeight:'600'}}>{photoReady?copy.wizardPhotoReady:copy.wizardPhotoAdd}</Text>
          <Text style={{color:palette.muted,fontSize:13,textAlign:'center'}}>{photoReady?(locale==='zh-CN'?'点按更换照片':'Tap to replace photo'):(locale==='zh-CN'?'选择照片并检查遮挡，也可跳过':'Choose a photo and check masking, or skip for now')}</Text>
        </Pressable>
        {photoReady?<View style={{flexDirection:'row',justifyContent:'space-between'}}><Pressable accessibilityLabel={copy.wizardPhotoRetake} accessibilityRole="button" onPress={() => dependencies.navigate(`/report/redaction-review?draftId=${draftId}`)} style={styles.editLink}><Text style={styles.editLinkText}>{locale==='zh-CN'?'重新拍摄':'Retake'}</Text></Pressable><Pressable accessibilityLabel={copy.wizardPhotoRemove} accessibilityRole="button" onPress={() => { void removePhoto(); }} style={styles.editLink}><Text style={{color:palette.danger,fontSize:14}}>{locale==='zh-CN'?'移除照片':'Remove photo'}</Text></Pressable></View>:null}
      </View> : null}

      {stage === 'details' ? <View style={styles.group}>
<View testID="report-condition" style={styles.group}><Text accessibilityRole="header" style={styles.cardTitle}>{locale==='zh-CN'?'当前状态':'Current condition'}</Text>
        {(['appears_well', 'needs_attention', 'urgent'] as const).map((condition) => <Pressable key={condition} accessibilityLabel={conditionLabels[condition]} accessibilityRole="button" accessibilityState={{ selected: draft.report!.condition === condition }} onPress={() => setCondition(condition)} style={[styles.option, draft.report!.condition === condition && styles.optionSelected]}><Text style={styles.optionText}>{conditionLabels[condition]}</Text>{draft.report!.condition === condition ? <MaterialCommunityIcons accessibilityElementsHidden color={colors.actionPrimary} name="check-circle" size={20} /> : null}</Pressable>)}
</View><Pressable accessibilityRole="button" accessibilityLabel={locale==='zh-CN'?'外观特征（选填）':'Appearance (optional)'} accessibilityState={{expanded:showAppearance}} onPress={()=>setShowAppearance(value=>!value)} style={{minHeight:52,flexDirection:'row',alignItems:'center',gap:10,borderTopWidth:0.5,borderColor:palette.line,marginTop:8}}><AppIcon name="cat" color={palette.muted} size={20}/><Text style={{flex:1,color:palette.ink,fontSize:15,fontWeight:'600'}}>{locale==='zh-CN'?'外观特征（选填）':'Appearance (optional)'}</Text><AppIcon name={showAppearance?'collapse':'plus'} color={palette.muted} size={16}/></Pressable>
        {showAppearance?        <View testID="report-appearance" style={styles.group}>
        <Text accessibilityRole="header" style={styles.traitTitle}>{copy.wizardCoatTitle}</Text>
        <View style={styles.traitGrid}>{coatValues.map((value) => <Pressable key={value} accessibilityLabel={copy.wizardCoatLabel(value)} accessibilityRole="button" accessibilityState={{ selected: draft.report!.coat.includes(value) }} onPress={() => toggleTrait('coat', value)} style={[styles.trait, draft.report!.coat.includes(value) && styles.optionSelected]}><Text style={styles.optionText}>{copy.wizardCoatLabel(value).replace(/毛色$| coat$/i,'')}</Text></Pressable>)}</View>
        <Text accessibilityRole="header" style={styles.traitTitle}>{copy.wizardMarkingsTitle}</Text>
        <View style={styles.traitGrid}>{markingValues.map((value) => <Pressable key={value} accessibilityLabel={copy.wizardMarkingLabel(value)} accessibilityRole="button" accessibilityState={{ selected: draft.report!.markings.includes(value) }} onPress={() => toggleTrait('markings', value)} style={[styles.trait, draft.report!.markings.includes(value) && styles.optionSelected]}><Text style={styles.optionText}>{copy.wizardMarkingLabel(value).replace(/特征$| marking$/i,'')}</Text></Pressable>)}</View>
        </View>:null}<TextInput accessibilityLabel={copy.wizardNotesLabel} multiline onChangeText={(notes) => setDraft({ ...draft, notes })} placeholder={copy.wizardNotesPlaceholder} placeholderTextColor={palette.muted} style={styles.notes} value={draft.notes} />
      </View> : null}

      {stage === 'area' || (stage === 'review' && !validationLocation) ? <View style={styles.group}>
        <Text style={styles.copy}>{locale==='zh-CN'?'优先使用当前位置，也可手动选择目击区域。':'Use your current location, or choose where you saw the cat.'}</Text>
        {!captureAvailable || manualAreaRequired ? <AreaPicker locale={locale} onSelect={selectManualArea} /> : <>
          <Pressable accessibilityLabel={copy.wizardDeviceLocation} accessibilityRole="button" accessibilityState={{ disabled: locationPromptedRef.current }} disabled={locationPromptedRef.current} onPress={() => { void selectDeviceArea(); }} style={styles.primary}><Text style={styles.primaryText}>{copy.wizardDeviceLocation}</Text></Pressable>
          {manualSelectionRequested ? <AreaPicker locale={locale} onSelect={selectManualArea} /> : <Pressable accessibilityLabel={copy.wizardManualArea} accessibilityRole="button" onPress={() => { clearActiveDeviceLocation(); setManualSelectionRequested(true); }} style={styles.secondary}><Text style={styles.secondaryText}>{copy.wizardManualArea}</Text></Pressable>}
        </>}
        {status?<Text accessibilityLiveRegion="polite" style={styles.status}>{status}</Text>:null}

        <Text accessibilityRole="header" style={styles.cardTitle}>{copy.stepLabel('safety')}</Text>
        {(['normal', 'sensitive', 'critical'] as const).map((risk) => <Pressable key={risk} accessibilityLabel={riskLabels[risk]} accessibilityRole="button" accessibilityState={{ selected: draft.risk === risk }} onPress={() => setDraft({ ...draft, risk })} style={[styles.option, draft.risk === risk && styles.optionSelected]}><Text style={styles.optionText}>{riskLabels[risk]}</Text>{draft.risk === risk ? <MaterialCommunityIcons accessibilityElementsHidden color={colors.actionPrimary} name="check-circle" size={20} /> : null}</Pressable>)}
        <Text style={styles.copy}>{draft.risk === 'critical' ? copy.wizardRiskCriticalConsequence : draft.risk === 'sensitive' ? copy.wizardRiskSensitiveConsequence : copy.wizardRiskNormalConsequence}</Text>
      <Pressable accessibilityRole="button" accessibilityState={{expanded:showPlace}} accessibilityLabel={locale==='zh-CN'?'补充公开地标':'Add public landmark'} onPress={()=>setShowPlace(value=>!value)} style={{minHeight:48,justifyContent:'center'}}><Text style={{color:palette.actionPrimary,fontSize:14}}>{locale==='zh-CN'?'补充公开地标（选填）':'Add public landmark (optional)'}</Text></Pressable>
        {showPlace?<View style={styles.group}>
          <Text style={styles.traitTitle}>{locale === 'zh-CN' ? '公开建筑或项目（可选）' : 'Public building or project (optional)'}</Text>
          <Text style={styles.copy}>{locale === 'zh-CN' ? '选填；此名称会公开显示。' : 'Optional. This name will be public.'}</Text>
          <View style={styles.traitGrid}>{(['hdb', 'condo', 'other'] as const).map((type) => <Pressable key={type} accessibilityRole="button" accessibilityLabel={type === 'hdb' ? 'HDB' : type === 'condo' ? (locale === 'zh-CN' ? '公寓' : 'Condominium') : (locale === 'zh-CN' ? '其他' : 'Other')} accessibilityState={{ selected: selectedPlaceType === type }} onPress={() => { setPublicPlaceType(type); updatePublicPlace(type, publicPlaceName); }} style={[styles.trait, selectedPlaceType === type && styles.optionSelected]}><Text style={styles.optionText}>{type === 'hdb' ? 'HDB' : type === 'condo' ? (locale === 'zh-CN' ? '公寓' : 'Condominium') : (locale === 'zh-CN' ? '其他' : 'Other')}</Text></Pressable>)}</View>
          <TextInput accessibilityLabel={locale === 'zh-CN' ? '建筑或项目名称' : 'Building or project name'} value={publicPlaceName} maxLength={100} onChangeText={(name) => updatePublicPlace(selectedPlaceType, name)} placeholder={locale === 'zh-CN' ? '例如：大牌 123 或项目名称' : 'For example, Block 123 or project name'} placeholderTextColor={palette.muted} style={styles.input} />
        </View>:null}
      </View> : null}

      {stage === 'review' ? <View style={styles.group}>
        <Text style={styles.copy}>{copy.wizardReviewIntro}</Text>
        <View style={[styles.card,styles.reviewSummary]}>
          <Text style={styles.summaryItem}>{photoReady ? copy.wizardPhotoReady : copy.wizardPhotoSkip}</Text>
          {draft.report.condition ? <Text style={styles.summaryItem}>{conditionLabels[draft.report.condition]}</Text> : null}
          {draft.report.coat.length||draft.report.markings.length?<Text style={styles.copy}>{[...draft.report.coat.map(value=>copy.wizardCoatLabel(value).replace(/毛色$| coat$/i,'')),...draft.report.markings.map(value=>copy.wizardMarkingLabel(value).replace(/特征$| marking$/i,''))].join(' · ')}</Text>:null}
          {draft.notes?<Text style={styles.copy}>{draft.notes}</Text>:null}
          <Text style={styles.summaryItem}>{riskLabels[draft.risk]}</Text>
          <Text style={styles.summaryItem}>{draft.report.manualPublicCellId ? copy.wizardManualSelected : copy.wizardDevicePending}</Text>
          {draft.report.publicPlace ? <Text style={styles.summaryItem}>{draft.report.publicPlace.name}</Text> : null}
        </View>
        <View style={styles.reviewLinks}>
          {(['photo', 'details', 'area'] as const).map((item) => {
            const label = locale === 'en' ? copy.stepLabel(item).toLowerCase() : copy.stepLabel(item);
            return <Pressable key={item} accessibilityLabel={copy.wizardEdit(label)} accessibilityRole="button" onPress={() => setStage(item)} style={styles.editLink}><Text style={styles.editLinkText}>{copy.wizardEdit(label)}</Text></Pressable>;
          })}
        </View>
        {!canSubmit ? <Text style={styles.disabledReason}>{disabledReason}</Text> : null}
      </View> : null}
      {status === copy.wizardLocationDenied ? <Pressable accessibilityRole="button" onPress={() => { void Linking.openSettings(); }} style={styles.secondary}><Text style={styles.secondaryText}>{locale === 'zh-CN' ? '打开定位设置' : 'Open location settings'}</Text></Pressable> : null}
      {status&&stage!=='area'&&!(stage==='review'&&!validationLocation) ? <Text accessibilityLiveRegion="polite" style={styles.status}>{status}</Text> : null}
    </ScreenScaffold>
  );
}

const makeStyles = (colors: ReturnType<typeof useNativeColors>) => StyleSheet.create({
  back:{width:44,height:44,justifyContent:'center'},card:{padding:12,gap:10,borderRadius:16,backgroundColor:colors.surface},cardTitle:{fontSize:16,fontWeight:'600',color:colors.ink},
  exit: { minHeight: Platform.OS === 'android' ? 48 : 44, justifyContent: 'center', paddingHorizontal: 6 },
  exitText: { color: colors.actionPrimary, fontWeight: '700' },
  progressTrack: { flexDirection: 'row', gap: 8 },
  progressSegment: { height: 4, borderRadius: 3, backgroundColor: colors.line },
  progressSegmentActive: { backgroundColor: colors.actionPrimary },
  stageCounter: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  sectionTitle: { color: colors.ink, fontSize: 19, lineHeight: 25, fontWeight: '600' },
  group: { gap: 16 },
  copy: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  primary: { minHeight: 50, paddingHorizontal: 16, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.actionPrimary },
  primaryText: { color: colors.onAction, fontSize: 15, fontWeight: '600' },
  disabled: { opacity: 0.45 },
  secondary: { minHeight: 48, paddingHorizontal: 16, borderRadius: radii.small, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.actionPrimary },
  secondaryText: { color: colors.actionPrimary, fontSize: 15, fontWeight: '600' },
  option: { minHeight: 48, paddingHorizontal: 16, borderRadius: radii.small, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  optionSelected: { borderColor: colors.actionPrimary, borderWidth: 2 },
  optionText: { color: colors.ink, fontSize: 14, textTransform: 'capitalize' },
  traitTitle: { color: colors.ink, fontSize: 16, lineHeight: 22, fontWeight: '600' },
  traitGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  trait: { minHeight: 44, paddingHorizontal: 12, borderRadius: radii.small, justifyContent: 'center', borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  placeGroup: { gap: 10, paddingTop: 8 },
  notes: { minHeight: 96, padding: 14, borderRadius: radii.small, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, color: colors.ink, textAlignVertical: 'top' },
  input: { minHeight: 48, paddingHorizontal: 14, borderRadius: radii.small, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, color: colors.ink },
  status: { color: colors.muted, fontSize: 15, lineHeight: 21 },
  disabledReason: { color: colors.muted, fontSize: 15, lineHeight: 21 },
  reviewLinks: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  reviewSummary: { gap: 4, paddingVertical: 4 },
  summaryItem: { color: colors.ink, fontSize: 15, lineHeight: 21, fontWeight: '700' },
  editLink: { minHeight: Platform.OS === 'android' ? 48 : 44, justifyContent: 'center', paddingHorizontal: 10, borderRadius: radii.small, borderWidth: 1, borderColor: colors.line },
  editLinkText: { color: colors.actionPrimary, fontSize: 15, fontWeight: '700' },
});

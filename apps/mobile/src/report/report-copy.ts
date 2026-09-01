import { translate, type Locale } from '../i18n/catalog';

export type ReportCopy = Readonly<{
  title: string;
  subtitle: string;
  startAction: string;
  draftsTitle: string;
  loading: string;
  emptyTitle: string;
  emptyCopy: string;
  storageUnavailable: string;
  storageUnavailableTitle: string;
  loadFailed: string;
  retryAction: string;
  myReports: string;
  signedOutExplanation: string;
  profileAction: string;
  startFailed: string;
  deleteFailed: string;
  continueDraftLabel: (step: string) => string;
  deleteDraftLabel: (step: string) => string;
  stepLabel: (step: string) => string;
  deleteAction: string;
  draftShellTitle: string;
  draftShellReadyTitle: string;
  draftShellReadyCopy: string;
  receiptShellTitle: string;
  receiptShellCopy: string;
  historyShellTitle: string;
  historyShellCopy: string;
  routeUnavailableTitle: string;
  invalidDraftId: string;
  invalidReceiptId: string;
  backToReportAction: string;
  receiptTitle: string;
  receiptSubtitle: string;
  receiptLoading: string;
  receiptReceived: string;
  receiptUnavailable: string;
  receiptRemoteUnavailable: string;
  viewReportsAction: string;
  browseNearbyAction: string;
  reportStateLabel: (state: 'draft' | 'private_review' | 'delayed' | 'published' | 'archived') => string;
  mediaStateLabel: (state: 'none' | 'pending' | 'quarantined' | 'cleanup_pending' | 'removed' | 'needs_user') => string;
  identityStateLabel: (state: 'not_requested' | 'pending_review' | 'linked' | 'closed') => string;
  historyTitle: string;
  historySubtitle: string;
  historyLoading: string;
  historyEmptyTitle: string;
  historyEmptyCopy: string;
  loadMoreReports: string;
  refreshReports: string;
  offlineSnapshot: string;
  offlineEmpty: string;
  invalidHistory: string;
  historySignIn: string;
  wizardTitle: string;
  wizardLoading: string;
  wizardUnavailableTitle: string;
  wizardUnavailableCopy: string;
  wizardSaveAndExit: string;
  wizardProgress: (current: number, total: number, step: string) => string;
  wizardStagesLabel: string;
  wizardSaveFailed: string;
  wizardPhotoReady: string;
  wizardPhotoIntro: string;
  wizardPhotoAdd: string;
  wizardPhotoReplace: string;
  wizardPhotoRemove: string;
  wizardPhotoSkip: string;
  wizardPhotoRemoved: string;
  wizardPhotoRemoveFailed: string;
  wizardDetailsIntro: string;
  wizardConditionWell: string;
  wizardConditionNeedsAttention: string;
  wizardConditionUrgent: string;
  wizardNotesLabel: string;
  wizardNotesPlaceholder: string;
  wizardContinue: string;
  wizardContinueToSafety: string;
  wizardSafetyIntro: string;
  wizardRiskNormal: string;
  wizardRiskSensitive: string;
  wizardRiskCritical: string;
  wizardRiskNormalConsequence: string;
  wizardRiskSensitiveConsequence: string;
  wizardRiskCriticalConsequence: string;
  wizardContinueToArea: string;
  wizardAreaIntro: string;
  wizardDeviceLocation: string;
  wizardManualArea: string;
  wizardContinueToReview: string;
  wizardDevicePending: string;
  wizardManualSelected: string;
  wizardLocationDenied: string;
  wizardAreaRequired: string;
  wizardRecovery: string;
  wizardReviewIntro: string;
  wizardEdit: (step: string) => string;
  wizardSubmitDisabledReason: string;
  wizardSubmit: string;
  wizardAreaMapLabel: string;
  wizardAreaMapInstruction: string;
  wizardWebAreaLabel: string;
  wizardWebAreaUnavailable: string;
  wizardWebDeviceLocation: string;
  wizardWebManualArea: string;
}>;

export function getReportCopy(locale: Locale): ReportCopy {
  const stepLabel = (step: string) => translate(locale, `report.hub.step.${step}` as never);
  return {
    title: translate(locale, 'report.hub.title'),
    subtitle: translate(locale, 'report.hub.subtitle'),
    startAction: translate(locale, 'report.hub.startAction'),
    draftsTitle: translate(locale, 'report.hub.draftsTitle'),
    loading: translate(locale, 'report.hub.loading'),
    emptyTitle: translate(locale, 'report.hub.emptyTitle'),
    emptyCopy: translate(locale, 'report.hub.emptyCopy'),
    storageUnavailable: translate(locale, 'report.hub.storageUnavailable'),
    storageUnavailableTitle: translate(locale, 'report.hub.storageUnavailableTitle'),
    loadFailed: translate(locale, 'report.hub.loadFailed'),
    retryAction: translate(locale, 'report.hub.retryAction'),
    myReports: translate(locale, 'report.hub.myReports'),
    signedOutExplanation: translate(locale, 'report.hub.signedOutExplanation'),
    profileAction: translate(locale, 'report.hub.profileAction'),
    startFailed: translate(locale, 'report.hub.startFailed'),
    deleteFailed: translate(locale, 'report.hub.deleteFailed'),
    continueDraftLabel: (step) => translate(locale, 'report.hub.continueDraftLabel' as never).replace('{step}', stepLabel(step).toLowerCase()),
    deleteDraftLabel: (step) => translate(locale, 'report.hub.deleteDraftLabel' as never).replace('{step}', stepLabel(step).toLowerCase()),
    stepLabel,
    deleteAction: translate(locale, 'report.hub.deleteAction'),
    draftShellTitle: translate(locale, 'report.shell.draftTitle'),
    draftShellReadyTitle: translate(locale, 'report.shell.draftReadyTitle'),
    draftShellReadyCopy: translate(locale, 'report.shell.draftReadyCopy'),
    receiptShellTitle: translate(locale, 'report.shell.receiptTitle'),
    receiptShellCopy: translate(locale, 'report.shell.receiptCopy'),
    historyShellTitle: translate(locale, 'report.shell.historyTitle'),
    historyShellCopy: translate(locale, 'report.shell.historyCopy'),
    routeUnavailableTitle: translate(locale, 'report.shell.unavailableTitle'),
    invalidDraftId: translate(locale, 'report.shell.invalidDraftId'),
    invalidReceiptId: translate(locale, 'report.shell.invalidReceiptId'),
    backToReportAction: translate(locale, 'report.shell.backAction'),
    receiptTitle: translate(locale, 'report.receipt.title'),
    receiptSubtitle: translate(locale, 'report.receipt.subtitle'),
    receiptLoading: translate(locale, 'report.receipt.loading'),
    receiptReceived: translate(locale, 'report.receipt.received'),
    receiptUnavailable: translate(locale, 'report.receipt.unavailable'),
    receiptRemoteUnavailable: translate(locale, 'report.receipt.remoteUnavailable'),
    viewReportsAction: translate(locale, 'report.receipt.viewReports'),
    browseNearbyAction: translate(locale, 'report.receipt.nearby'),
    reportStateLabel: (state) => translate(locale, `report.receipt.reportState.${state === 'private_review' ? 'privateReview' : state}` as never),
    mediaStateLabel: (state) => translate(locale, `report.receipt.mediaState.${state === 'cleanup_pending' ? 'cleanupPending' : state === 'needs_user' ? 'needsUser' : state}` as never),
    identityStateLabel: (state) => translate(locale, `report.receipt.identityState.${state === 'not_requested' ? 'notRequested' : state === 'pending_review' ? 'pendingReview' : state}` as never),
    historyTitle: translate(locale, 'report.history.title'),
    historySubtitle: translate(locale, 'report.history.subtitle'),
    historyLoading: translate(locale, 'report.history.loading'),
    historyEmptyTitle: translate(locale, 'report.history.emptyTitle'),
    historyEmptyCopy: translate(locale, 'report.history.emptyCopy'),
    loadMoreReports: translate(locale, 'report.history.loadMore'),
    refreshReports: translate(locale, 'report.history.refresh'),
    offlineSnapshot: translate(locale, 'report.history.offlineSnapshot'),
    offlineEmpty: translate(locale, 'report.history.offlineEmpty'),
    invalidHistory: translate(locale, 'report.history.invalid'),
    historySignIn: translate(locale, 'report.history.signIn'),
    wizardTitle: translate(locale, 'report.wizard.title'),
    wizardLoading: translate(locale, 'report.wizard.loading'),
    wizardUnavailableTitle: translate(locale, 'report.wizard.unavailableTitle'),
    wizardUnavailableCopy: translate(locale, 'report.wizard.unavailableCopy'),
    wizardSaveAndExit: translate(locale, 'report.wizard.saveAndExit'),
    wizardProgress: (current, total, step) => translate(locale, 'report.wizard.progress').replace('{current}', String(current)).replace('{total}', String(total)).replace('{step}', step),
    wizardStagesLabel: translate(locale, 'report.wizard.stagesLabel'),
    wizardSaveFailed: translate(locale, 'report.wizard.saveFailed'),
    wizardPhotoReady: translate(locale, 'report.wizard.photoReady'),
    wizardPhotoIntro: translate(locale, 'report.wizard.photoIntro'),
    wizardPhotoAdd: translate(locale, 'report.wizard.photoAdd'),
    wizardPhotoReplace: translate(locale, 'report.wizard.photoReplace'),
    wizardPhotoRemove: translate(locale, 'report.wizard.photoRemove'),
    wizardPhotoSkip: translate(locale, 'report.wizard.photoSkip'),
    wizardPhotoRemoved: translate(locale, 'report.wizard.photoRemoved'),
    wizardPhotoRemoveFailed: translate(locale, 'report.wizard.photoRemoveFailed'),
    wizardDetailsIntro: translate(locale, 'report.wizard.detailsIntro'),
    wizardConditionWell: translate(locale, 'report.wizard.conditionWell'),
    wizardConditionNeedsAttention: translate(locale, 'report.wizard.conditionNeedsAttention'),
    wizardConditionUrgent: translate(locale, 'report.wizard.conditionUrgent'),
    wizardNotesLabel: translate(locale, 'report.wizard.notesLabel'),
    wizardNotesPlaceholder: translate(locale, 'report.wizard.notesPlaceholder'),
    wizardContinue: translate(locale, 'report.wizard.continue'),
    wizardContinueToSafety: translate(locale, 'report.wizard.continueToSafety'),
    wizardSafetyIntro: translate(locale, 'report.wizard.safetyIntro'),
    wizardRiskNormal: translate(locale, 'report.wizard.riskNormal'),
    wizardRiskSensitive: translate(locale, 'report.wizard.riskSensitive'),
    wizardRiskCritical: translate(locale, 'report.wizard.riskCritical'),
    wizardRiskNormalConsequence: translate(locale, 'report.wizard.riskNormalConsequence'),
    wizardRiskSensitiveConsequence: translate(locale, 'report.wizard.riskSensitiveConsequence'),
    wizardRiskCriticalConsequence: translate(locale, 'report.wizard.riskCriticalConsequence'),
    wizardContinueToArea: translate(locale, 'report.wizard.continueToArea'),
    wizardAreaIntro: translate(locale, 'report.wizard.areaIntro'),
    wizardDeviceLocation: translate(locale, 'report.wizard.deviceLocation'),
    wizardManualArea: translate(locale, 'report.wizard.manualArea'),
    wizardContinueToReview: translate(locale, 'report.wizard.continueToReview'),
    wizardDevicePending: translate(locale, 'report.wizard.devicePending'),
    wizardManualSelected: translate(locale, 'report.wizard.manualSelected'),
    wizardLocationDenied: translate(locale, 'report.wizard.locationDenied'),
    wizardAreaRequired: translate(locale, 'report.wizard.areaRequired'),
    wizardRecovery: translate(locale, 'report.wizard.recovery'),
    wizardReviewIntro: translate(locale, 'report.wizard.reviewIntro'),
    wizardEdit: (step) => translate(locale, 'report.wizard.edit').replace('{step}', step),
    wizardSubmitDisabledReason: translate(locale, 'report.wizard.submitDisabledReason'),
    wizardSubmit: translate(locale, 'report.wizard.submit'),
    wizardAreaMapLabel: translate(locale, 'report.wizard.areaMapLabel'),
    wizardAreaMapInstruction: translate(locale, 'report.wizard.areaMapInstruction'),
    wizardWebAreaLabel: translate(locale, 'report.wizard.webAreaLabel'),
    wizardWebAreaUnavailable: translate(locale, 'report.wizard.webAreaUnavailable'),
    wizardWebDeviceLocation: translate(locale, 'report.wizard.webDeviceLocation'),
    wizardWebManualArea: translate(locale, 'report.wizard.webManualArea'),
  };
}

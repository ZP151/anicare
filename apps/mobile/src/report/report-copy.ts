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
  wizardTitle: string;
  wizardLoading: string;
  wizardUnavailableTitle: string;
  wizardUnavailableCopy: string;
  wizardSaveAndExit: string;
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
    wizardTitle: translate(locale, 'report.wizard.title'),
    wizardLoading: translate(locale, 'report.wizard.loading'),
    wizardUnavailableTitle: translate(locale, 'report.wizard.unavailableTitle'),
    wizardUnavailableCopy: translate(locale, 'report.wizard.unavailableCopy'),
    wizardSaveAndExit: translate(locale, 'report.wizard.saveAndExit'),
  };
}

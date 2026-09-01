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
  };
}

import type { ComponentType } from 'react';
import type { Locale } from '../i18n/catalog';

export type ReportAreaSelection = Readonly<{ publicCellId: string }>;

export const ReportAreaPicker: ComponentType<Readonly<{
  locale?: Locale;
  googleMapsConfigured?: boolean;
  onSelect(selection: ReportAreaSelection): void;
}>>;

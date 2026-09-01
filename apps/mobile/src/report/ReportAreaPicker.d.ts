import type { ComponentType } from 'react';

export type ReportAreaSelection = Readonly<{ publicCellId: string }>;

export const ReportAreaPicker: ComponentType<Readonly<{
  onSelect(selection: ReportAreaSelection): void;
}>>;

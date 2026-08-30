const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ReportContext = Readonly<{
  animalId: string;
  label: string;
}>;

export function getReportContext(value: string | string[] | undefined): ReportContext | null {
  if (typeof value !== 'string' || !UUID.test(value)) return null;
  return { animalId: value, label: 'Linked to the selected community cat' };
}

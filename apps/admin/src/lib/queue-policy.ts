export type QueueRisk = 'normal' | 'sensitive' | 'critical';

export interface ModerationQueueItem {
  id: string;
  risk: QueueRisk;
  status: string;
  dueAt: string;
}

export function getModerationDueAt(risk: QueueRisk, createdAt: string): string {
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) throw new Error('Invalid createdAt');
  const hours = risk === 'critical' ? 24 : 72;
  return new Date(created.getTime() + hours * 3_600_000).toISOString();
}

export function buildReviewQueue(
  items: readonly ModerationQueueItem[],
  now: Date,
): Array<ModerationQueueItem & { overdue: boolean }> {
  const priority: Record<QueueRisk, number> = { critical: 0, sensitive: 1, normal: 2 };
  return [...items]
    .sort((left, right) => {
      const riskDifference = priority[left.risk] - priority[right.risk];
      return riskDifference === 0
        ? Date.parse(left.dueAt) - Date.parse(right.dueAt)
        : riskDifference;
    })
    .map((item) => ({ ...item, overdue: Date.parse(item.dueAt) < now.getTime() }));
}


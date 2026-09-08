import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { PublicSighting, PublicSightingPage } from '../api/feed';
import type { StoredDraft } from '../offline/draft-policy';
import type { ReportIdentityIntent } from './report-draft';
import { colors, radii } from '../design/theme';

export type IdentityContinuationDependencies = Readonly<{
  listPublicSightings(input: Readonly<{ cursor?: string | null; limit?: number }>): Promise<PublicSightingPage>;
  isOwner(): Promise<boolean>;
  saveIntent(intent: Exclude<ReportIdentityIntent, null>): Promise<Readonly<{ intent: Exclude<ReportIdentityIntent, null>; requestId: string }>>;
  submit(sightingId: string, intent: Exclude<ReportIdentityIntent, null>, requestId: string): Promise<Readonly<{ status: string }>>;
}>;

export function IdentityContinuation({ sightingId, draft, dependencies, locale, onResolved, onSkip }: Readonly<{
  sightingId: string; draft: StoredDraft | null; dependencies: IdentityContinuationDependencies; locale: 'en' | 'zh-CN';
  onResolved?(status: string): void;
  onSkip?(): void;
}>) {
  const [candidates, setCandidates] = useState<readonly PublicSighting[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [saved, setSaved] = useState<StoredDraft['identityContinuation']>();
  const mounted = useRef(true);
  const inFlight = useRef(false);
  const attempt = useRef(0);
  const existing = saved ?? draft?.identityContinuation;
  const copy = locale === 'zh-CN'
    ? { title: '身份待续办', intro: '请选择已有猫、新猫，或暂不选择。此选择会交由独立审核，不会自动关联档案。', new: '作为新猫提交', skip: '暂不选择', retry: '重试身份提案', more: '显示更多公开档案', failed: '身份提案尚未提交，报告已安全保存。', pending: '身份提案正在等待独立审核。', closed: '该身份提案已结束。' }
    : { title: 'Identity continuation', intro: 'Choose an existing cat, a new cat, or skip for now. This is reviewed independently and never links a profile automatically.', new: 'Submit as a new cat', skip: 'Skip for now', retry: 'Retry identity proposal', more: 'Show more public profiles', failed: 'The identity proposal is still pending. Your report is safely saved.', pending: 'The identity proposal is awaiting independent review.', closed: 'This identity proposal is closed.' };

  useEffect(() => {
    let active = true;
    void dependencies.listPublicSightings({ limit: 20 }).then((page) => {
      if (!active) return;
      setCandidates([...new Map(page.items.map((item) => [item.animalId, item])).values()]);
      setCursor(page.nextCursor);
    }).catch(() => { if (active) setMessage(copy.failed); });
    return () => { active = false; };
  }, [dependencies, copy.failed]);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  async function submit(intent: Exclude<ReportIdentityIntent, null>, requestId?: string) {
    if (inFlight.current || !mounted.current) return;
    inFlight.current = true;
    const currentAttempt = ++attempt.current;
    setBusy(true); setMessage(null);
    try {
      if (!await dependencies.isOwner() || !mounted.current) return;
      const stable = requestId ? { intent, requestId } : await dependencies.saveIntent(intent);
      if (!mounted.current || currentAttempt !== attempt.current || !await dependencies.isOwner()) return;
      if (!requestId) setSaved({ intent: stable.intent, requestId: stable.requestId });
      const result = await dependencies.submit(sightingId, stable.intent, stable.requestId);
      if (mounted.current && currentAttempt === attempt.current && await dependencies.isOwner()) {
        setMessage(result.status === 'tentative' ? copy.pending : copy.closed);
        onResolved?.(result.status);
      }
    } catch { if (mounted.current && currentAttempt === attempt.current && await dependencies.isOwner().catch(() => false)) setMessage(copy.failed); }
    finally { inFlight.current = false; if (mounted.current && currentAttempt === attempt.current) setBusy(false); }
  }

  async function more() {
    if (!cursor || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const page = await dependencies.listPublicSightings({ cursor, limit: 20 });
      if (!mounted.current || !await dependencies.isOwner()) return;
      setCandidates((current) => [...new Map([...current, ...page.items].map((item) => [item.animalId, item])).values()]);
      setCursor(page.nextCursor);
    } catch { if (mounted.current) setMessage(copy.failed); } finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  }

  return <View style={styles.panel}>
    <Text accessibilityRole="header" style={styles.title}>{copy.title}</Text>
    <Text style={styles.copy}>{copy.intro}</Text>
    {existing ? <Pressable accessibilityRole="button" accessibilityLabel={copy.retry} disabled={busy} onPress={() => { void submit(existing.intent, existing.requestId); }} style={styles.primary}><Text style={styles.primaryText}>{copy.retry}</Text></Pressable> : <>
      {candidates.map((candidate) => <Pressable key={candidate.animalId} accessibilityRole="button" accessibilityLabel={candidate.primaryAlias} disabled={busy} onPress={() => { void submit({ kind: 'existing', animalId: candidate.animalId }); }} style={styles.option}><Text style={styles.optionText}>{candidate.primaryAlias}</Text></Pressable>)}
      {cursor ? <Pressable accessibilityRole="button" accessibilityLabel={copy.more} disabled={busy} onPress={() => { void more(); }} style={styles.option}><Text style={styles.optionText}>{copy.more}</Text></Pressable> : null}
      <Pressable accessibilityRole="button" accessibilityLabel={copy.new} disabled={busy} onPress={() => { void submit({ kind: 'new' }); }} style={styles.primary}><Text style={styles.primaryText}>{copy.new}</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={copy.skip} disabled={busy} onPress={onSkip} style={styles.option}><Text style={styles.optionText}>{copy.skip}</Text></Pressable>
    </>}
    {message ? <Text accessibilityLiveRegion="polite" style={styles.message}>{message}</Text> : null}
  </View>;
}

const styles = StyleSheet.create({
  panel: { gap: 10, padding: 14, borderRadius: radii.small, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  title: { color: colors.ink, fontSize: 17, lineHeight: 23, fontWeight: '800' }, copy: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  primary: { minHeight: 48, borderRadius: radii.small, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.actionPrimary }, primaryText: { color: colors.surface, fontSize: 15, fontWeight: '800' },
  option: { minHeight: 46, borderRadius: radii.small, paddingHorizontal: 12, justifyContent: 'center', borderWidth: 1, borderColor: colors.line }, optionText: { color: colors.actionPrimary, fontSize: 15, fontWeight: '700' }, message: { color: colors.muted, fontSize: 14, lineHeight: 20 },
});

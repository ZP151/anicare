import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { CARE_ACTIVITIES, CARE_AREAS, type CareActivity, type CareInput, type MyCareEvent } from '../api/care';
import { colors, radii } from '../design/theme';
import type { Locale } from '../i18n/catalog';

export function careActivityLabel(locale: Locale, value: CareActivity): string {
  return locale === 'zh-CN' ? { feed: '喂食', water: '换水', cleanup: '清洁', observe: '观察', companionship: '陪伴' }[value]
    : value[0]!.toUpperCase() + value.slice(1);
}
function localParts(value: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return { day: `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`, time: `${pad(value.getHours())}:${pad(value.getMinutes())}` };
}
function completedAt(day: string, time: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{2}:\d{2}$/.test(time)) throw new Error('invalid_time');
  const value = new Date(`${day}T${time}:00`);
  const parts = localParts(value);
  if (parts.day !== day || parts.time !== time || !Number.isFinite(value.getTime()) || value.getTime() > Date.now() || value.getTime() < Date.now() - 30 * 86400000) throw new Error('invalid_time');
  return value.toISOString();
}
type Props = Readonly<{
  animalId: string; locale: Locale; signedIn: boolean; initial?: MyCareEvent;
  onSubmit(input: CareInput): Promise<void>; createId(): string;
}>;
export function CareEntry({ animalId, locale, signedIn, initial, onSubmit, createId }: Props) {
  const cn = locale === 'zh-CN';
  const [selected, setSelected] = useState<CareActivity | null>(initial?.activity ?? null);
  const [area, setArea] = useState<string | null>(initial?.publicCellId ?? null);
  const [parts, setParts] = useState(() => localParts(initial ? new Date(initial.completedAt) : new Date()));
  const [pending, setPending] = useState<CareInput | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  async function submit() {
    if (!signedIn || !selected || !area || inFlight.current) return;
    let stable: CareInput;
    try { stable = pending ?? { animalId, activity: selected, completedAt: completedAt(parts.day, parts.time), publicCell: area, requestId: createId() }; }
    catch { setError(cn ? '请填写过去 30 天内的有效完成日期和时间。' : 'Enter a valid completed date and time within the last 30 days.'); return; }
    inFlight.current = true; setPending(stable); setSending(true); setError(null);
    try { await onSubmit(stable); setPending(null); setSelected(null); setArea(null); }
    catch { setError(cn ? '未能确认保存结果。输入已保留，请重试同一笔记录。' : 'We could not confirm the save. Your input is retained; retry the same record.'); }
    finally { inFlight.current = false; setSending(false); }
  }
  const frozen = sending || pending !== null;
  return <View style={styles.box}>
    <Text style={styles.title}>{initial ? (cn ? '更正完成记录' : 'Correct completed care') : (cn ? '记录已完成的照护' : 'Record completed care')}</Text>
    <Text style={styles.note}>{cn ? '仅支持下方三个手选区域；请记录实际完成的照护，不是预约或求助。' : 'Choose one of the three supported areas. Record care already completed, not a booking or request for help.'}</Text>
    {!signedIn ? <Text>{cn ? '登录并确认成年后可记录照护。' : 'Sign in and confirm you are 18 or older to record care.'}</Text> : <>
      <View style={styles.wrap}>{CARE_ACTIVITIES.map(item => <Pressable key={item} accessibilityRole="button" disabled={frozen} accessibilityState={{ selected: selected === item, disabled: frozen }} onPress={() => setSelected(item)} style={[styles.choice, selected === item && styles.selected]}><Text>{careActivityLabel(locale, item)}</Text></Pressable>)}</View>
      <Text style={styles.label}>{cn ? '本次照护的大致区域' : 'Area of this care activity'}</Text>
      <View style={styles.wrap}>{CARE_AREAS.map(item => <Pressable key={item.cell} accessibilityRole="button" disabled={frozen} accessibilityState={{ selected: area === item.cell, disabled: frozen }} onPress={() => setArea(item.cell)} style={[styles.choice, area === item.cell && styles.selected]}><Text>{cn ? item.zh : item.en}</Text></Pressable>)}</View>
      <Text style={styles.label}>{cn ? '完成日期与时间（设备当地时间）' : 'Completed date and time (device local time)'}</Text>
      <TextInput accessibilityLabel={cn ? '完成日期' : 'Completed date'} value={parts.day} placeholder="YYYY-MM-DD" editable={!frozen} onChangeText={day => setParts(value => ({ ...value, day }))} style={styles.input} />
      <TextInput accessibilityLabel={cn ? '完成时间' : 'Completed time'} value={parts.time} placeholder="HH:mm" editable={!frozen} onChangeText={time => setParts(value => ({ ...value, time }))} style={styles.input} />
      <Pressable accessibilityRole="button" disabled={!selected || !area || sending} onPress={() => { void submit(); }} style={[styles.submit, (!selected || !area || sending) && styles.disabled]}><Text style={styles.submitText}>{pending ? (cn ? '重试' : 'Retry') : initial ? (cn ? '保存更正' : 'Save correction') : (cn ? '记录已完成的照护' : 'Record completed care')}</Text></Pressable>
      {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
    </>}
  </View>;
}
export const careStyles = StyleSheet.create({
  box: { gap: 12, padding: 18, borderRadius: radii.medium, backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1 },
  title: { fontSize: 20, fontWeight: '800', color: colors.mineral }, note: { fontSize: 14, lineHeight: 21, color: colors.muted },
  label: { fontSize: 14, fontWeight: '700', color: colors.mineral }, wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { minHeight: 48, paddingHorizontal: 13, justifyContent: 'center', borderWidth: 1, borderColor: colors.line, borderRadius: 24 },
  selected: { borderColor: colors.community, backgroundColor: colors.aquaSoft },
  input: { minHeight: 48, padding: 12, borderColor: colors.line, borderWidth: 1, borderRadius: radii.small, color: colors.ink },
  submit: { minHeight: 52, justifyContent: 'center', alignItems: 'center', borderRadius: 26, backgroundColor: colors.community },
  disabled: { opacity: .45 }, submitText: { fontSize: 16, fontWeight: '800', color: colors.surface },
  error: { color: colors.danger, fontSize: 14, lineHeight: 21 },
});
const styles = careStyles;

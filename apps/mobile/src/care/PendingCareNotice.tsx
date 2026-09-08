import { Pressable, Text, View } from 'react-native';
import type { Locale } from '../i18n/catalog';
import { useCareStyles } from './CareEntry';
export function PendingCareNotice({ locale, busy, failed, retry, stop }: Readonly<{ locale: Locale; busy: boolean; failed: boolean; retry(): void; stop(): void }>) {
  const styles = useCareStyles();
  const cn = locale === 'zh-CN';
  return <View style={styles.box}>
    <Text style={styles.note}>{cn ? '有一笔照护操作等待确认。重试会使用同一笔请求。' : 'A care operation is awaiting confirmation. Retrying uses the same request.'}</Text>
    {failed ? <Text accessibilityLiveRegion="polite" style={styles.error}>{cn ? '未能确认保存结果，请重试。' : 'We could not confirm the result. Please retry.'}</Text> : null}
    <Pressable accessibilityRole="button" disabled={busy} onPress={retry} style={styles.choice}><Text>{cn ? '重试待确认照护' : 'Retry pending care'}</Text></Pressable>
    <Text style={styles.note}>{cn ? '若无法继续，请先查看“我的照护记录”。停止重试不会撤销可能已保存的记录。' : 'If you cannot continue, check My care records first. Stopping retries does not undo a record that may already be saved.'}</Text>
    <Pressable accessibilityRole="button" disabled={busy} onPress={stop} style={styles.choice}><Text>{cn ? '停止重试' : 'Stop retrying'}</Text></Pressable>
  </View>;
}

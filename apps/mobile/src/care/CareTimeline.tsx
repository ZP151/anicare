import { Pressable, Text, View } from 'react-native';
import { CARE_AREAS, type MyCareEvent, type PublicCareEvent } from '../api/care';
import type { Locale } from '../i18n/catalog';
import { careActivityLabel, careStyles as styles } from './CareEntry';

type Props = Readonly<{
  locale: Locale; items: readonly (MyCareEvent | PublicCareEvent)[]; loading: boolean; failed: boolean;
  hasMore: boolean; refresh(): void; more(): void; busy?: boolean;
  withdraw?(event: MyCareEvent): void; correct?(event: MyCareEvent): void;
}>;
export function CareTimeline({ locale, items, loading, failed, hasMore, refresh, more, busy, withdraw, correct }: Props) {
  const cn = locale === 'zh-CN';
  return <View style={{ gap: 12 }}>
    {loading ? <Text accessibilityLiveRegion="polite" style={styles.note}>{cn ? '正在读取照护记录…' : 'Loading care records…'}</Text> : null}
    {failed ? <Text accessibilityLiveRegion="polite" style={styles.error}>{cn ? '无法读取照护记录，请重试。' : 'Could not load care records. Try again.'}</Text> : null}
    {!items.length && !loading && !failed ? <Text style={styles.note}>{cn ? '暂无公开照护记录；这不表示没有人照护。' : 'No care records yet. This does not mean nobody is caring for this cat.'}</Text> : null}
    {items.map(item => <View key={item.careEventId} style={styles.box}>
      <Text style={styles.title}>{careActivityLabel(locale, item.activity)}</Text>
      <Text style={styles.note}>{CARE_AREAS.find(area => area.cell === item.publicCellId)?.[cn ? 'zh' : 'en']}</Text>
      {'status' in item ? <>
        <Text style={styles.note}>{new Date(item.completedAt).toLocaleString(cn ? 'zh-CN' : 'en-SG')}</Text>
        <Text>{item.status === 'recorded' ? (cn ? '已记录' : 'Recorded') : item.status === 'withdrawn' ? (cn ? '已撤回' : 'Withdrawn') : (cn ? '已更正' : 'Corrected')}</Text>
        {item.status === 'recorded' ? <View style={styles.wrap}>
          {withdraw ? <Pressable accessibilityRole="button" disabled={busy} onPress={() => withdraw(item)} style={styles.choice}><Text>{cn ? '撤回' : 'Withdraw'}</Text></Pressable> : null}
          {correct ? <Pressable accessibilityRole="button" disabled={busy} onPress={() => correct(item)} style={styles.choice}><Text>{cn ? '更正' : 'Correct'}</Text></Pressable> : null}
        </View> : null}
      </> : <>
        <Text style={styles.note}>{item.completedWindow === 'today' ? (cn ? '今天' : 'Today') : item.completedWindow === 'this_week' ? (cn ? '本周' : 'This week') : (cn ? '更早' : 'Earlier')}</Text>
        <Text style={styles.note}>{cn ? '贡献者记录，尚未经独立核实' : 'Contributor reported; not independently verified'}</Text>
      </>}
    </View>)}
    <View style={styles.wrap}>
      <Pressable accessibilityRole="button" disabled={loading || busy} onPress={refresh} style={styles.choice}><Text>{cn ? '刷新照护记录' : 'Refresh care'}</Text></Pressable>
      {hasMore ? <Pressable accessibilityRole="button" disabled={loading || busy} onPress={more} style={styles.choice}><Text>{cn ? '加载更多照护记录' : 'Load more care'}</Text></Pressable> : null}
    </View>
  </View>;
}

import { communityForPublicCell, neighbourhoodForPublicCell } from '@animalhelper/domain';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { listDiscoveredCats, listFollowedCats, type CatListItem } from '../api/follows';
import { getPublicCatSummary, type PublicCatSummary } from '../api/cats';
import { getCatPresentations, type CatPresentation } from '../api/cat-presentation';
import { readSessionSubjectStrict } from '../auth/session-subject';
import { AppIcon } from '../components/AppIcon';
import { useNativeColors } from '../design/native-colors';
import { getCommunityMapCopy, type Locale } from '../i18n/catalog';
import { localizedCatName } from '../i18n/cat-name';
import { REPORT_AREAS } from '../maps/report-areas';
import { CatPhotoPreview } from '../report/CatPhotoPreview';

export function catPickerPublicCell(communitySlug: string | null): string | null {
  return REPORT_AREAS.find(([cell]) => neighbourhoodForPublicCell(cell)?.id === communitySlug || communityForPublicCell(cell)?.id === communitySlug)?.[0] ?? null;
}
type Props = { selectedCatId: string | null; communitySlug: string | null; owner: string | null; locale: Locale; onConfirm(id: string | null): void; onCancel(): void };
export function CatPicker({ selectedCatId, communitySlug, owner, locale, onConfirm, onCancel }: Props) {
  const c = useNativeColors(), zh = locale === 'zh-CN';
  const [mode, setMode] = useState<'discover' | 'following'>('discover'), [query, setQuery] = useState('');
  const [items, setItems] = useState<readonly CatListItem[]>([]), [portraits, setPortraits] = useState(new Map<string, CatPresentation>());
  const [selected, setSelected] = useState(selectedCatId), [detail, setDetail] = useState<PublicCatSummary | null>(null), [preview, setPreview] = useState(false);
  const [loading, setLoading] = useState(true), [confirming, setConfirming] = useState(false), [failed, setFailed] = useState(false), [notice, setNotice] = useState(''), [more, setMore] = useState(false);
  const sequence = useRef(0), cursor = useRef<string | null>(null), busy = useRef(false), confirmSequence = useRef(0);
  const currentOwner = useRef(owner); currentOwner.current = owner;
  const cell = catPickerPublicCell(communitySlug), scope = JSON.stringify([owner, mode, cell]), currentScope = useRef(scope); currentScope.current = scope;
  const load = useCallback(async (append = false) => {
    if (busy.current) return;
    const token = ++sequence.current, captured = scope;
    busy.current = true; setLoading(true); setFailed(false);
    const valid = async () => token === sequence.current && captured === currentScope.current && await readSessionSubjectStrict().catch(() => undefined) === owner;
    try {
      const page = mode === 'following' && owner ? await listFollowedCats({ cursor: append ? cursor.current : null, limit: 20 }) : await listDiscoveredCats({ cursor: append ? cursor.current : null, limit: 20, publicCellId: cell });
      if (!await valid()) return;
      setItems(old => append ? [...new Map([...old, ...page.items].map(cat => [cat.animalId, cat])).values()] : page.items);
      cursor.current = page.nextCursor; setMore(!!page.nextCursor);
      const photos = await getCatPresentations(page.items.map(cat => cat.animalId)).catch(() => new Map<string, CatPresentation>());
      if (await valid()) setPortraits(old => new Map([...old, ...photos]));
    } catch { if (await valid()) setFailed(true); }
    finally { if (token === sequence.current) { busy.current = false; setLoading(false); } }
  }, [scope, owner, mode, cell]);
  useEffect(() => { sequence.current++; busy.current = false; cursor.current = null; setItems([]); setPortraits(new Map()); setMore(false); void load(); return () => { sequence.current++; }; }, [load]);
  useEffect(() => { setSelected(selectedCatId); setDetail(null); setNotice(''); setPreview(false); setConfirming(false); confirmSequence.current++; }, [owner, selectedCatId]);
  useEffect(() => {
    let active = true; setDetail(null); setPreview(false);
    if (selected) void getPublicCatSummary(selected).then(async cat => {
      if (!active || currentOwner.current !== owner) return;
      setDetail(cat);
      if (!cat) return;
      const photos = await getCatPresentations([cat.animalId]).catch(() => new Map<string, CatPresentation>());
      if (active && currentOwner.current === owner) setPortraits(old => new Map([...old, ...photos]));
    }).catch(() => {});
    return () => { active = false; confirmSequence.current++; };
  }, [selected, owner]);
  const confirm = async () => {
    if (confirming) return;
    const ticket = ++confirmSequence.current, chosen = selected; setConfirming(true); setNotice('');
    try {
      const cat = chosen ? await getPublicCatSummary(chosen) : null;
      if (ticket !== confirmSequence.current || currentOwner.current !== owner || await readSessionSubjectStrict().catch(() => undefined) !== owner) return;
      if (chosen && !cat) { setDetail(null); setNotice(zh ? '这只猫已不可用，请改选或不关联单只猫。' : 'This cat is no longer available. Choose another or no single cat.'); return; }
      onConfirm(chosen);
    } catch { if (ticket === confirmSequence.current) setNotice(zh ? '无法确认猫档案，请重试。' : 'Could not confirm this cat. Retry.'); }
    finally { if (ticket === confirmSequence.current) setConfirming(false); }
  };
  const displayName = (cat: PublicCatSummary) => localizedCatName(cat.animalId, cat.primaryAlias, locale);
  const filtered = items.filter(cat => displayName(cat).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const portrait = selected ? portraits.get(selected)?.portraitUri : undefined;
  return <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={{ flex: 1, backgroundColor: c.canvas }}>
    <View style={{ padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}><Pressable accessibilityRole="button" accessibilityLabel={zh ? '取消选择' : 'Cancel selection'} onPress={onCancel} style={{ minHeight: 44, minWidth: 44, justifyContent: 'center' }}><AppIcon name="close" color={c.ink} /></Pressable><Text accessibilityRole="header" style={{ color: c.ink, fontSize: 20, fontWeight: '700' }}>{zh ? '选择猫咪' : 'Choose a cat'}</Text></View>
    <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 20, gap: 14 }} keyboardShouldPersistTaps="handled">
      <View style={{ flexDirection: 'row', gap: 16 }}>{(['discover', ...(owner ? ['following'] : [])] as ('discover' | 'following')[]).map(tab => <Pressable key={tab} accessibilityRole="tab" accessibilityState={{ selected: mode === tab }} onPress={() => setMode(tab)} style={{ minHeight: 44, justifyContent: 'center', borderBottomWidth: mode === tab ? 2 : 0, borderColor: c.actionPrimary }}><Text style={{ color: mode === tab ? c.actionPrimary : c.muted, fontSize: 15 }}>{tab === 'discover' ? (zh ? '发现' : 'Discover') : (zh ? '已关注' : 'Following')}</Text></Pressable>)}</View>
      <Text style={{ color: c.muted, fontSize: 12 }}>{mode === 'following' ? (zh ? '你关注的猫' : 'Cats you follow') : cell ? (zh ? '所选邻里附近的公开档案' : 'Public profiles near the selected neighbourhood') : (zh ? '所有公开候选猫' : 'All public candidates')}</Text>
      <TextInput accessibilityLabel={zh ? '搜索已加载的猫' : 'Search loaded cats'} placeholder={zh ? '按名字筛选已加载的候选' : 'Filter loaded candidates by name'} value={query} onChangeText={setQuery} placeholderTextColor={c.muted} style={{ backgroundColor: c.surface, color: c.ink, minHeight: 44, paddingHorizontal: 12, borderRadius: 12, fontSize: 14 }} />
      <Pressable accessibilityRole="button" accessibilityLabel={zh ? '不关联单只猫' : 'No single cat'} accessibilityState={{ selected: selected === null }} onPress={() => { setSelected(null); setNotice(''); }} style={{ padding: 14, minHeight: 54, borderRadius: 14, backgroundColor: selected === null ? c.leafSoft : c.surface, borderColor: selected === null ? c.actionPrimary : c.line, borderWidth: 1, gap: 4 }}><Text style={{ color: c.ink, fontSize: 14, fontWeight: '600' }}>{zh ? '不确定，或照片里有多只猫' : 'Unknown, or several cats'}</Text><Text style={{ color: c.muted, fontSize: 12 }}>{zh ? '只分享邻里的故事' : 'Share a neighbourhood story'}</Text></Pressable>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{filtered.map(cat => <Pressable key={cat.animalId} accessibilityRole="button" accessibilityLabel={`${zh ? '选择' : 'Select'} ${displayName(cat)}`} accessibilityState={{ selected: selected === cat.animalId }} onPress={() => { setSelected(cat.animalId); setNotice(''); }} style={{ width: '30%', flexGrow: 1, maxWidth: '34%', alignItems: 'center', padding: 10, gap: 6, borderRadius: 16, borderWidth: 1, borderColor: selected === cat.animalId ? c.actionPrimary : c.line, backgroundColor: selected === cat.animalId ? c.leafSoft : c.surface }}><PickerPortrait uri={portraits.get(cat.animalId)?.portraitUri} /><Text numberOfLines={2} style={{ color: c.ink, fontSize: 13, textAlign: 'center' }}>{displayName(cat)}</Text>{selected === cat.animalId ? <AppIcon name="check" size={16} color={c.actionPrimary} /> : null}</Pressable>)}</View>
      {loading ? <ActivityIndicator /> : failed ? <Pressable accessibilityRole="button" accessibilityLabel={zh ? '重试候选猫' : 'Retry cats'} onPress={() => void load(items.length > 0)} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: c.actionPrimary }}>{zh ? '候选暂不可用，重试' : 'Cats unavailable. Retry'}</Text></Pressable> : !filtered.length ? <Text style={{ color: c.muted, fontSize: 13 }}>{mode === 'following' && !items.length ? (zh ? '还未关注猫咪，可切换到发现。' : 'No followed cats here yet. Try Discover.') : (zh ? '已加载候选中没有匹配项。' : 'No match among loaded candidates.')}</Text> : null}
      {more && !loading ? <Pressable accessibilityRole="button" onPress={() => void load(true)} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: c.actionPrimary }}>{zh ? '加载更多猫咪' : 'Load more cats'}</Text></Pressable> : null}
      {detail && detail.animalId === selected ? <View style={{ padding: 14, backgroundColor: c.surface, borderRadius: 14, gap: 7 }}><Text style={{ color: c.ink, fontSize: 15, fontWeight: '600' }}>{zh ? '已选 · ' : 'Selected · '}{displayName(detail)}</Text><Text style={{ color: c.muted, fontSize: 12 }}>{getCommunityMapCopy(locale).verificationLabel(detail.verification)}</Text>{portrait ? <Pressable accessibilityRole="button" onPress={() => setPreview(true)} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: c.actionPrimary }}>{zh ? '放大公开照片' : 'View public photo'}</Text></Pressable> : null}</View> : null}
      {notice ? <Text accessibilityLiveRegion="polite" style={{ color: c.muted, fontSize: 13 }}>{notice}</Text> : null}
    </ScrollView>
    <View style={{ padding: 16, borderTopWidth: 1, borderColor: c.line }}><Pressable accessibilityRole="button" accessibilityLabel={zh ? '确认猫咪' : 'Confirm cat'} disabled={confirming} onPress={() => void confirm()} style={{ minHeight: 48, borderRadius: 24, backgroundColor: c.actionPrimary, justifyContent: 'center', alignItems: 'center' }}>{confirming ? <ActivityIndicator color={c.onAction} /> : <Text style={{ color: c.onAction, fontSize: 15, fontWeight: '600' }}>{zh ? '确认选择' : 'Confirm selection'}</Text>}</Pressable></View>
    {preview && portrait && detail ? <CatPhotoPreview uri={portrait} name={displayName(detail)} locale={locale} onClose={() => setPreview(false)} /> : null}
  </SafeAreaView>;
}
function PickerPortrait({ uri }: { uri?: string }) {
  const c = useNativeColors(), [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [uri]);
  return uri && !failed ? <Image source={{ uri }} onError={() => setFailed(true)} style={{ width: 62, height: 62, borderRadius: 31 }} /> : <View style={{ width: 62, height: 62, borderRadius: 31, backgroundColor: c.leafSoft, justifyContent: 'center', alignItems: 'center' }}><AppIcon name="cat" size={28} color={c.actionPrimary} /></View>;
}

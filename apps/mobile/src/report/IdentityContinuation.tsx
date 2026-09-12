import {AppIcon} from '../components/AppIcon';
import {getCatPresentations,type CatPresentation} from '../api/cat-presentation';
import { CatPhotoPreview } from './CatPhotoPreview';
import { toPublicMapPresentation } from '../maps/public-map-policy';
import { localizedCatName } from '../i18n/cat-name';
import { useEffect, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import type { PublicSighting, PublicSightingPage } from '../api/feed';
import type { StoredDraft } from '../offline/draft-policy';
import type { ReportIdentityIntent } from './report-draft';
import { radii } from '../design/theme';
import {useNativeColors} from '../design/native-colors';

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
  const [selected,setSelected]=useState<PublicSighting|null>(null);
  const [preview,setPreview]=useState(false);
  const [pageIndex,setPageIndex]=useState(0);
  const [portraits,setPortraits]=useState<ReadonlyMap<string,CatPresentation>>(new Map());
  const colors=useNativeColors(),styles=makeStyles(colors);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [saved, setSaved] = useState<StoredDraft['identityContinuation']>();
  const mounted = useRef(true);
  const inFlight = useRef(false);
  const attempt = useRef(0);
  const existing = saved ?? draft?.identityContinuation;
  const copy = locale === 'zh-CN'
    ? { title: '认出这只猫了吗？', intro: '先选择头像并查看资料，再确认是否是同一只猫。关联需要审核。', new: '作为新猫提交', skip: '暂不选择', retry: '重试身份提案', more: '显示更多公开档案', failed: '身份提案尚未提交，报告已安全保存。', pending: '身份提案正在等待独立审核。', closed: '该身份提案已结束。' }
    : { title: 'Recognise this cat?', intro: 'Select a portrait, check the details, then confirm your choice. Linking requires review.', new: 'Submit as a new cat', skip: 'Skip for now', retry: 'Retry identity proposal', more: 'Show more public profiles', failed: 'The identity proposal is still pending. Your report is safely saved.', pending: 'The identity proposal is awaiting independent review.', closed: 'This identity proposal is closed.' };

  useEffect(() => {
    let active = true;
    void dependencies.listPublicSightings({ limit: 20 }).then((page) => {
      if (!active) return;
      setCandidates([...new Map(page.items.map((item) => [item.animalId, item])).values()]);
      setCursor(page.nextCursor);
    }).catch(() => { if (active) setMessage(copy.failed); });
    return () => { active = false; };
  }, [dependencies.listPublicSightings]);

  const visible=candidates.slice(pageIndex*8,pageIndex*8+8);
  const visibleIds=visible.map(cat=>cat.animalId).join(',');
  useEffect(()=>{
    let active=true;
    if(visibleIds)void getCatPresentations(visibleIds.split(',')).then(result=>{if(active)setPortraits(current=>new Map([...current,...result]));}).catch(()=>undefined);
    return()=>{active=false;};
  },[visibleIds]);

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
      const combined=[...new Map([...candidates,...page.items].map(item=>[item.animalId,item])).values()];
      if(combined.length>candidates.length)setPageIndex(Math.floor(candidates.length/8));
      setCandidates(combined);
      setCursor(page.nextCursor);
    } catch { if (mounted.current) setMessage(copy.failed); } finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  }

  const selectedPresentation=selected?toPublicMapPresentation(selected,locale):null;
  const selectedUri=selected?portraits.get(selected.animalId)?.portraitUri:undefined;
  const confirmLabel=locale==='zh-CN'?'确认选择这只猫':'Confirm selected cat';
  const photoLabel=locale==='zh-CN'?'放大猫咪照片':'Enlarge cat photo';
  return <View style={styles.panel}>
    <Text accessibilityRole="header" style={styles.title}>{copy.title}</Text>
    <Text style={styles.copy}>{copy.intro}</Text>
    {existing ? <Pressable accessibilityRole="button" accessibilityLabel={copy.retry} disabled={busy} onPress={() => { void submit(existing.intent, existing.requestId); }} style={styles.primary}><Text style={styles.primaryText}>{copy.retry}</Text></Pressable> : <>
      <View style={styles.bubbles}>{visible.map(candidate=><IdentityBubble key={candidate.animalId} name={localizedCatName(candidate.animalId,candidate.primaryAlias,locale)} uri={portraits.get(candidate.animalId)?.portraitUri} disabled={busy} selected={selected?.animalId===candidate.animalId} onPress={()=>setSelected(candidate)}/>)}</View>
      {candidates.length>8||cursor?<View style={styles.pager}>
       <Pressable accessibilityRole="button" accessibilityLabel={locale==='zh-CN'?'上一组猫':'Previous cats'} disabled={busy||pageIndex===0} onPress={()=>setPageIndex(index=>index-1)} style={styles.pageButton}><AppIcon name="back" size={16} color={pageIndex===0?colors.muted:colors.actionPrimary}/></Pressable>
       <Text style={styles.copy}>{pageIndex+1} / {Math.max(1,Math.ceil(candidates.length/8))}{cursor?' +':''}</Text>
       <Pressable accessibilityRole="button" accessibilityLabel={locale==='zh-CN'?'下一组猫':'Next cats'} disabled={busy||((pageIndex+1)*8>=candidates.length&&!cursor)} onPress={()=>{if((pageIndex+1)*8<candidates.length)setPageIndex(index=>index+1);else void more();}} style={styles.pageButton}><AppIcon name="chevron" size={16} color={colors.actionPrimary}/></Pressable>
      </View>:null}
      {cursor&&(pageIndex+1)*8>=candidates.length?<Pressable accessibilityRole="button" accessibilityLabel={copy.more} disabled={busy} onPress={()=>void more()} style={styles.pageButton}><Text style={styles.optionText}>{copy.more}</Text></Pressable>:null}
      {selected&&selectedPresentation?<View testID="identity-selection" style={styles.selection}>
        <View style={styles.selectionDetails}>
          {selectedUri?<Pressable accessibilityRole="button" accessibilityLabel={photoLabel} onPress={()=>setPreview(true)} style={styles.detailPhoto}><Image source={{uri:selectedUri}} style={styles.detailPhoto}/></Pressable>:<View style={styles.detailPhoto}><AppIcon name="cat" size={32} color={colors.actionPrimary}/></View>}
          <View style={{flex:1,gap:4}}><Text style={styles.title}>{selectedPresentation.alias}</Text><Text style={styles.copy}>{selectedPresentation.verificationLabel} · {selectedPresentation.timeLabel}</Text>{selectedUri?<Text style={styles.copy}>{locale==='zh-CN'?'轻点照片可放大':'Tap the photo to enlarge'}</Text>:null}</View>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={confirmLabel} disabled={busy} onPress={()=>void submit({kind:'existing',animalId:selected.animalId})} style={styles.primary}><Text style={styles.primaryText}>{confirmLabel}</Text></Pressable>
      </View>:null}
      {selectedUri&&preview?<CatPhotoPreview uri={selectedUri} name={selectedPresentation?.alias??''} locale={locale} onClose={()=>setPreview(false)}/>:null}
      <Pressable accessibilityRole="button" accessibilityLabel={copy.new} disabled={busy} onPress={() => { void submit({ kind: 'new' }); }} style={styles.option}><Text style={styles.optionText}>{copy.new}</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={copy.skip} disabled={busy} onPress={onSkip} style={styles.option}><Text style={styles.optionText}>{copy.skip}</Text></Pressable>
    </>}
    {message ? <Text accessibilityLiveRegion="polite" style={styles.message}>{message}</Text> : null}
  </View>;
}

function IdentityBubble({name,uri,disabled,selected,onPress}:Readonly<{name:string;uri?:string;disabled:boolean;selected:boolean;onPress():void}>){
 const colors=useNativeColors(),styles=makeStyles(colors);
 const [failed,setFailed]=useState(false);
 useEffect(()=>setFailed(false),[uri]);
 return <Pressable testID="identity-cat-bubble" accessibilityRole="button" accessibilityLabel={name} accessibilityState={{disabled,selected}} disabled={disabled} onPress={onPress} style={({pressed})=>[styles.bubble,{opacity:disabled?0.55:1,transform:[{scale:pressed?0.94:1}]}]}>
  <View style={[styles.portraitRing,selected&&styles.selectedRing]}><View style={styles.portrait}>{uri&&!failed?<Image source={{uri}} onError={()=>setFailed(true)} style={styles.portrait}/>:<AppIcon name="cat" size={26} color={colors.actionPrimary}/>}</View></View>
  <Text numberOfLines={1} style={styles.catName}>{name}</Text>
 </Pressable>;
}

const makeStyles = (colors:ReturnType<typeof useNativeColors>)=>StyleSheet.create({
  selection:{gap:12,padding:12,borderRadius:14,backgroundColor:colors.leafSoft},selectionDetails:{flexDirection:'row',alignItems:'center',gap:12},detailPhoto:{width:80,height:80,borderRadius:12,alignItems:'center',justifyContent:'center'},portraitRing:{padding:3,borderWidth:2,borderColor:'transparent',borderRadius:32},selectedRing:{borderColor:colors.actionPrimary},
  bubbles:{flexDirection:'row',flexWrap:'wrap',rowGap:12},bubble:{width:'25%',minHeight:82,alignItems:'center',gap:6,paddingHorizontal:3},portrait:{width:52,height:52,borderRadius:26,backgroundColor:colors.leafSoft,alignItems:'center',justifyContent:'center'},catName:{fontSize:12,color:colors.ink},pager:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:12},pageButton:{minHeight:44,minWidth:44,alignItems:'center',justifyContent:'center'},
  panel: { gap: 12, paddingVertical: 16 },
  title: { color: colors.ink, fontSize: 17, lineHeight: 23, fontWeight: '600' }, copy: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  primary: { minHeight: 48, borderRadius: radii.small, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.actionPrimary }, primaryText: { color: colors.onAction, fontSize: 15, fontWeight: '600' },
  option: { minHeight: 46, borderRadius: radii.small, paddingHorizontal: 12, justifyContent: 'center', borderWidth: 1, borderColor: colors.line }, optionText: { color: colors.actionPrimary, fontSize: 15, fontWeight: '700' }, message: { color: colors.muted, fontSize: 14, lineHeight: 20 },
});

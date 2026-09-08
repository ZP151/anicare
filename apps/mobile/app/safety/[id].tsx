import * as Crypto from 'expo-crypto';
import { useLocalSearchParams,useRouter } from 'expo-router';
import { useCallback,useEffect,useRef,useState } from 'react';
import { Pressable,Text,View } from 'react-native';
import { listSafetyActivity,canReportContent,type SafetyActivity,type RightsPage } from '../../src/api/rights';
import type { ModerationReportRequest } from '../../src/api/safety';
import { ScreenScaffold } from '../../src/components/ScreenScaffold';
import { useLocale } from '../../src/i18n/LocaleContext';
import { getCommunityMapCopy } from '../../src/i18n/catalog';
import { careStyles as styles } from '../../src/care/CareEntry';
import { useSafetyRequests } from '../../src/safety/use-safety-requests';
import { RequestNotice } from '../../src/safety/RequestNotice';
const reasons=[['misinformation','Incorrect information','信息不准确'],['spam','Spam','垃圾信息'],['harassment','Harassment','骚扰'],['precise_location_exposure','Precise location exposed','暴露精确位置'],['animal_welfare','Animal welfare concern','动物福利问题']] as const;
export default function SafetyRoute(){
 const params=useLocalSearchParams<{id?:string|string[]}>();const animalId=typeof params.id==='string'?params.id:'';const router=useRouter();const {locale}=useLocale();const cn=locale==='zh-CN';const copy=getCommunityMapCopy(locale);const requests=useSafetyRequests();
 const [adult,setAdult]=useState(false);
 useEffect(()=>{setAdult(false);if(!requests.owner)return;const current=requests.pin();let active=true;void canReportContent().then(async value=>{if(active&&await current())setAdult(value);}).catch(()=>undefined);return()=>{active=false;};},[requests.owner,requests.pin]);
 const [page,setPage]=useState<RightsPage<SafetyActivity>>({items:[],nextCursor:null});const [selected,setSelected]=useState<string|null>(null);const [reason,setReason]=useState<ModerationReportRequest['reasonCode']>('misinformation');const [failed,setFailed]=useState(false);const [loading,setLoading]=useState(false);const epoch=useRef(0);
 const load=useCallback(async(cursor:string|null=null)=>{const token=++epoch.current;const current=requests.pin();setLoading(true);setFailed(false);if(!cursor){setPage({items:[],nextCursor:null});setSelected(null);}try{const result=await listSafetyActivity(animalId,cursor);if(token!==epoch.current||!await current())return;setPage(previous=>({items:cursor?[...new Map([...previous.items,...result.items].map(r=>[r.sightingId,r])).values()]:result.items,nextCursor:result.nextCursor===cursor?null:result.nextCursor}));}catch{if(token===epoch.current&&await current())setFailed(true);}finally{if(token===epoch.current)setLoading(false);}},[animalId,requests.pin]);
 useEffect(()=>{setPage({items:[],nextCursor:null});setSelected(null);if(requests.owner!==undefined)void load();return()=>{++epoch.current;};},[load,requests.owner,requests.sent]);
 const disabled=!adult||!requests.owner||!requests.ready||requests.busy||!!requests.pending||!selected;
 return <ScreenScaffold title={cn?'内容安全':'Content safety'} subtitle={cn?'选择一条延迟公开的活动。举报由人工处理，不代表已派出救援。':'Select delayed public activity. Reports go to human review; this does not dispatch rescue.'}>
 <Pressable accessibilityRole="button" style={styles.choice} onPress={()=>router.push('/privacy' as never)}><Text>{cn?'隐私与请求':'Privacy and requests'}</Text></Pressable>
 <RequestNotice requests={requests}/>
 {requests.owner&&!adult?<Pressable accessibilityRole="button" style={styles.choice} onPress={()=>router.push('/profile' as never)}><Text>{cn?'举报和屏蔽需要确认成年贡献者资格':'Confirm adult contributor eligibility to report or block'}</Text></Pressable>:null}
 <Pressable accessibilityRole="button" style={styles.choice} disabled={loading} onPress={()=>{void load();}}><Text>{cn?'刷新活动':'Refresh activity'}</Text></Pressable>
 {failed?<Text>{cn?'活动暂时不可用。':'Activity is unavailable.'}</Text>:null}
 {loading?<Text>{cn?'正在加载…':'Loading…'}</Text>:null}
 {page.items.map((row,index)=><Pressable key={row.sightingId} accessibilityRole="button" accessibilityLabel={cn?`选择活动 ${index+1}`:`Select activity ${index+1}`} accessibilityState={{selected:row.sightingId===selected}} style={styles.choice} onPress={()=>setSelected(row.sightingId)}><Text>{index+1}. {copy.timeLabel(row.timeBucket)}</Text></Pressable>)}
 {!loading&&!failed&&page.items.length===0?<Text>{cn?'暂无可举报的公开活动。':'No eligible public activity is available.'}</Text>:null}
 {page.nextCursor?<Pressable accessibilityRole="button" disabled={loading} style={styles.choice} onPress={()=>{void load(page.nextCursor);}}><Text>{cn?'加载更多活动':'Load more activity'}</Text></Pressable>:null}
 <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{reasons.map(([value,en,zh])=><Pressable key={value} accessibilityRole="button" disabled={requests.busy||!!requests.pending} accessibilityState={{selected:reason===value}} style={styles.choice} onPress={()=>setReason(value)}><Text>{cn?zh:en}</Text></Pressable>)}</View>
 <Pressable accessibilityRole="button" disabled={disabled} style={styles.choice} onPress={()=>{if(selected)void requests.submit({kind:'report',request:{contentType:'sighting',contentId:selected,reasonCode:reason,detail:null,requestId:Crypto.randomUUID()}});}}><Text>{cn?'举报所选活动':'Report selected activity'}</Text></Pressable>
 <Pressable accessibilityRole="button" disabled={disabled} style={styles.choice} onPress={()=>{if(selected)void requests.submit({kind:'block',sightingId:selected,requestId:Crypto.randomUUID()});}}><Text>{cn?'屏蔽这位贡献者':'Block this contributor'}</Text></Pressable>
 {!requests.owner?<Pressable accessibilityRole="button" style={styles.choice} onPress={()=>router.push('/profile' as never)}><Text>{cn?'登录后提交请求':'Sign in to submit requests'}</Text></Pressable>:null}
 <Pressable accessibilityRole="button" style={styles.choice} onPress={()=>router.push({pathname:'/privacy',params:{animalId}} as never)}><Text>{cn?'请求身份更正或报告重复猫':'Request identity correction or report a duplicate cat'}</Text></Pressable>
 </ScreenScaffold>;
}

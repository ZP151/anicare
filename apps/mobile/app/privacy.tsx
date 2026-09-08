import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as Linking from 'expo-linking';
import {useLocalSearchParams,useRouter} from 'expo-router';
import {useCallback,useEffect,useRef,useState} from 'react';
import {Pressable,Text,TextInput,View} from 'react-native';
import {listMyRights,listMyModeration,type RightsItem,type ModerationStatus,type RightsKind,type RightsPage} from '../src/api/rights';
import {FOLLOW_UUID} from '../src/api/follows';
import {useSafetyRequests} from '../src/safety/use-safety-requests';
import {RequestNotice} from '../src/safety/RequestNotice';
import {ScreenScaffold} from '../src/components/ScreenScaffold';
import {useCareStyles} from '../src/care/CareEntry';
import {useLocale} from '../src/i18n/LocaleContext';
const kinds=[['identity_correction','Identity correction','身份更正'],['duplicate_cat','Duplicate cat','重复猫档案'],['appeal','Appeal','申诉'],['access','Access request','访问请求'],['correction','Personal data correction','个人资料更正'],['withdrawal','Consent withdrawal','撤回同意']] as const;
const statusCopy:Record<string,readonly[string,string]>={received:['Received','已接收'],reviewing:['Under review','人工处理中'],needs_new_proposal:['New identity proposal requested','请提交新的身份提案'],closed:['Request closed; this does not itself change a cat identity','已结束受理；不代表猫身份自动变更'],processing:['Processing','正在处理'],retryable:['Needs retry','等待重试'],cleanup_pending:['Account removed; media cleanup pending','账户已移除，媒体仍在清理'],completed:['Cleanup confirmed by the service','服务已确认清理完成'],open:['Received','已接收'],auto_hidden:['Received; content temporarily hidden','已接收，内容暂时隐藏'],under_review:['Under review','人工处理中'],resolved:['Review completed','审核已处理'],appealed:['Appeal received','申诉已接收']};
export default function PrivacyRoute(){
 const {locale}=useLocale();const cn=locale==='zh-CN';const router=useRouter();const params=useLocalSearchParams<{animalId?:string}>();
 const styles=useCareStyles();
 const animalId=typeof params.animalId==='string'&&FOLLOW_UUID.test(params.animalId)?params.animalId:null;
 const requests=useSafetyRequests();const [kind,setKind]=useState<RightsKind>(animalId?'identity_correction':'access');const [detail,setDetail]=useState('');const [confirmDelete,setConfirmDelete]=useState(false);
 const [rights,setRights]=useState<RightsPage<RightsItem>>({items:[],nextCursor:null});const [moderation,setModeration]=useState<RightsPage<ModerationStatus>>({items:[],nextCursor:null});
 const [failed,setFailed]=useState(false);const [loading,setLoading]=useState(false);const [receipt,setReceipt]=useState<string|null>(null);const epoch=useRef(0);
 const load=useCallback(async(which:'all'|'rights'|'moderation'='all',cursor:string|null=null)=>{
  if(!requests.owner)return;const token=++epoch.current;const current=requests.pin();setFailed(false);setLoading(true);
  try{
   const [r,m]=await Promise.all([which!=='moderation'?listMyRights(cursor):null,which!=='rights'?listMyModeration(cursor):null]);
   if(token!==epoch.current||!await current())return;
   if(r)setRights(previous=>({items:cursor?[...new Map([...previous.items,...r.items].map(x=>[x.requestId,x])).values()]:r.items,nextCursor:r.nextCursor===cursor?null:r.nextCursor}));
   if(m)setModeration(previous=>({items:cursor?[...new Map([...previous.items,...m.items].map(x=>[x.requestId,x])).values()]:m.items,nextCursor:m.nextCursor===cursor?null:m.nextCursor}));
  }catch{if(token===epoch.current&&await current())setFailed(true);}finally{if(token===epoch.current)setLoading(false);}
 },[requests.owner,requests.pin]);
 useEffect(()=>{setRights({items:[],nextCursor:null});setModeration({items:[],nextCursor:null});setDetail('');setConfirmDelete(false);void load();return()=>{++epoch.current;};},[load,requests.sent]);
 useEffect(()=>{let active=true;setReceipt(null);if(requests.owner!==null)return;
  void SecureStore.getItemAsync('rights.erasure.receipt').then(value=>{if(!active||!value)return;try{const parsed=JSON.parse(value);if(Object.keys(parsed).length===2&&FOLLOW_UUID.test(parsed.requestId)&&['unconfirmed','received'].includes(parsed.status))setReceipt(parsed.requestId);}catch{/* A malformed receipt is never rendered. */}}).catch(()=>undefined);
  return()=>{active=false;};
 },[requests.owner]);
 const status=(value:string)=>(statusCopy[value]??['Status unavailable','状态不可用'])[cn?1:0];
 const blocked=!requests.owner||!requests.ready||requests.busy||!!requests.pending;
 const configured=process.env.EXPO_PUBLIC_RIGHTS_CONTACT_URL;let contact:string|null=null;
 try{if(configured){const url=new URL(configured);if((url.protocol==='https:'&&url.username===''&&url.password==='')||url.protocol==='mailto:')contact=configured;}}catch{/* Only configured contact channels are shown. */}
 return <ScreenScaffold title={cn?'隐私与请求':'Privacy and requests'} subtitle={cn?'请求由人工受理。训练默认关闭，身份变更仍需独立确认。':'Requests go to human handling. Training is off by default; identity changes still need independent confirmation.'}>
 {contact?<Pressable accessibilityRole="link" style={styles.choice} onPress={()=>{void Linking.openURL(contact!).catch(()=>setFailed(true));}}><Text style={styles.choiceText}>{cn?'联系隐私受理人员':'Contact the privacy team'}</Text></Pressable>:<Text style={styles.note}>{cn?'当前未提供站外受理渠道。请保存回执；账户移除后无法在应用内查询进度。':'An external contact channel is not available yet. Save your receipt; in-app tracking ends after account removal.'}</Text>}
 {requests.owner===undefined?<Text>{cn?'正在读取账户…':'Loading account…'}</Text>:!requests.owner?<><Text>{cn?'登录后查看和提交请求。':'Sign in to view and submit requests.'}</Text><Pressable accessibilityRole="button" style={styles.choice} onPress={()=>router.push('/profile' as never)}><Text>{cn?'登录':'Sign in'}</Text></Pressable>{receipt?<Text selectable>{cn?'本机保留的删除请求回执：':'Deletion request receipt saved on this device: '}{receipt}{cn?'。退出后的本地回执不证明清理完成。':'. A local receipt does not prove cleanup has completed.'}</Text>:null}</>:<>
 <RequestNotice requests={requests}/>
 <View style={styles.box}><Text style={styles.title}>{cn?'提交权利或纠错请求':'Submit a rights or correction request'}</Text><Text>{cn?'请勿填写精确位置或敏感个人信息。重复猫和申诉不会自动合并或改判。':'Do not include precise locations or sensitive personal information. Duplicate and appeal requests do not automatically merge or change identities.'}</Text>
 {kinds.map(([value,en,zh])=><Pressable key={value} accessibilityRole="button" disabled={blocked} accessibilityState={{selected:kind===value}} style={styles.choice} onPress={()=>setKind(value)}><Text>{cn?zh:en}</Text></Pressable>)}
 <TextInput accessibilityLabel={cn?'请求说明':'Request details'} placeholderTextColor="#68736C" editable={!blocked} multiline maxLength={1000} value={detail} onChangeText={setDetail} style={styles.input}/>
 <Pressable accessibilityRole="button" disabled={blocked||!detail.trim()} style={styles.choice} onPress={()=>{void requests.submit({kind:'rights',requestId:Crypto.randomUUID(),rightsKind:kind,animalId,detail:detail.trim()});}}><Text>{cn?'提交请求':'Submit request'}</Text></Pressable></View>
 <View style={styles.box}><Text style={styles.title}>{cn?'删除账户':'Delete account'}</Text><Text>{cn?'提交后由受信服务删除登录账户并清理关联媒体，可能需要重试。请保存回执；账户移除后不能继续登录查询状态。':'The trusted service removes your sign-in account and cleans related media; retries may be needed. Save the receipt: signed-in status tracking ends when the account is removed.'}</Text>
 {!confirmDelete?<Pressable accessibilityRole="button" disabled={blocked} style={styles.choice} onPress={()=>setConfirmDelete(true)}><Text>{cn?'申请删除账户':'Request account deletion'}</Text></Pressable>:<><Text>{cn?'确认申请删除此账户及按规则清理关联资料？':'Confirm removal of this account and cleanup of associated data under the retention policy?'}</Text><Pressable accessibilityRole="button" disabled={blocked} style={styles.choice} onPress={()=>{void requests.submit({kind:'erase',requestId:Crypto.randomUUID()});}}><Text>{cn?'确认删除申请':'Confirm deletion request'}</Text></Pressable><Pressable accessibilityRole="button" style={styles.choice} onPress={()=>setConfirmDelete(false)}><Text>{cn?'取消':'Cancel'}</Text></Pressable></>}
 </View>
 <Pressable accessibilityRole="button" disabled={loading} style={styles.choice} onPress={()=>{void load();}}><Text>{cn?'刷新请求状态':'Refresh request status'}</Text></Pressable>
 {failed?<Text accessibilityRole="alert">{cn?'无法读取请求，请刷新重试。':'Could not load requests. Refresh to retry.'}</Text>:null}
 {rights.items.map(row=><View key={row.requestId} style={styles.box}><Text>{cn?'请求：':'Request: '}{row.kind==='account_erasure'?(cn?'删除账户':'Account deletion'):(kinds.find(item=>item[0]===row.kind)?.[cn?2:1]??row.kind)}</Text><Text>{status(row.status)}</Text><Text selectable>{row.requestId}</Text>{row.status==='needs_new_proposal'?<Pressable accessibilityRole="button" style={styles.choice} onPress={()=>router.push('/report' as never)}><Text>{cn?'打开报告与草稿':'Open reports and drafts'}</Text></Pressable>:null}</View>)}
 {rights.nextCursor?<Pressable accessibilityRole="button" disabled={loading} style={styles.choice} onPress={()=>{void load('rights',rights.nextCursor);}}><Text>{cn?'更多权利请求':'More rights requests'}</Text></Pressable>:null}
 <Text style={styles.title}>{cn?'我的内容举报':'My content reports'}</Text>{moderation.items.map(row=><View key={row.requestId} style={styles.box}><Text>{status(row.status)}</Text><Text selectable>{row.requestId}</Text></View>)}
 {moderation.nextCursor?<Pressable accessibilityRole="button" disabled={loading} style={styles.choice} onPress={()=>{void load('moderation',moderation.nextCursor);}}><Text>{cn?'更多内容举报':'More content reports'}</Text></Pressable>:null}
 {!loading&&!failed&&rights.items.length===0&&moderation.items.length===0?<Text>{cn?'暂无已受理请求。':'No received requests yet.'}</Text>:null}
 </>}
 </ScreenScaffold>;
}

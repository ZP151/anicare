import { Pressable,Text,View } from 'react-native';
import { careStyles as styles } from '../care/CareEntry';
import { useLocale } from '../i18n/LocaleContext';
import type { useSafetyRequests } from './use-safety-requests';
export function RequestNotice({requests}:{requests:ReturnType<typeof useSafetyRequests>}){
 const {locale}=useLocale();const cn=locale==='zh-CN';
 return <View style={{gap:8}}>{requests.failed?<Text accessibilityRole="alert">{cn?'暂时无法确认响应，重试将沿用同一请求。':'Could not confirm the response. Retry uses the same request.'}</Text>:null}
 {requests.pending?<><Text>{cn?'有一个待确认请求。提交新的请求前请先重试。':'A request is waiting for confirmation. Retry it before submitting another.'}</Text><Pressable accessibilityRole="button" style={styles.choice} disabled={requests.busy} onPress={()=>{void requests.submit(requests.pending!);}}><Text>{cn?'重试待确认请求':'Retry pending request'}</Text></Pressable></>:null}
 {requests.sent?<Text accessibilityLiveRegion="polite">{cn?'请求已接收，可在隐私与请求页面查看处理状态。':'Request received. You can check its status in Privacy and requests.'}</Text>:null}
 {requests.pending||!requests.ready&&requests.failed?<><Text>{cn?'停止本机重试不会撤销已接收的请求，请先检查请求状态。':'Stopping retries does not undo a request already received. Check request status first.'}</Text><Pressable accessibilityRole="button" disabled={requests.busy} style={styles.choice} onPress={()=>{void requests.stopRetrying().catch(()=>undefined);}}><Text>{cn?'停止本机重试':'Stop retrying on this device'}</Text></Pressable></>:null}
 {!requests.ready&&requests.failed?<Pressable accessibilityRole="button" style={styles.choice} onPress={()=>{void requests.reload();}}><Text>{cn?'重新读取请求':'Reload requests'}</Text></Pressable>:null}</View>;
}

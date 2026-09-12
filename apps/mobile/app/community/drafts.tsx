import {ManagedDraftList} from '../../src/components/ManagedDraftList';
import {useFocusEffect,useRouter} from 'expo-router';
import {useCallback,useState} from 'react';
import {Pressable,Text} from 'react-native';
import {useAccountSession} from '../../src/auth/use-account-session';
import {ScreenScaffold} from '../../src/components/ScreenScaffold';
import {AppIcon} from '../../src/components/AppIcon';
import {useNativeColors} from '../../src/design/native-colors';
import {useLocale} from '../../src/i18n/LocaleContext';
import type {SocialDraft} from '../../src/community/post-draft';
import {socialDraftStore} from '../../src/community/post-draft-store';
export default function SocialDrafts(){
 const auth=useAccountSession(),router=useRouter(),c=useNativeColors(),{locale}=useLocale(),zh=locale==='zh-CN';
 const [drafts,setDrafts]=useState<SocialDraft[]>([]),[failed,setFailed]=useState(false);
 const load=useCallback(async()=>{setFailed(false);if(!auth.owner){setDrafts([]);return;}const current=auth.pin();try{const items=await socialDraftStore.list(auth.owner);if(await current())setDrafts(items);}catch{if(await current())setFailed(true);}},[auth.owner,auth.pin]);
 useFocusEffect(useCallback(()=>{setDrafts([]);void load();},[load]));
 return <ScreenScaffold title={zh?'帖子草稿':'Post drafts'} trailing={<Pressable accessibilityRole="button" accessibilityLabel={zh?'关闭':'Close'} style={{minWidth:44,minHeight:44,justifyContent:'center'}} onPress={()=>router.canGoBack()?router.back():router.replace('/' as never)}><AppIcon name="close" color={c.ink}/></Pressable>}>
 {failed?<Pressable onPress={()=>void load()} style={{minHeight:44}}><Text style={{color:c.actionPrimary}}>{zh?'未能载入，请重试':'Could not load. Retry'}</Text></Pressable>:null}
 {!failed&&!drafts.length?<Text style={{color:c.muted}}>{zh?'还没有保存的帖子草稿。':'No saved post drafts yet.'}</Text>:null}
 {auth.owner&&drafts.length>0?<ManagedDraftList key={auth.owner} zh={zh} items={drafts.map(draft=>({id:draft.id,title:draft.title||draft.body||(zh?'未命名草稿':'Untitled draft'),detail:`${draft.images.length} ${zh?'张照片':'photos'}`,updatedAt:draft.updatedAt,kind:draft.phase==='publishing'?'pending':draft.images.length?'photo':'text',canDelete:draft.phase==='editing'}))} isCurrent={auth.pin()} onOpen={id=>router.push(`/community/new?draftId=${id}` as never)} onDelete={async id=>{const current=auth.pin();if(!auth.owner||!await current())throw new Error('stale_account');await socialDraftStore.removeEditing(auth.owner,id);}}/>:null}
 </ScreenScaffold>;
}

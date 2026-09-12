import {randomUUID} from 'expo-crypto';
import {useLocalSearchParams,useRouter} from 'expo-router';
import {useCallback,useEffect,useRef,useState} from 'react';
import {ActivityIndicator,AppState,Image,Modal,Pressable,ScrollView,StyleSheet,Text,TextInput,View} from 'react-native';
import {useAccountSession} from '../auth/use-account-session';
import {AppIcon} from '../components/AppIcon';
import {ScreenScaffold} from '../components/ScreenScaffold';
import {useNativeColors} from '../design/native-colors';
import {useLocale} from '../i18n/LocaleContext';
import {browseSingaporeCommunities,communityLabel,SG_COMMUNITIES} from '../maps/singapore-communities';
import {createSocialDraft,editSocialDraft,isSocialId,type SocialDraft,type SocialDraftEdit} from './post-draft';
import {socialDraftStore} from './post-draft-store';
import type {SocialImageBytes} from './post-draft-storage';
import {createSocialPreviewScope,selectSocialImages} from './post-images';
import {publishSocialDraft} from './post-publisher';
import {createSocialTransport} from './post-transport';

export function SocialComposer(){
 const auth=useAccountSession(),router=useRouter(),{locale}=useLocale(),c=useNativeColors(),zh=locale==='zh-CN';
 const params=useLocalSearchParams<{draftId?:string;communitySlug?:string;catId?:string}>();
 const [draft,setDraft]=useState<SocialDraft|null>(null),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[picker,setPicker]=useState(false),[search,setSearch]=useState(''),[previews,setPreviews]=useState<Record<string,string>>({});
 const live=useRef<SocialDraft|null>(null),alive=useRef(true),operation=useRef(false),queue=useRef<Promise<unknown>>(Promise.resolve()),revision=useRef(new Map<string,number>()),scope=useRef(createSocialPreviewScope()),timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const context=useRef(auth.owner);context.current=auth.owner;
 const label=(slug:string|null)=>{const area=SG_COMMUNITIES.find(a=>a.id===slug);return area?communityLabel(area,locale):null;};
 const put=(next:SocialDraft)=>{live.current=next;setDraft(next);};
 const persist=useCallback((snapshot:SocialDraft,bytes:readonly SocialImageBytes[]=[])=>{
  const task=queue.current.catch(()=>{}).then(async()=>{
   const saved=await socialDraftStore.save(snapshot.ownerId,{...snapshot,revision:revision.current.get(snapshot.id)??snapshot.revision},bytes);
   revision.current.set(saved.id,saved.revision);
   if(live.current?.id===saved.id)live.current={...live.current,revision:saved.revision};
   return saved;
  });queue.current=task;return task;
 },[]);
 const reloadPreviews=useCallback(async(snapshot:SocialDraft)=>{
  const previous=scope.current;const next=createSocialPreviewScope();scope.current=next;previous.dispose();setPreviews({});
  const urls:Record<string,string>={};
  try{for(const image of snapshot.images){const bytes=await socialDraftStore.readImage(snapshot.ownerId,snapshot.id,image.id);if(!alive.current||context.current!==snapshot.ownerId||scope.current!==next)return;urls[image.id]=next.preview(bytes.thumb);}if(alive.current&&scope.current===next)setPreviews(urls);}
  catch{next.dispose();}
 },[]);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;if(timer.current)clearTimeout(timer.current);const last=live.current;if(last&&last.phase==='editing'&&!operation.current)void persist(last).catch(()=>{});scope.current.dispose();};},[persist]);
 useEffect(()=>{
  let active=true;live.current=null;setDraft(null);setPreviews({});setNotice('');scope.current.dispose();scope.current=createSocialPreviewScope();
  if(!auth.owner)return;
  const owner=auth.owner;
  void (async()=>{
   let next:SocialDraft|null=null;
   if(params.draftId){if(!isSocialId(params.draftId))throw new Error('invalid_social_draft');next=await socialDraftStore.read(owner,params.draftId);if(!next)throw new Error('social_draft_unavailable');}
   else{next=createSocialDraft(owner,randomUUID(),randomUUID(),new Date().toISOString());next=editSocialDraft(next,{communitySlug:typeof params.communitySlug==='string'&&SG_COMMUNITIES.some(a=>a.id===params.communitySlug)?params.communitySlug:null,catId:isSocialId(params.catId)?params.catId:null},new Date().toISOString());next=await socialDraftStore.save(owner,next);}
   if(!active||context.current!==owner)return;revision.current.set(next.id,next.revision);put(next);await reloadPreviews(next);
  })().catch(()=>{if(active)setNotice(zh?'草稿未能打开，请返回重试。':'Could not open this draft. Go back and retry.');});
  return()=>{active=false;};
 },[auth.owner,params.draftId,params.communitySlug,params.catId]);
 useEffect(()=>{const sub=AppState.addEventListener('change',state=>{
  if(state!=='active'){scope.current.dispose();setPreviews({});const last=live.current;if(last&&last.phase==='editing'&&!operation.current)void persist(last).catch(()=>{if(alive.current)setNotice(zh?'草稿尚未保存，请重试。':'Draft is not saved yet. Please retry.');});}
  else if(live.current&&!operation.current)void reloadPreviews(live.current);
 });return()=>sub.remove();},[persist,reloadPreviews,zh]);
 const edit=(patch:SocialDraftEdit)=>{
  const old=live.current;if(!old||old.phase!=='editing'||operation.current)return;
  const next=editSocialDraft(old,patch,new Date().toISOString());put(next);setNotice('');
  if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(()=>void persist(next).catch(()=>{if(alive.current)setNotice(zh?'草稿尚未保存，请重试。':'Draft is not saved yet. Please retry.');}),450);
 };
 const add=async(source:'camera'|'library')=>{
  const old=live.current;if(!old||old.phase!=='editing'||operation.current)return;
  operation.current=true;setBusy(true);if(timer.current)clearTimeout(timer.current);
  const owner=old.ownerId,current=()=>alive.current&&context.current===owner;
  try{
   await persist(old);const selected=await selectSocialImages(source,6-old.images.length,current);if(!current()||!selected.length)return;
   const next=editSocialDraft(live.current!,{images:[...live.current!.images,...selected.map(item=>item.image)]},new Date().toISOString());
   const saved=await persist(next,selected.map(item=>item.bytes));if(!current())return;put(saved);await reloadPreviews(saved);
  }catch(error){if(current())setNotice(error instanceof Error&&error.message==='camera_permission_required'?(zh?'请在系统设置中允许相机访问。':'Allow camera access in Settings.'):error instanceof Error&&error.message==='library_permission_required'?(zh?'请在系统设置中允许照片访问。':'Allow photo access in Settings.'):(zh?'照片未能加入，已保留原草稿。':'Could not add photos. Your draft is kept.'));}
  finally{operation.current=false;if(alive.current)setBusy(false);}
 };
 const close=async()=>{
  if(operation.current)return;operation.current=true;setBusy(true);if(timer.current)clearTimeout(timer.current);
  try{if(live.current)await persist(live.current);router.canGoBack()?router.back():router.replace('/' as never);}
  catch{setNotice(zh?'草稿尚未保存，请重试。':'Draft is not saved yet. Please retry.');}
  finally{operation.current=false;if(alive.current)setBusy(false);}
 };
 const publish=async()=>{
  const initial=live.current;if(!initial||operation.current)return;operation.current=true;setBusy(true);setNotice('');if(timer.current)clearTimeout(timer.current);
  const owner=initial.ownerId,current=()=>alive.current&&context.current===owner;
  try{
   await persist(initial);const postId=await publishSocialDraft(owner,initial.id,socialDraftStore,createSocialTransport(owner,current));
   if(current()){live.current=null;router.replace(`/community/${postId}` as never);}
  }catch{if(current()){const saved=await socialDraftStore.read(owner,initial.id).catch(()=>null);if(saved){revision.current.set(saved.id,saved.revision);put(saved);}setNotice(zh?'发布未完成，草稿已保留。请检查连接和参与资格后重试。':'Post not completed. Your draft is kept. Check connection and contributor eligibility, then retry.');}}
  finally{operation.current=false;if(alive.current)setBusy(false);}
 };
 const locked=busy||draft?.phase==='publishing';
 const publishDisabled=busy||!draft||!draft.body.trim()||(!draft.catId&&!draft.communitySlug)||draft.ownerId!==auth.owner;
 return <ScreenScaffold compact avoidKeyboard title={zh?'发布帖子':'New post'} header={<View style={[s.row,{justifyContent:'space-between'}]}>
  <Pressable accessibilityRole="button" accessibilityLabel={zh?'保存并关闭':'Save and close'} disabled={busy} onPress={()=>void close()} style={s.touch}><Text style={{fontSize:15,color:c.actionPrimary}}>{zh?'取消':'Cancel'}</Text></Pressable>
  <Text accessibilityRole="header" style={{fontSize:17,fontWeight:'600',color:c.ink}}>{zh?'发布帖子':'New post'}</Text>
  <Pressable accessibilityRole="button" accessibilityLabel={zh?'发布':'Post'} disabled={publishDisabled} onPress={()=>void publish()} style={[s.publish,{backgroundColor:c.actionPrimary,opacity:publishDisabled ? 0.5 : 1}]}>{busy?<ActivityIndicator color={c.onAction}/>:<Text style={{color:c.onAction,fontWeight:'600'}}>{zh?'发布':'Post'}</Text>}</Pressable>
 </View>}>
  {auth.owner===undefined&&!auth.failed?<ActivityIndicator/>:null}
  {auth.failed?<Pressable onPress={()=>void auth.reload()} style={s.touch}><Text style={{color:c.actionPrimary}}>{zh?'重试账户连接':'Retry account connection'}</Text></Pressable>:null}
  {auth.owner===null?<Pressable onPress={()=>router.push('/profile' as never)} style={s.touch}><Text style={{color:c.actionPrimary}}>{zh?'登录后发布':'Sign in to post'}</Text></Pressable>:null}
  {draft&&draft.ownerId===auth.owner?<>
   <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:10}}>{draft.images.map((image,index)=><View key={image.id} style={{width:92,gap:4}}>{previews[image.id]?<Image source={{uri:previews[image.id]}} style={s.photo}/>:<View style={[s.photo,{backgroundColor:c.surface}]}/>}<View style={s.row}><Pressable accessibilityRole="button" accessibilityLabel={zh?'设为封面':'Make cover'} disabled={locked||index===0} onPress={()=>edit({images:[image,...draft.images.filter(i=>i.id!==image.id)]})} style={[s.touch,{flex:1}]}><Text style={{fontSize:12,color:c.actionPrimary}}>{index===0?(zh?'封面':'Cover'):(zh?'设为封面':'Make cover')}</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={zh?'移除照片':'Remove photo'} disabled={locked} onPress={()=>edit({images:draft.images.filter(i=>i.id!==image.id)})} style={s.touch}><AppIcon name="close" size={16} color={c.muted}/></Pressable></View></View>)}</ScrollView>
   <View style={s.row}><Pressable accessibilityRole="button" disabled={locked||draft.images.length>=6} onPress={()=>void add('library')} style={[s.touch,s.action]}><AppIcon name="photo" size={20} color={c.actionPrimary}/><Text style={{color:c.actionPrimary}}>{zh?'照片':'Photos'} · {draft.images.length}/6</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={zh?'拍照':'Camera'} disabled={locked||draft.images.length>=6} onPress={()=>void add('camera')} style={s.touch}><AppIcon name="camera" color={c.actionPrimary}/></Pressable></View>
   <TextInput accessibilityLabel={zh?'标题':'Title'} placeholder={zh?'标题（可选）':'Title (optional)'} placeholderTextColor={c.muted} editable={!locked} value={draft.title} onChangeText={title=>edit({title})} maxLength={80} style={[s.title,{color:c.ink,borderColor:c.line}]}/>
   <TextInput accessibilityLabel={zh?'正文':'Caption'} placeholder={zh?'分享今天的发现…':'Share what you spotted…'} placeholderTextColor={c.muted} editable={!locked} value={draft.body} onChangeText={body=>edit({body})} multiline maxLength={2000} style={[s.body,{color:c.ink}]}/>
   <Pressable accessibilityRole="button" disabled={locked} onPress={()=>setPicker(true)} style={[s.touch,s.action,{borderTopWidth:StyleSheet.hairlineWidth,borderColor:c.line}]}><AppIcon name="location" color={c.actionPrimary}/><Text style={{flex:1,color:c.ink}}>{label(draft.communitySlug)??(zh?'选择邻里':'Choose neighbourhood')}</Text><AppIcon name="chevron" color={c.muted} size={16}/></Pressable>
   {draft.catId?<Text style={{fontSize:13,color:c.muted}}>{zh?'已关联所选猫咪':'Linked to the selected cat'}</Text>:null}
   {draft.phase==='publishing'?<Text style={{color:c.muted,fontSize:13}}>{zh?'正在确认上次发布；重试将继续同一帖子。':'Confirming the previous attempt. Retry continues the same post.'}</Text>:null}

  </>:null}
  {notice?<Text accessibilityLiveRegion="polite" style={{color:c.muted,fontSize:14}}>{notice}</Text>:null}
  <Modal visible={picker} animationType="slide" presentationStyle="pageSheet" onRequestClose={()=>setPicker(false)}><ScreenScaffold title={zh?'选择邻里':'Choose neighbourhood'} trailing={<Pressable onPress={()=>setPicker(false)} style={s.touch}><AppIcon name="close" color={c.ink}/></Pressable>}><TextInput accessibilityLabel={zh?'搜索邻里':'Search neighbourhood'} value={search} onChangeText={setSearch} placeholder={zh?'西海岸、金文泰…':'West Coast, Clementi…'} placeholderTextColor={c.muted} style={[s.title,{color:c.ink}]}/>{browseSingaporeCommunities(search).map(area=><Pressable accessibilityRole="button" key={area.id} onPress={()=>{edit({communitySlug:area.id});setPicker(false);}} style={s.touch}><Text style={{color:c.ink}}>{communityLabel(area,locale)}</Text></Pressable>)}</ScreenScaffold></Modal>
 </ScreenScaffold>;
}
const s=StyleSheet.create({touch:{minWidth:44,minHeight:44,justifyContent:'center'},row:{flexDirection:'row',alignItems:'center',gap:8},action:{flexDirection:'row',alignItems:'center',gap:8,paddingVertical:10,paddingHorizontal:4},photo:{width:92,height:116,borderRadius:12},title:{fontSize:15,fontWeight:'500',minHeight:44,borderBottomWidth:StyleSheet.hairlineWidth},body:{fontSize:15,lineHeight:23,minHeight:120,textAlignVertical:'top'},publish:{minWidth:66,paddingHorizontal:12,minHeight:44,borderRadius:14,alignItems:'center',justifyContent:'center'}});

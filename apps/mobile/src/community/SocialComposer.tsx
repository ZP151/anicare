import {Gesture,GestureDetector,GestureHandlerRootView} from 'react-native-gesture-handler';
import {ComposerPhotoGrid} from './ComposerPhotoGrid';
import {movePhoto} from './photo-order';
import {randomUUID} from 'expo-crypto';
import {useLocalSearchParams,useRouter} from 'expo-router';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {ActivityIndicator,AppState,Modal,Pressable,StyleSheet,Text,TextInput,View} from 'react-native';
import {useAccountSession} from '../auth/use-account-session';
import {AppIcon} from '../components/AppIcon';
import {ScreenScaffold} from '../components/ScreenScaffold';
import {useNativeColors} from '../design/native-colors';
import {useLocale} from '../i18n/LocaleContext';
import {browseSingaporeCommunities,communityLabel,neighbourhoodForCoordinate,SG_COMMUNITIES} from '../maps/singapore-communities';
import {requestDeviceLocation} from '../maps/device-location';
import {createSocialDraft,editSocialDraft,isSocialId,type SocialDraft,type SocialDraftEdit} from './post-draft';
import {socialDraftStore} from './post-draft-store';
import type {SocialImageBytes} from './post-draft-storage';
import {createSocialPreviewScope,selectSocialImages} from './post-images';
import {publishSocialDraft} from './post-publisher';
import {createSocialTransport} from './post-transport';

export function SocialComposer(){
 const auth=useAccountSession(),router=useRouter(),{locale}=useLocale(),c=useNativeColors(),zh=locale==='zh-CN';
 const params=useLocalSearchParams<{draftId?:string;communitySlug?:string;catId?:string}>();
 const [draft,setDraft]=useState<SocialDraft|null>(null),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[picker,setPicker]=useState(false),[search,setSearch]=useState(''),[previews,setPreviews]=useState<Record<string,string>>({}),[locating,setLocating]=useState(false),[locationNotice,setLocationNotice]=useState('');
 const [dragging,setDragging]=useState(false);
 const scrollGesture=useMemo(()=>Gesture.Native().withTestId('composer-scroll'),[]);
 const locatedDraft=useRef<string|null>(null),manualArea=useRef(false),pendingArea=useRef<string|null>(null);
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
  for(const image of snapshot.images){
   if(!alive.current||context.current!==snapshot.ownerId||scope.current!==next)return;
   try{
    const bytes=await socialDraftStore.readImage(snapshot.ownerId,snapshot.id,image.id);
    if(!alive.current||context.current!==snapshot.ownerId||scope.current!==next)return;
    urls[image.id]=next.preview(bytes.thumb);
   }catch{/* Keep other images usable; the failed thumbnail has an explicit retry. */}
  }
  if(alive.current&&context.current===snapshot.ownerId&&scope.current===next)setPreviews(urls);
 },[]);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;if(timer.current)clearTimeout(timer.current);const last=live.current;if(last&&last.phase==='editing'&&!operation.current)void persist(last).catch(()=>{});scope.current.dispose();};},[persist]);
 useEffect(()=>{
  let active=true;pendingArea.current=null;manualArea.current=false;live.current=null;setDraft(null);setDragging(false);setPreviews({});setNotice('');scope.current.dispose();scope.current=createSocialPreviewScope();
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
  const old=live.current;if(!alive.current||!old||context.current!==old.ownerId||old.phase!=='editing'||operation.current)return;
  const next=editSocialDraft(old,patch,new Date().toISOString());put(next);setNotice('');
  if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(()=>void persist(next).catch(()=>{if(alive.current)setNotice(zh?'草稿尚未保存，请重试。':'Draft is not saved yet. Please retry.');}),450);
 };
 useEffect(()=>{
  if(!draft||params.draftId||draft.communitySlug||locatedDraft.current===draft.id)return;
  const id=draft.id,owner=draft.ownerId;locatedDraft.current=id;manualArea.current=false;let active=true;
  setLocating(true);
  void requestDeviceLocation().then(result=>{
   if(!active||!alive.current||context.current!==owner||live.current?.id!==id||manualArea.current||live.current.communitySlug)return;
   const area=result.kind==='granted'?neighbourhoodForCoordinate(result.latitude,result.longitude):null;
   if(area){if(operation.current)pendingArea.current=area.id;else edit({communitySlug:area.id});}
   else setLocationNotice(zh?'未能确定邻里，请手动选择。':'Choose a neighbourhood; current location is unavailable.');
  }).catch(()=>{if(active&&context.current===owner)setLocationNotice(zh?'暂时无法定位，请选择邻里。':'Location unavailable. Choose a neighbourhood.');})
    .finally(()=>{if(active)setLocating(false);});
  return()=>{active=false;};
 },[draft?.id]);
 const add=async(source:'camera'|'library')=>{
  const old=live.current;if(!old||old.phase!=='editing'||operation.current)return;
  operation.current=true;setBusy(true);if(timer.current)clearTimeout(timer.current);
  const owner=old.ownerId,current=()=>alive.current&&context.current===owner;
  let reloaded=false;
  try{
   await persist(old);const selected=await selectSocialImages(source,6-old.images.length,current);if(!current()||!selected.length)return;
   const next=editSocialDraft(live.current!,{images:[...live.current!.images,...selected.map(item=>item.image)]},new Date().toISOString());
   const saved=await persist(next,selected.map(item=>item.bytes));if(!current())return;put(saved);await reloadPreviews(saved);reloaded=true;
  }catch(error){if(current())setNotice(error instanceof Error&&error.message==='camera_permission_required'?(zh?'请在系统设置中允许相机访问。':'Allow camera access in Settings.'):error instanceof Error&&error.message==='library_permission_required'?(zh?'请在系统设置中允许照片访问。':'Allow photo access in Settings.'):(zh?'照片未能加入，已保留原草稿。':'Could not add photos. Your draft is kept.'));}
  finally{if(!reloaded&&current()&&live.current)await reloadPreviews(live.current);operation.current=false;if(alive.current){setBusy(false);if(current()&&pendingArea.current&&!manualArea.current&&live.current?.ownerId===owner&&!live.current.communitySlug){edit({communitySlug:pendingArea.current});}pendingArea.current=null;}}
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
 const publishDisabled=busy||dragging||!draft||!draft.body.trim()||(!draft.catId&&!draft.communitySlug)||draft.ownerId!==auth.owner;
 return <GestureHandlerRootView style={{flex:1}}><ScreenScaffold compact avoidKeyboard scrollEnabled={!dragging} wrapScroll={scroll=><GestureDetector gesture={scrollGesture}>{scroll}</GestureDetector>} title={zh?'发布帖子':'New post'} header={<View style={[s.row,{justifyContent:'space-between'}]}>
  <Pressable accessibilityRole="button" accessibilityLabel={zh?'保存并关闭':'Save and close'} disabled={busy||dragging} onPress={()=>void close()} style={s.touch}><Text style={{fontSize:15,color:c.actionPrimary}}>{zh?'取消':'Cancel'}</Text></Pressable>
  <Text accessibilityRole="header" style={{fontSize:17,fontWeight:'600',color:c.ink}}>{zh?'发布帖子':'New post'}</Text>
  <Pressable accessibilityRole="button" accessibilityLabel={zh?'发布':'Post'} disabled={publishDisabled} onPress={()=>void publish()} style={[s.publish,{backgroundColor:c.actionPrimary,opacity:publishDisabled ? 0.5 : 1}]}>{busy?<ActivityIndicator color={c.onAction}/>:<Text style={{color:c.onAction,fontWeight:'600'}}>{zh?'发布':'Post'}</Text>}</Pressable>
 </View>}>
  {auth.owner===undefined&&!auth.failed?<ActivityIndicator/>:null}
  {auth.failed?<Pressable onPress={()=>void auth.reload()} style={s.touch}><Text style={{color:c.actionPrimary}}>{zh?'重试账户连接':'Retry account connection'}</Text></Pressable>:null}
  {auth.owner===null?<Pressable onPress={()=>router.push('/profile' as never)} style={s.touch}><Text style={{color:c.actionPrimary}}>{zh?'登录后发布':'Sign in to post'}</Text></Pressable>:null}
  {draft&&draft.ownerId===auth.owner?<>
   <ComposerPhotoGrid scrollGesture={scrollGesture} key={`${draft.ownerId}:${draft.id}`} images={draft.images} previews={previews} locked={locked} zh={zh} onDragging={setDragging}
    onMove={(id,to)=>{const current=live.current;if(alive.current&&current&&current.ownerId===context.current)edit({images:movePhoto(current.images,current.images.findIndex(image=>image.id===id),to)});}}
    onRemove={id=>edit({images:draft.images.filter(image=>image.id!==id)})} onCover={id=>edit({images:movePhoto(draft.images,draft.images.findIndex(image=>image.id===id),0)})}
    onAdd={()=>void add('library')} onRetry={()=>void reloadPreviews(draft)} onPreviewError={id=>setPreviews(old=>{const next={...old};delete next[id];return next;})}/>
   <View style={s.row}><Pressable accessibilityRole="button" disabled={locked||dragging||draft.images.length>=6} onPress={()=>void add('library')} style={[s.touch,s.action]}><AppIcon name="photo" size={20} color={c.actionPrimary}/><Text style={{color:c.actionPrimary}}>{zh?'照片':'Photos'} · {draft.images.length}/6</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={zh?'拍照':'Camera'} disabled={locked||dragging||draft.images.length>=6} onPress={()=>void add('camera')} style={s.touch}><AppIcon name="camera" color={c.actionPrimary}/></Pressable></View>
   <TextInput accessibilityLabel={zh?'标题':'Title'} placeholder={zh?'标题（可选）':'Title (optional)'} placeholderTextColor={c.muted} editable={!locked&&!dragging} value={draft.title} onChangeText={title=>edit({title})} maxLength={80} style={[s.title,{color:c.ink,borderColor:c.line}]}/>
   <TextInput accessibilityLabel={zh?'正文':'Caption'} placeholder={zh?'分享今天的发现…':'Share what you spotted…'} placeholderTextColor={c.muted} editable={!locked&&!dragging} value={draft.body} onChangeText={body=>edit({body})} multiline maxLength={2000} style={[s.body,{color:c.ink}]}/>
   <Pressable accessibilityRole="button" disabled={locked||dragging} onPress={()=>setPicker(true)} style={[s.touch,s.action,{borderTopWidth:StyleSheet.hairlineWidth,borderColor:c.line}]}><AppIcon name="location" color={c.actionPrimary}/><Text style={{flex:1,color:c.ink}}>{label(draft.communitySlug)??(locating?(zh?'正在定位…':'Finding your neighbourhood…'):(zh?'选择邻里':'Choose neighbourhood'))}</Text><AppIcon name="chevron" color={c.muted} size={16}/></Pressable>
   {locationNotice&&!draft.communitySlug?<Text style={{fontSize:12,color:c.muted}}>{locationNotice}</Text>:null}
   {draft.catId?<Text style={{fontSize:13,color:c.muted}}>{zh?'已关联所选猫咪':'Linked to the selected cat'}</Text>:null}
   {draft.phase==='publishing'?<Text style={{color:c.muted,fontSize:13}}>{zh?'正在确认上次发布；重试将继续同一帖子。':'Confirming the previous attempt. Retry continues the same post.'}</Text>:null}

  </>:null}
  {notice?<Text accessibilityLiveRegion="polite" style={{color:c.muted,fontSize:14}}>{notice}</Text>:null}
  <Modal visible={picker} animationType="slide" presentationStyle="pageSheet" onRequestClose={()=>setPicker(false)}><ScreenScaffold title={zh?'选择邻里':'Choose neighbourhood'} trailing={<Pressable onPress={()=>setPicker(false)} style={s.touch}><AppIcon name="close" color={c.ink}/></Pressable>}><TextInput accessibilityLabel={zh?'搜索邻里':'Search neighbourhood'} value={search} onChangeText={setSearch} placeholder={zh?'西海岸、金文泰…':'West Coast, Clementi…'} placeholderTextColor={c.muted} style={[s.title,{color:c.ink}]}/>{browseSingaporeCommunities(search).map(area=><Pressable accessibilityRole="button" key={area.id} onPress={()=>{manualArea.current=true;edit({communitySlug:area.id});setPicker(false);}} style={s.touch}><Text style={{color:c.ink}}>{communityLabel(area,locale)}</Text></Pressable>)}</ScreenScaffold></Modal>
 </ScreenScaffold></GestureHandlerRootView>;
}
const s=StyleSheet.create({touch:{minWidth:44,minHeight:44,justifyContent:'center'},row:{flexDirection:'row',alignItems:'center',gap:8},action:{flexDirection:'row',alignItems:'center',gap:8,paddingVertical:10,paddingHorizontal:4},title:{fontSize:15,fontWeight:'500',minHeight:44,borderBottomWidth:StyleSheet.hairlineWidth},body:{fontSize:15,lineHeight:23,minHeight:120,textAlignVertical:'top'},publish:{minWidth:66,paddingHorizontal:12,minHeight:44,borderRadius:14,alignItems:'center',justifyContent:'center'}});

import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { getMyStoryCatLink, changeMyStoryCatLink, type StoryCatLink, type StoryCatLinkRequest } from '../api/story-cat-link';
import { getPublicCatSummary } from '../api/cats';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { useNativeColors } from '../design/native-colors';
import type { Locale } from '../i18n/catalog';
import { localizedCatName } from '../i18n/cat-name';
import { SG_COMMUNITIES, communityLabel } from '../maps/singapore-communities';
import { CatPicker } from './CatPicker';

type Props={postId:string;owner:string;locale:Locale;pin:()=>()=>Promise<boolean>;onClose():void;onChanged():void|Promise<void>};
/** The parent keys this editor by account and post. An uncertain write freezes its original request. */
export function StoryCatLinkEditor({postId,owner,locale,pin,onClose,onChanged}:Props){
 const c=useNativeColors(),zh=locale==='zh-CN';
 const [baseline,setBaseline]=useState<StoryCatLink|null>(null),[selected,setSelected]=useState<string|null>(null),[area,setArea]=useState<string|null>(null),[name,setName]=useState('');
 const [loading,setLoading]=useState(true),[picker,setPicker]=useState(false),[areaPicker,setAreaPicker]=useState(false),[busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[unavailable,setUnavailable]=useState(false),[notice,setNotice]=useState('');
 const pending=useRef<StoryCatLinkRequest|null>(null),operation=useRef(false),generation=useRef(0),alive=useRef(true);
 const scope=`${owner}:${postId}`,scopeRef=useRef(scope);scopeRef.current=scope;
 const refresh=async()=>{
  const token=++generation.current,current=pin();setLoading(true);setBaseline(null);setName('');
  try{const value=await getMyStoryCatLink(postId);if(alive.current&&token===generation.current&&scope===scopeRef.current&&await current()){setBaseline(value);setSelected(value.catId);setArea(value.communitySlug);setUnavailable(false);}}
  catch(error){if(alive.current&&token===generation.current&&await current()){setUnavailable(error instanceof Error&&error.message==='story_link_unavailable');setNotice(zh?'暂时无法编辑这篇帖子的关联。':'This story link cannot be edited right now.');}}
  finally{if(alive.current&&token===generation.current)setLoading(false);}
 };
 useEffect(()=>{alive.current=true;void refresh();return()=>{alive.current=false;generation.current++;};},[owner,postId]);
 useEffect(()=>{let active=true;setName('');if(selected)void getPublicCatSummary(selected).then(value=>{if(active)setName(value?localizedCatName(selected,value.primaryAlias,locale):(zh?'原关联猫暂不可用':'Linked cat unavailable'));}).catch(()=>{if(active)setName(zh?'猫资料暂不可用':'Cat details unavailable');});return()=>{active=false;};},[selected,locale]);
 const save=async()=>{
  if(operation.current||!baseline||unavailable)return;operation.current=true;setBusy(true);setNotice('');const current=pin(),captured=scope;
  const valid=async()=>alive.current&&captured===scopeRef.current&&await current();
  try{
   if(!await valid())return;
   pending.current??={...baseline,catId:selected,communitySlug:area,requestId:randomUUID()};
   await changeMyStoryCatLink(pending.current);
   if(!await valid())return;
   // Re-read after a replay: its recorded result may predate a newer device's edit.
   await getMyStoryCatLink(postId);if(!await valid())return;
   pending.current=null;setUncertain(false);await onChanged();if(await valid())onClose();
  }catch(error){if(await valid()){
   const reason=error instanceof Error?error.message:'';
   if(['story_link_conflict','cat_unavailable','neighbourhood_required','story_link_unavailable','idempotency_conflict','invalid_story_link_request'].includes(reason)){
    pending.current=null;setUncertain(false);
    if(reason==='story_link_unavailable'){setUnavailable(true);setBaseline(null);setNotice(zh?'这篇帖子已不可编辑。':'This post is no longer editable.');}
    else{await refresh();if(await valid())setNotice(reason==='story_link_conflict'?(zh?'关联已在另一台设备更改，请查看后重新选择。':'This link changed on another device. Review it and choose again.'):(zh?'未能关联，请重新选择猫咪或邻里。':'Could not link this cat. Choose a cat or neighbourhood again.'));}
   }else{setUncertain(true);setNotice(zh?'尚未确认保存结果。重试会继续同一次更改。':'Save is not confirmed. Retry continues the same change.');}
  }}finally{operation.current=false;if(alive.current)setBusy(false);}
 };
 const button=(label:string,action:()=>void,disabled=false,primary=false)=><Pressable accessibilityRole="button" disabled={disabled} onPress={action} style={{minHeight:46,borderRadius:23,paddingHorizontal:16,justifyContent:'center',alignItems:'center',backgroundColor:primary?c.actionPrimary:c.surface,borderWidth:primary?0:1,borderColor:c.line,opacity:disabled?.45:1}}><Text style={{color:primary?c.onAction:c.ink,fontSize:15,fontWeight:'500'}}>{label}</Text></Pressable>;
 if(picker)return <CatPicker selectedCatId={selected} communitySlug={area} owner={owner} locale={locale} onConfirm={id=>{setSelected(id);setPicker(false);if(id===null&&!area)setAreaPicker(true);}} onCancel={()=>setPicker(false)}/>;
 if(areaPicker)return <ScreenScaffold compact title={zh?'选择邻里':'Choose neighbourhood'}>{button(zh?'返回':'Back',()=>setAreaPicker(false))}{SG_COMMUNITIES.map(value=><Pressable key={value.id} accessibilityRole="button" onPress={()=>{setArea(value.id);setAreaPicker(false);}} style={{minHeight:46,justifyContent:'center'}}><Text style={{color:c.ink}}>{communityLabel(value,locale)}</Text></Pressable>)}</ScreenScaffold>;
 const changed=baseline&&(baseline.catId!==selected||baseline.communitySlug!==area);
 return <ScreenScaffold compact title={zh?'关联猫咪':'Link this story'} trailing={button(zh?'取消':'Cancel',onClose,busy)}><View style={{gap:16,paddingVertical:8}}>
  <Text style={{fontSize:14,lineHeight:21,color:c.muted}}>{zh?'选出故事中的猫，让邻居在它的主页找到这篇帖子。':'Choose the cat in your story so neighbours can find it on their home.'}</Text>
  {loading?<ActivityIndicator/>:baseline?<>
   <View style={{padding:16,borderRadius:18,backgroundColor:c.surface,gap:12}}><Text style={{color:c.ink,fontSize:17,fontWeight:'600'}}>{selected?(name||(zh?'正在读取猫资料…':'Reading cat details…')):(zh?'未关联单只猫':'No single cat linked')}</Text>{button(zh?'选择猫咪':'Choose cat',()=>setPicker(true),busy||uncertain)}</View>
   {!selected&&!baseline.communitySlug?button(area?(SG_COMMUNITIES.find(a=>a.id===area)?communityLabel(SG_COMMUNITIES.find(a=>a.id===area)!,locale):area):(zh?'选择邻里':'Choose neighbourhood'),()=>setAreaPicker(true),busy||uncertain):null}
   {button(uncertain?(zh?'重试保存':'Retry save'):(zh?'保存关联':'Save link'),()=>void save(),busy||(!uncertain&&(!changed||(!selected&&!area))),true)}
  </>:!unavailable?button(zh?'重试':'Retry',()=>void refresh()):null}
  {notice?<Text accessibilityLiveRegion="polite" style={{color:c.muted,fontSize:14,lineHeight:21}}>{notice}</Text>:null}
 </View></ScreenScaffold>;
}

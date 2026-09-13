import {useCallback,useRef,useState} from 'react';
import {Pressable,Text,View} from 'react-native';
import {useFocusEffect,useRouter} from 'expo-router';
import {listMyStoryLinkRepairs,type StoryLinkRepair} from '../api/story-cat-link';
import {useNativeColors} from '../design/native-colors';
import type {Locale} from '../i18n/catalog';
type Props={owner:string;locale:Locale;pin:()=>()=>Promise<boolean>;refreshToken?:number};
export function StoryLinkRepairs({owner,locale,pin,refreshToken=0}:Props){
 const c=useNativeColors(),router=useRouter(),zh=locale==='zh-CN';const [items,setItems]=useState<readonly StoryLinkRepair[]>([]),[failed,setFailed]=useState(false),[expanded,setExpanded]=useState(false),[loading,setLoading]=useState(false),[cursor,setCursor]=useState<string|null>(null);
 const generation=useRef(0),active=useRef(false),busy=useRef(false);
 const load=async(more=false)=>{if(busy.current)return;busy.current=true;setLoading(true);const token=++generation.current,current=pin();if(!more)setItems([]);
  try{const page=await listMyStoryLinkRepairs(more?cursor:null);if(active.current&&token===generation.current&&await current()){setItems(old=>more?[...new Map([...old,...page.items].map(item=>[item.postId,item])).values()]:page.items);setCursor(page.nextCursor);setFailed(false);}}
  catch{if(active.current&&token===generation.current&&await current())setFailed(true);}
  finally{if(active.current&&token===generation.current){busy.current=false;setLoading(false);}}
 };const ref=useRef(load);ref.current=load;
 useFocusEffect(useCallback(()=>{active.current=true;busy.current=false;void ref.current();return()=>{active.current=false;generation.current++;};},[owner,refreshToken]));
 if(!items.length&&!failed)return null;
 return <View style={{gap:8,padding:12,borderWidth:1,borderColor:c.line,borderRadius:16}}>
  <Text style={{fontSize:14,fontWeight:'600',color:c.ink}}>{zh?'这些故事的猫关联需要更新':'These stories need a new cat link'}</Text>
  {(expanded?items:items.slice(0,2)).map(item=><Pressable accessibilityRole="button" key={item.postId} onPress={()=>router.push(`/community/${item.postId}?editCat=1` as never)} style={{minHeight:44,justifyContent:'center',gap:3}}><Text numberOfLines={1} style={{fontSize:14,color:c.actionPrimary}}>{item.title}</Text><Text style={{fontSize:12,color:c.muted}}>{new Date(item.createdAt).toLocaleDateString(zh?'zh-SG':'en-SG')}</Text></Pressable>)}
  {items.length>2&&!expanded?<Pressable accessibilityRole="button" onPress={()=>setExpanded(true)} style={{minHeight:44,justifyContent:'center'}}><Text style={{color:c.actionPrimary}}>{zh?'展开':'Show more'}</Text></Pressable>:null}
  {failed||expanded&&cursor?<Pressable accessibilityRole="button" disabled={loading} onPress={()=>void load(!failed)} style={{minHeight:44,justifyContent:'center'}}><Text style={{color:c.actionPrimary}}>{failed?(zh?'重试读取关联':'Retry story links'):(zh?'载入更多':'Load more')}</Text></Pressable>:null}
 </View>;
}

import {useEffect,useRef,useState} from 'react';
import {Alert,Pressable,Text,View} from 'react-native';
import {useNativeColors} from '../design/native-colors';
import {AppIcon} from './AppIcon';
export type ManagedDraftItem=Readonly<{id:string;title:string;accessibilityLabel?:string;detail:string;updatedAt:string;kind:'photo'|'text'|'pending';canDelete:boolean}>;
export function ManagedDraftList({items,zh,onOpen,onDelete,isCurrent}:Readonly<{items:readonly ManagedDraftItem[];zh:boolean;onOpen(id:string):void;onDelete(id:string):Promise<void>;isCurrent():Promise<boolean>}>){
 const c=useNativeColors(),alive=useRef(true),working=useRef(false),prompting=useRef(false);
 const [filter,setFilter]=useState('all'),[oldest,setOldest]=useState(false),[selecting,setSelecting]=useState(false),[selected,setSelected]=useState<readonly string[]>([]),[removed,setRemoved]=useState<readonly string[]>([]),[busy,setBusy]=useState(false),[failed,setFailed]=useState(false);
 useEffect(()=>()=>{alive.current=false;},[]);
 const visible=items.filter(item=>!removed.includes(item.id)&&(filter==='all'||item.kind===filter)).sort((a,b)=>(oldest?1:-1)*a.updatedAt.localeCompare(b.updatedAt));
 const toggle=(item:ManagedDraftItem)=>{if(busy||!item.canDelete)return;setSelected(ids=>ids.includes(item.id)?ids.filter(id=>id!==item.id):[...ids,item.id]);};
 const remove=()=>{
  const ids=selected.filter(id=>items.some(item=>item.id===id&&item.canDelete));if(!ids.length||working.current||prompting.current)return;prompting.current=true;
  Alert.alert(zh?`删除 ${ids.length} 份草稿？`:`Delete ${ids.length} drafts?`,zh?'照片和未发布内容将从此设备删除。':'Photos and unpublished content will be removed from this device.',[{text:zh?'取消':'Cancel',style:'cancel',onPress:()=>{prompting.current=false;}},{text:zh?'删除':'Delete',style:'destructive',onPress:()=>{void(async()=>{
   prompting.current=false;if(working.current||!alive.current)return;working.current=true;setBusy(true);setFailed(false);const done:string[]=[];let failure=false;
   try{for(const id of ids){if(!alive.current||!await isCurrent()){failure=true;break;}try{await onDelete(id);done.push(id);}catch{failure=true;}}}
   catch{failure=true;}
   finally{working.current=false;if(alive.current){setRemoved(previous=>[...previous,...done]);setSelected(previous=>previous.filter(id=>!done.includes(id)));setFailed(failure);setBusy(false);}}
  })();}}],{cancelable:true,onDismiss:()=>{prompting.current=false;}});
 };
 const button=(text:string,fn:()=>void,label?:string,disabled=busy)=><Pressable accessibilityRole="button" accessibilityLabel={label??text} disabled={disabled} onPress={fn} style={{minHeight:44,minWidth:44,justifyContent:'center',opacity:disabled?0.4:1}}><Text style={{color:c.actionPrimary,fontSize:14}}>{text}</Text></Pressable>;
 const groups=new Map<string,ManagedDraftItem[]>();const today=new Date();today.setHours(0,0,0,0);
 for(const item of visible){const days=(today.getTime()-Date.parse(item.updatedAt))/86400000;const group=days<0?(zh?'今天':'Today'):days<7?(zh?'最近七天':'Last seven days'):(zh?'更早':'Earlier');groups.set(group,[...(groups.get(group)??[]),item]);}
 return <View style={{gap:10}}>
  <View style={{flexDirection:'row',flexWrap:'wrap',gap:14}}>{[['all',zh?'全部':'All'],['photo',zh?'有照片':'Photos'],['text',zh?'纯文字':'Text'],['pending',zh?'待确认':'Pending']].map(([value,label])=><Pressable key={value} accessibilityRole="button" accessibilityLabel={zh?`筛选${label}`:`Filter ${value==='photo'?'photos':value}`}  accessibilityState={{selected:filter===value}} disabled={busy} onPress={()=>{setFilter(value!);setSelected([]);}} style={{minHeight:44,justifyContent:'center',borderBottomWidth:filter===value?2:0,borderColor:c.actionPrimary}}><Text style={{fontSize:14,color:filter===value?c.actionPrimary:c.muted}}>{label}</Text></Pressable>)}</View>
  <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}>{button(oldest?(zh?'最早优先':'Oldest first'):(zh?'最新优先':'Newest first'),()=>setOldest(value=>!value))}{button(selecting?(zh?'完成':'Done'):(zh?'选择':'Select'),()=>{setSelecting(value=>!value);setSelected([]);})}</View>
  {selecting?<View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}>{button(zh?'全选':'Select all',()=>setSelected(visible.filter(item=>item.canDelete).map(item=>item.id)))}<Text style={{color:c.muted,fontSize:13}}>{selected.length} {zh?'项已选':'selected'}</Text>{button(zh?'删除所选':'Delete selected',remove,zh?'删除所选':'Delete selected',busy||!selected.length)}</View>:null}
  {failed?<Text accessibilityRole="alert" style={{color:c.danger,fontSize:13}}>{zh?'部分草稿未删除，已保留，可重试。':'Some drafts could not be deleted. They are kept; retry.'}</Text>:null}
  {!visible.length?<Text style={{color:c.muted,fontSize:14,paddingVertical:20}}>{zh?'此分类暂无草稿':'No drafts in this category'}</Text>:null}
  {[...groups].map(([label,rows])=><View key={label} style={{gap:4}}><Text accessibilityRole="header" style={{fontSize:12,color:c.muted,paddingTop:10}}>{label}</Text>{rows.map(item=><Pressable key={item.id} accessibilityRole="button" accessibilityLabel={item.accessibilityLabel??item.title} accessibilityState={{selected:selected.includes(item.id),disabled:busy||(selecting&&!item.canDelete)}} disabled={busy||(selecting&&!item.canDelete)} onLongPress={()=>{if(item.canDelete){setSelecting(true);toggle(item);}}} onPress={()=>selecting?toggle(item):onOpen(item.id)} style={{flexDirection:'row',alignItems:'center',gap:12,minHeight:76,paddingVertical:10,borderBottomWidth:0.5,borderColor:c.line}}>
   <AppIcon name={selecting?(selected.includes(item.id)?'check':'plus'):item.kind==='photo'?'photo':item.kind==='pending'?'activity':'reports'} color={selected.includes(item.id)?c.actionPrimary:c.muted} size={20}/><View style={{flex:1,gap:4}}><Text numberOfLines={2} style={{fontSize:15,fontWeight:'500',color:c.ink}}>{item.title}</Text><Text numberOfLines={2} style={{fontSize:12,color:c.muted}}>{item.detail} · {new Date(item.updatedAt).toLocaleDateString(zh?'zh-SG':'en-SG',{month:'short',day:'numeric'})}</Text></View>{!selecting?<AppIcon name="chevron" color={c.muted} size={14}/>:null}
  </Pressable>)}</View>)}
 </View>;
}

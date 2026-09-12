import {useEffect,useRef,useState} from 'react';
import {ActivityIndicator,AppState,Image,Modal,Pressable,ScrollView,Text,View} from 'react-native';
import {SafeAreaProvider,SafeAreaView,initialWindowMetrics} from 'react-native-safe-area-context';
import {AppIcon,type AppIconName} from '../components/AppIcon';
import {createSocialPreviewScope,editSocialImage,type PreparedSocialImage} from './post-images';
import {ORIGINAL_EDIT,type PhotoEdit} from './photo-edit';
import type {SocialImage} from './post-draft';
export function ComposerPhotoEditor({image,uri,zh,onClose,onSave}:Readonly<{image:SocialImage;uri:string;zh:boolean;onClose():void;onSave(photo:PreparedSocialImage):Promise<void>}>){
 const [edit,setEdit]=useState<PhotoEdit>(ORIGINAL_EDIT),[preview,setPreview]=useState(uri),[prepared,setPrepared]=useState<PreparedSocialImage|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(false);
 const [frame,setFrame]=useState({width:1,height:1});const alive=useRef(true),working=useRef(false),scope=useRef(createSocialPreviewScope());
 useEffect(()=>{alive.current=true;const sub=AppState.addEventListener('change',state=>{if(state==='background'){alive.current=false;scope.current.dispose();onClose();}});return()=>{alive.current=false;scope.current.dispose();sub.remove();};},[]);
 const apply=async(next:PhotoEdit)=>{
  if(working.current)return;working.current=true;setBusy(true);setError(false);
  try{
   if(!next.turns&&!next.mirror&&next.ratio===null){setPreview(uri);setPrepared(null);setEdit(next);scope.current.dispose();scope.current=createSocialPreviewScope();return;}
   const result=await editSocialImage(uri,image.display.width,image.display.height,next,()=>alive.current);
   if(!alive.current)return;const nextScope=createSocialPreviewScope();let nextUri:string;try{nextUri=nextScope.preview(result.bytes.display);}catch(error){nextScope.dispose();throw error;}
   scope.current.dispose();scope.current=nextScope;setPrepared(result);setPreview(nextUri);setEdit(next);
  }catch{if(alive.current)setError(true);}finally{working.current=false;if(alive.current)setBusy(false);}
 };
 const save=async()=>{if(working.current)return;if(!prepared){onClose();return;}working.current=true;setBusy(true);try{await onSave(prepared);}catch{if(alive.current)setError(true);}finally{working.current=false;if(alive.current)setBusy(false);}};
 const action=(label:string,icon:AppIconName,fn:()=>void)=><Pressable key={label} accessibilityRole="button" accessibilityLabel={label} disabled={busy} onPress={fn} style={{minWidth:64,minHeight:52,alignItems:'center',justifyContent:'center',gap:5,opacity:busy?0.4:1}}><AppIcon name={icon} color="#fff" size={22}/><Text style={{color:'#fff',fontSize:12}}>{label}</Text></Pressable>;
 return <Modal visible presentationStyle="fullScreen" animationType="fade" onRequestClose={()=>{if(!busy)onClose();}}><SafeAreaProvider initialMetrics={initialWindowMetrics}><SafeAreaView style={{flex:1,backgroundColor:'#111'}} edges={['top','bottom','left','right']}>
 <View style={{flexDirection:'row',alignItems:'center',paddingHorizontal:16,minHeight:52}}><Pressable accessibilityRole="button" accessibilityLabel={zh?'关闭照片':'Close photo'} disabled={busy} onPress={onClose} style={{width:44,height:44,justifyContent:'center'}}><AppIcon name="close" color="#fff"/></Pressable><Text style={{flex:1,color:'#fff',fontWeight:'600',textAlign:'center'}}>{zh?'编辑照片':'Edit photo'}</Text><Pressable accessibilityRole="button" accessibilityLabel={zh?'保存照片':'Save photo'} disabled={busy} onPress={()=>void save()} style={{minWidth:44,height:44,justifyContent:'center',alignItems:'flex-end'}}><Text style={{color:'#8CB7FF',fontWeight:'600'}}>{zh?'完成':'Done'}</Text></Pressable></View>
 <View style={{flex:1,overflow:'hidden'}} onLayout={event=>{const {width,height}=event.nativeEvent.layout;if(width>0&&height>0)setFrame({width,height});}}><ScrollView key={preview+frame.width+frame.height} minimumZoomScale={1} maximumZoomScale={4} pinchGestureEnabled centerContent contentContainerStyle={frame}><Image accessibilityLabel={zh?'编辑预览':'Photo edit preview'} source={{uri:preview}} resizeMode="contain" style={frame}/></ScrollView>{busy?<View pointerEvents="none" style={{position:'absolute',top:0,bottom:0,left:0,right:0,justifyContent:'center'}}><ActivityIndicator color="#fff"/></View>:null}</View>
 {error?<Text accessibilityRole="alert" style={{color:'#fff',padding:12}}>{zh?'未能保存修改，请重试。原照片仍保留。':'Could not apply changes. Retry; your original photo is kept.'}</Text>:null}
 <Text style={{textAlign:'center',color:'#bbb',fontSize:12,paddingTop:10}}>{zh?'裁剪比例 · 居中裁剪':'Crop ratio · Centered crop'}</Text><View style={{flexDirection:'row',justifyContent:'center',gap:8}}>{([null,1,0.75,4/3] as const).map((ratio,index)=><Pressable key={index} accessibilityRole="button" accessibilityState={{selected:edit.ratio===ratio}} accessibilityLabel={`${zh?'裁剪':'Crop'} ${['Original','1:1','3:4','4:3'][index]}`} disabled={busy} onPress={()=>void apply({...edit,ratio})} style={{minWidth:60,minHeight:44,alignItems:'center',justifyContent:'center'}}><Text style={{color:edit.ratio===ratio?'#8CB7FF':'#fff',fontSize:14}}>{index===0?(zh?'原比例':'Original'):['','1:1','3:4','4:3'][index]}</Text></Pressable>)}</View>
 <View style={{flexDirection:'row',justifyContent:'space-evenly',paddingVertical:8}}>{action(zh?'旋转照片':'Rotate photo','rotate',()=>void apply({...edit,turns:(edit.turns+1)%4}))}{action(zh?'镜像照片':'Mirror photo','flip',()=>void apply({...edit,mirror:!edit.mirror}))}{action(zh?'重置本次':'Reset edits','reset',()=>void apply(ORIGINAL_EDIT))}</View>
 </SafeAreaView></SafeAreaProvider></Modal>;
}

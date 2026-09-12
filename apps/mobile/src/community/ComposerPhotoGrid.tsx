import {useEffect,useState} from 'react';
import {Image,Pressable,StyleSheet,Text,View,useWindowDimensions} from 'react-native';
import {Gesture,GestureDetector} from 'react-native-gesture-handler';
import Animated,{ReduceMotion,useAnimatedStyle,useSharedValue,withSpring,type SharedValue} from 'react-native-reanimated';
import {scheduleOnRN} from 'react-native-worklets';
import {AppIcon} from '../components/AppIcon';
import {useNativeColors} from '../design/native-colors';
import type {SocialImage} from './post-draft';
import {movePhoto,photoDropIndex} from './photo-order';

const GAP=12;
const settle={duration:400,dampingRatio:0.8,overshootClamping:true,reduceMotion:ReduceMotion.System};
type Props=Readonly<{
 scrollGesture:ReturnType<typeof Gesture.Native>;
 images:readonly SocialImage[];previews:Readonly<Record<string,string>>;locked:boolean;zh:boolean;
 onMove(id:string,to:number):void;onRemove(id:string):void;onCover(id:string):void;
 onAdd():void;onRetry():void;onPreviewError(id:string):void;onDragging(active:boolean):void;
}>;
type Motion=Readonly<{order:SharedValue<string[]>;active:SharedValue<string>;target:SharedValue<number>}>;

export function ComposerPhotoGrid(props:Props){
 const c=useNativeColors(),{width:screenWidth}=useWindowDimensions();
 const [width,setWidth]=useState(Math.max(1,screenWidth-32));
 const [dragging,setDragging]=useState(false);
 const ids=props.images.map(image=>image.id),signature=ids.join(',');
 const order=useSharedValue(ids),active=useSharedValue(''),target=useSharedValue(-1);
 const cellWidth=Math.max(1,(width-2*GAP)/3),cellHeight=cellWidth+44;
 const {onDragging}=props;
 const notifyDragging=(value:boolean)=>{setDragging(value);onDragging(value);};
 useEffect(()=>{
  // An external edit, lock, or rotation cancels the old gesture; its eventual end cannot commit.
  order.set(signature?signature.split(','):[]);active.set('');target.set(-1);
  setDragging(false);onDragging(false);
 },[signature,width,props.locked]);
 const motion={order,active,target};
 return <View style={{gap:8}}>
  <View testID="composer-photos" onLayout={event=>{if(event.nativeEvent.layout.width>0)setWidth(event.nativeEvent.layout.width);}} style={styles.grid}>
   {Array.from({length:6},(_,index)=><PhotoSlot key={index} index={index} occupied={index<props.images.length} width={cellWidth} height={cellHeight} motion={motion} locked={props.locked||dragging} zh={props.zh} onAdd={props.onAdd}/>)}
   {props.images.map((image,index)=><PhotoCard key={image.id} {...props} image={image} index={index} width={cellWidth} height={cellHeight} motion={motion} dragging={dragging} notifyDragging={notifyDragging}/>)}
  </View>
  <Text style={{fontSize:12,lineHeight:18,color:c.muted}}>{props.zh?'长按照片拖动排序 · 第一张为封面':'Hold a photo to reorder · First photo is the cover'}</Text>
 </View>;
}

function PhotoSlot({index,occupied,width,height,motion,locked,zh,onAdd}:Readonly<{index:number;occupied:boolean;width:number;height:number;motion:Motion;locked:boolean;zh:boolean;onAdd():void}>){
 const c=useNativeColors();
 const highlight=useAnimatedStyle(()=>({borderColor:motion.active.get()&&motion.target.get()===index?c.actionPrimary:c.line}));
 return <Animated.View testID="composer-photo-slot" style={[styles.slot,{width,height,backgroundColor:c.surface,borderStyle:occupied?'solid':'dashed'},highlight]}>
  {!occupied?<Pressable accessibilityRole="button" accessibilityLabel={zh?`在位置 ${index+1} 添加照片`:`Add photo to slot ${index+1}`} disabled={locked} onPress={onAdd} style={styles.empty}><AppIcon name="plus" size={22} color={c.muted}/><Text style={{fontSize:12,color:c.muted}}>{zh?'添加照片':'Add photo'}</Text></Pressable>:null}
 </Animated.View>;
}

function PhotoCard({image,index,width,height,motion,dragging,notifyDragging,...props}:Props&Readonly<{image:SocialImage;index:number;width:number;height:number;motion:Motion;dragging:boolean;notifyDragging(value:boolean):void}>){
 const c=useNativeColors();
 const dx=useSharedValue(0),dy=useSharedValue(0),from=useSharedValue(index),started=useSharedValue(false);
 const {order,active,target}=motion;
 const stepX=width+GAP,stepY=height+GAP;
 const id=image.id,locked=props.locked,count=props.images.length,onMove=props.onMove;
 const pan=Gesture.Pan().withTestId(`photo-drag-${id}`).enabled(!locked&&count>1).activateAfterLongPress(280).maxPointers(1).blocksExternalGesture(props.scrollGesture)
  .onStart(()=>{
   if(active.get())return;
   from.set(order.get().indexOf(id));dx.set(0);dy.set(0);started.set(true);active.set(id);target.set(from.get());
   scheduleOnRN(notifyDragging,true);
  })
  .onUpdate(event=>{
   if(active.get()!==id)return;
   dx.set(event.translationX);dy.set(event.translationY);
   target.set(photoDropIndex(from.get(),event.translationX,event.translationY,stepX,stepY,count));
  })
  .onEnd((event,success)=>{
   if(!success||active.get()!==id)return;
   const destination=photoDropIndex(from.get(),event.translationX,event.translationY,stepX,stepY,count);
   order.set([...movePhoto(order.get(),from.get(),destination)]);active.set('');target.set(-1);
   if(destination!==from.get())scheduleOnRN(onMove,id,destination);
  })
  .onFinalize(()=>{
   if(!started.get())return;
   started.set(false);
   if(active.get()===id){active.set('');target.set(-1);}
   scheduleOnRN(notifyDragging,false);
  });
 const animated=useAnimatedStyle(()=>{
  const draggingId=active.get(),currentOrder=order.get();
  const isActive=draggingId===id;
  const projected=draggingId?movePhoto(currentOrder,currentOrder.indexOf(draggingId),target.get()):currentOrder;
  const position=Math.max(0,projected.indexOf(id));
  return {zIndex:isActive?10:1,transform:[
   {translateX:isActive?(from.get()%3)*stepX+dx.get():withSpring((position%3)*stepX,settle)},
   {translateY:isActive?Math.floor(from.get()/3)*stepY+dy.get():withSpring(Math.floor(position/3)*stepY,settle)},
   {scale:withSpring(isActive?1.03:1,{...settle,dampingRatio:1})},
  ]};
 });
 const controlsLocked=locked||dragging;
 const actions=[{name:'decrement',label:props.zh?'向前移动':'Move earlier'},{name:'increment',label:props.zh?'向后移动':'Move later'}];
 const onAccessibilityAction=(event:{nativeEvent:{actionName:string}})=>{
  if(controlsLocked)return;
  const offset=event.nativeEvent.actionName==='increment'?1:event.nativeEvent.actionName==='decrement'?-1:0;
  if(offset&&index+offset>=0&&index+offset<count)onMove(id,index+offset);
 };
 const imageStyle={width:width-16,height:width-16,borderRadius:10};
 return <Animated.View testID="composer-photo-cell" style={[styles.card,{width,height,backgroundColor:c.surface,borderColor:c.line},animated]}>
  <GestureDetector gesture={pan}><View collapsable={false}>
   {props.previews[id]?<Image accessibilityLabel={props.zh?`照片 ${index+1}`:`Photo ${index+1}`} accessibilityRole="adjustable" accessibilityActions={actions} onAccessibilityAction={onAccessibilityAction} source={{uri:props.previews[id]}} style={imageStyle} onError={()=>props.onPreviewError(id)}/>:<Pressable accessibilityRole="button" accessibilityLabel={props.zh?`重新加载照片 ${index+1}`:`Retry photo ${index+1}`} accessibilityActions={actions} onAccessibilityAction={onAccessibilityAction} disabled={controlsLocked} onPress={props.onRetry} style={[imageStyle,styles.empty,{backgroundColor:c.canvas}]}><AppIcon name="photo" color={c.muted}/><Text style={{fontSize:11,color:c.muted}}>{props.zh?'点此重试':'Tap to retry'}</Text></Pressable>}
  </View></GestureDetector>
  <Pressable accessibilityRole="button" accessibilityLabel={props.zh?'移除照片':'Remove photo'} disabled={controlsLocked} onPress={()=>props.onRemove(id)} style={styles.remove}><View style={styles.removeIcon}><AppIcon name="close" size={14} color="#fff"/></View></Pressable>
  <Pressable accessibilityRole="button" accessibilityLabel={props.zh?'设为封面':'Make cover'} disabled={controlsLocked||index===0} onPress={()=>props.onCover(id)} style={styles.cover}><Text numberOfLines={1} style={{fontSize:12,color:c.actionPrimary}}>{index===0?(props.zh?'封面':'Cover'):(props.zh?'设为封面':'Make cover')}</Text></Pressable>
 </Animated.View>;
}

const styles=StyleSheet.create({
 grid:{flexDirection:'row',flexWrap:'wrap',gap:GAP},slot:{borderWidth:1,borderRadius:16},
 card:{position:'absolute',top:0,left:0,borderWidth:1,borderRadius:16,padding:7},
 empty:{flex:1,alignItems:'center',justifyContent:'center',gap:6},
 remove:{position:'absolute',right:2,top:2,width:44,height:44,alignItems:'flex-end',padding:4},
 removeIcon:{backgroundColor:'#222B',borderRadius:12,padding:4},cover:{height:44,justifyContent:'center',alignItems:'center'},
});

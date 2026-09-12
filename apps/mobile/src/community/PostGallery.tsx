import {useState} from 'react';
import {Modal,Pressable,ScrollView,Text,View,useWindowDimensions} from 'react-native';
import {SafeAreaProvider,SafeAreaView,initialWindowMetrics} from 'react-native-safe-area-context';
import {StatusBar} from 'expo-status-bar';
import {CommunityPostImage} from './CommunityPostImage';
import type {CommunityPostExtra} from '../api/community-extras';
import {useLocale} from '../i18n/LocaleContext';
import {AppIcon} from '../components/AppIcon';
type Media=CommunityPostExtra['media'];
export function PostGallery({postId,media,initialMediaId}:{postId:string;media:Media;initialMediaId?:string}){
 const {width:screenWidth}=useWindowDimensions(),{locale}=useLocale(),zh=locale==='zh-CN';
 const [width,setWidth]=useState(Math.max(240,screenWidth-32)),[page,setPage]=useState(()=>Math.max(0,media.findIndex(item=>item.mediaId===initialMediaId))),[full,setFull]=useState(false);
 const activePage=Math.min(page,Math.max(0,media.length-1));
 const ratio=media[activePage]?media[activePage]!.height/Math.max(1,media[activePage]!.width):1;
 const galleryHeight=Math.min(460,width*ratio);
 return <View onLayout={event=>{if(event.nativeEvent.layout.width>0)setWidth(event.nativeEvent.layout.width);}} style={{gap:8}}>
  <ScrollView testID={`community-gallery-${postId}`} horizontal pagingEnabled contentOffset={{x:activePage*width,y:0}} style={{height:galleryHeight,flexGrow:0}} showsHorizontalScrollIndicator={false} onMomentumScrollEnd={event=>setPage(Math.round(event.nativeEvent.contentOffset.x/width))}>
   {media.map((item,index)=><Pressable accessibilityRole="button" accessibilityLabel={zh?`打开照片 ${index+1}`:`Open photo ${index+1}`} key={item.mediaId} onPress={()=>{setPage(index);setFull(true);}} style={{width,height:galleryHeight}}><CommunityPostImage postId={postId} mediaId={item.mediaId} variant="display" resizeMode="cover" label={zh?`照片 ${index+1}`:`Photo ${index+1}`} style={{width,height:galleryHeight,borderRadius:14}}/></Pressable>)}
  </ScrollView>
  {media.length>1?<Text style={{fontSize:12,color:'#73737B',textAlign:'center'}}>{activePage+1} / {media.length}</Text>:null}
  <Modal visible={full} presentationStyle="fullScreen" animationType="none" onRequestClose={()=>setFull(false)}>
   {full?<SafeAreaProvider initialMetrics={initialWindowMetrics}><StatusBar style="light"/><SafeAreaView style={{flex:1,backgroundColor:'#111'}} edges={['top','bottom','left','right']}>
    <PhotoViewer postId={postId} media={media} initialPage={activePage} onClose={()=>setFull(false)}/>
   </SafeAreaView></SafeAreaProvider>:null}
  </Modal>
 </View>;
}
function PhotoViewer({postId,media,initialPage,onClose}:{postId:string;media:Media;initialPage:number;onClose():void}){
 const {width,height}=useWindowDimensions(),{locale}=useLocale(),zh=locale==='zh-CN';
 const [frame,setFrame]=useState({width,height:Math.max(1,height-160)}),[page,setPage]=useState(initialPage),[zoomed,setZoomed]=useState(false);
 return <View style={{flex:1}}>
  <View style={{height:52,paddingHorizontal:16,flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}>
   <Text style={{color:'#fff',fontSize:13}}>{page+1} / {media.length}</Text>
   <Pressable accessibilityRole="button" accessibilityLabel={zh?'关闭照片':'Close photos'} onPress={onClose} style={{width:44,height:44,justifyContent:'center',alignItems:'center'}}><AppIcon name="close" color="#fff"/></Pressable>
  </View>
  <View testID="photo-viewport" style={{flex:1,overflow:'hidden'}} onLayout={event=>{const {width:w,height:h}=event.nativeEvent.layout;if(w>0&&h>0){setFrame({width:w,height:h});setZoomed(false);}}}>
   <ScrollView key={`${frame.width}:${frame.height}`} testID="fullscreen-pages" horizontal pagingEnabled scrollEnabled={!zoomed} style={{flex:1}} contentOffset={{x:page*frame.width,y:0}} showsHorizontalScrollIndicator={false} onMomentumScrollEnd={event=>setPage(Math.min(media.length-1,Math.max(0,Math.round(event.nativeEvent.contentOffset.x/frame.width))))}>
    {media.map((item,index)=><ScrollView key={item.mediaId} testID={`photo-zoom-${index}`} style={{width:frame.width,height:frame.height}} contentContainerStyle={{width:frame.width,height:frame.height}} minimumZoomScale={1} maximumZoomScale={4} centerContent bouncesZoom pinchGestureEnabled scrollEventThrottle={64} onScroll={event=>{if(index===page)setZoomed((event.nativeEvent.zoomScale??1)>1.01);}} showsHorizontalScrollIndicator={false} showsVerticalScrollIndicator={false}>
     <Pressable accessibilityRole="button" accessibilityLabel={zh?'轻点关闭照片':'Tap to close photo'} onPress={onClose} style={{width:frame.width,height:frame.height,justifyContent:'center'}}>
      <CommunityPostImage postId={postId} mediaId={item.mediaId} variant="display" resizeMode="contain" label={zh?`照片 ${index+1}`:`Photo ${index+1}`} style={{width:frame.width,height:frame.height}}/>
     </Pressable>
    </ScrollView>)}
   </ScrollView>
  </View>
 </View>;
}

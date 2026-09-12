import {useState} from 'react';
import {Image,Modal,Pressable,ScrollView,Text,View,useWindowDimensions} from 'react-native';
import {SafeAreaProvider,SafeAreaView,initialWindowMetrics} from 'react-native-safe-area-context';
import {StatusBar} from 'expo-status-bar';
import {AppIcon} from '../components/AppIcon';

export function CatPhotoPreview({uri,name,locale,onClose}:Readonly<{uri:string;name:string;locale:'en'|'zh-CN';onClose():void}>){
 const {width,height}=useWindowDimensions();
 const [frame,setFrame]=useState({width,height:Math.max(1,height-160)});
 const [failed,setFailed]=useState(false);
 const zh=locale==='zh-CN';
 return <Modal visible presentationStyle="fullScreen" animationType="none" onRequestClose={onClose}>
  <SafeAreaProvider initialMetrics={initialWindowMetrics}><StatusBar style="light"/><SafeAreaView edges={['top','bottom','left','right']} style={{flex:1,backgroundColor:'#111'}}>
   <View style={{height:52,paddingHorizontal:16,flexDirection:'row',alignItems:'center',gap:12}}><Text numberOfLines={1} style={{flex:1,color:'#fff',fontSize:15}}>{name}</Text><Pressable accessibilityRole="button" accessibilityLabel={zh?'关闭照片':'Close photo'} onPress={onClose} style={{width:44,height:44,alignItems:'center',justifyContent:'center'}}><AppIcon name="close" color="#fff"/></Pressable></View>
   <View testID="cat-photo-viewport" style={{flex:1,overflow:'hidden'}} onLayout={event=>{const {width,height}=event.nativeEvent.layout;if(width>0&&height>0)setFrame({width,height});}}>
    <ScrollView key={`${frame.width}:${frame.height}`} testID="cat-photo-zoom" minimumZoomScale={1} maximumZoomScale={4} centerContent bouncesZoom pinchGestureEnabled showsHorizontalScrollIndicator={false} showsVerticalScrollIndicator={false} contentContainerStyle={frame}>
     <Pressable accessibilityRole="button" accessibilityLabel={zh?'轻点关闭照片':'Tap to close photo'} onPress={onClose} style={[frame,{justifyContent:'center',alignItems:'center'}]}>{failed?<Text style={{color:'#fff'}}>{zh?'照片暂时不可用':'Photo unavailable'}</Text>:<Image accessibilityLabel={name} source={{uri}} resizeMode="contain" onError={()=>setFailed(true)} style={frame}/>}</Pressable>
    </ScrollView>
   </View>
  </SafeAreaView></SafeAreaProvider>
 </Modal>;
}

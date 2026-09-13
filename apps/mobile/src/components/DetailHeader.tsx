import type {ReactNode} from 'react';
import {Pressable,StyleSheet,Text,View} from 'react-native';
import {BackButton} from './BackButton';
import {useNativeColors} from '../design/native-colors';
export function DetailHeader({title,subtitle,avatar,actions,onBack,onIdentity,identityLabel}:{title:string;subtitle?:string;avatar?:ReactNode;actions?:ReactNode;onBack?:()=>void;onIdentity?:()=>void;identityLabel?:string}){
 const c=useNativeColors();
 const identity=<>{avatar}<View style={s.copy}><Text accessibilityRole="header" numberOfLines={1} style={[s.title,{color:c.ink}]}>{title}</Text>{subtitle?<Text numberOfLines={1} style={[s.subtitle,{color:c.muted}]}>{subtitle}</Text>:null}</View></>;
 return <View testID="detail-header" style={s.row}>{onBack?<BackButton onPress={onBack}/>:null}{onIdentity?<Pressable accessibilityRole="button" accessibilityLabel={identityLabel??title} onPress={onIdentity} style={s.identity}>{identity}</Pressable>:<View style={s.identity}>{identity}</View>}<View style={s.actions}>{actions}</View></View>;
}
const s=StyleSheet.create({row:{minHeight:52,flexDirection:'row',alignItems:'center',gap:4},identity:{flex:1,minWidth:0,minHeight:48,flexDirection:'row',alignItems:'center',gap:8},copy:{flex:1,minWidth:0,gap:2},title:{fontSize:15,lineHeight:21,fontWeight:'600'},subtitle:{fontSize:11,lineHeight:16},actions:{flexDirection:'row',alignItems:'center',flexShrink:0}});

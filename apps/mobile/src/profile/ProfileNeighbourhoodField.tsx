import {useState} from 'react';
import {Pressable,ScrollView,Text,TextInput,View} from 'react-native';
import {AppIcon} from '../components/AppIcon';
import {useNativeColors} from '../design/native-colors';
import {useLocale} from '../i18n/LocaleContext';
import {browseSingaporeCommunities,communityLabel,SG_COMMUNITIES} from '../maps/singapore-communities';

export function profileNeighbourhood(value:unknown):string|null{
 return typeof value==='string'&&SG_COMMUNITIES.some(area=>area.id===value)?value:null;
}
export function ProfileNeighbourhoodField({value,onChange,disabled=false}:{value:string|null;onChange:(id:string|null)=>void;disabled?:boolean}){
 const {locale}=useLocale(),c=useNativeColors(),cn=locale==='zh-CN';
 const [open,setOpen]=useState(false),[query,setQuery]=useState('');
 const area=SG_COMMUNITIES.find(item=>item.id===value),label=area?communityLabel(area,locale):null;
 const matches=browseSingaporeCommunities(query);
 return <View style={{gap:8}}>
  <Text style={{fontSize:13,color:c.muted}}>{cn?'常活动邻里（选填）':'Regular neighbourhood (optional)'}</Text>
  <Pressable accessibilityRole="button" accessibilityLabel={label?(cn?`邻里：${label}`:`Neighbourhood: ${label}`):(cn?'选择邻里':'Choose neighbourhood')} accessibilityState={{expanded:open,disabled}} disabled={disabled} onPress={()=>{setOpen(!open);setQuery('');}} style={{minHeight:48,flexDirection:'row',alignItems:'center',gap:10,borderBottomWidth:1,borderColor:c.line}}>
   <AppIcon name="location" color={c.muted} size={18}/><Text style={{flex:1,fontSize:15,color:c.ink}}>{label??(cn?'选择邻里':'Choose neighbourhood')}</Text><AppIcon name={open?'close':'chevron'} color={c.muted} size={16}/>
  </Pressable>
  {value?<Pressable accessibilityRole="button" disabled={disabled} onPress={()=>{onChange(null);setOpen(false);}} style={{minHeight:44,justifyContent:'center',alignSelf:'flex-start'}}><Text style={{fontSize:13,color:c.actionPrimary}}>{cn?'清除邻里':'Clear neighbourhood'}</Text></Pressable>:null}
  {open?<View style={{gap:4}}>
   <TextInput autoFocus accessibilityLabel={cn?'搜索邻里':'Search neighbourhood'} value={query} onChangeText={setQuery} editable={!disabled} placeholder={cn?'搜索，例如西海岸':'Search, e.g. West Coast'} placeholderTextColor={c.muted} style={{minHeight:44,paddingHorizontal:12,borderRadius:10,backgroundColor:c.surface,color:c.ink,fontSize:15}}/>
   <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={{maxHeight:240}}>{matches.map(item=><Pressable key={item.id} accessibilityRole="radio" accessibilityState={{checked:item.id===value,disabled}} disabled={disabled} accessibilityLabel={communityLabel(item,locale)} onPress={()=>{onChange(item.id);setOpen(false);}} style={{minHeight:44,paddingVertical:10,flexDirection:'row',alignItems:'center',gap:8,borderBottomWidth:0.5,borderColor:c.line}}><Text style={{flex:1,fontSize:14,color:c.ink}}>{communityLabel(item,locale)}</Text>{value===item.id?<AppIcon name="check" color={c.actionPrimary} size={17}/>:null}</Pressable>)}</ScrollView>
   {!matches.length?<Text style={{paddingVertical:12,color:c.muted,fontSize:13}}>{cn?'没有找到邻里':'No neighbourhoods found'}</Text>:null}
  </View>:null}
 </View>;
}

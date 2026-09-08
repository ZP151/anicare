import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { AppIcon } from '../../src/components/AppIcon';
import { ScreenScaffold } from '../../src/components/ScreenScaffold';
import { useNativeColors } from '../../src/design/native-colors';
import { DiscoveryList } from '../../src/following/DiscoveryList';
import { useLocale } from '../../src/i18n/LocaleContext';

/** Nearby is the public, photo-led list. The privacy-safe map is its own tab. */
export default function NearbyScreen() {
  const { locale } = useLocale(); const cn = locale === 'zh-CN'; const router = useRouter(); const colors = useNativeColors(); const styles = makeStyles(colors);
  return <ScreenScaffold title={cn?'附近':'Nearby'} subtitle={cn?'延迟公开的社区猫活动':'Delayed public community-cat activity'} trailing={<Pressable accessibilityRole="button" accessibilityLabel={cn?'打开地图':'Open map'} onPress={()=>router.push('/map' as never)} style={styles.map}><AppIcon name="location" size={20} color={colors.actionPrimary}/><Text style={styles.mapText}>{cn?'地图':'Map'}</Text></Pressable>}>
    <Pressable accessibilityRole="button" accessibilityLabel={cn?'打开社区讨论':'Open community discussions'} onPress={()=>router.push('/community' as never)} style={styles.map}><AppIcon name="community" size={20} color={colors.actionPrimary}/><Text style={styles.mapText}>{cn?'邻里讨论':'Community conversations'}</Text><AppIcon name="chevron" size={16} color={colors.muted}/></Pressable>
    <DiscoveryList />
  </ScreenScaffold>;
}
const makeStyles=(colors:ReturnType<typeof useNativeColors>)=>StyleSheet.create({toolbar:{flexDirection:'row',alignItems:'center',gap:12},hint:{flex:1,color:colors.muted,fontSize:14,lineHeight:20},map:{minHeight:44,paddingHorizontal:12,borderRadius:22,flexDirection:'row',alignItems:'center',gap:6,backgroundColor:colors.leafSoft},mapText:{color:colors.actionPrimary,fontSize:15,fontWeight:'600'}});

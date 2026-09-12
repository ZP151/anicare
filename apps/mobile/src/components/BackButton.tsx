import {Pressable,StyleSheet} from 'react-native';
import {GlassSurface} from '../design/GlassSurface';
import {useNativeColors} from '../design/native-colors';
import {useLocale} from '../i18n/LocaleContext';
import {AppIcon} from './AppIcon';

/** Navigation goes on the leading edge; trailing controls are page actions. */
export function BackButton({onPress}:{onPress:()=>void}){
  const colors=useNativeColors(),{locale}=useLocale();
  return <GlassSurface interactive style={styles.glass}>
    <Pressable accessibilityRole="button" accessibilityLabel={locale==='zh-CN'?'返回':'Back'} onPress={onPress} style={styles.touch}>
      <AppIcon name="back" size={20} color={colors.ink}/>
    </Pressable>
  </GlassSurface>;
}
const styles=StyleSheet.create({glass:{width:44,height:44,borderRadius:22},touch:{width:44,height:44,alignItems:'center',justifyContent:'center'}});

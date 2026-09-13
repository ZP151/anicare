import { useState } from 'react';
import { Text, View } from 'react-native';
import { useNativeColors } from '../design/native-colors';
import { IconAction } from './IconAction';

export function InfoDisclosure({ label, heading, children }: Readonly<{ label: string; heading?: string; children: string }>) {
  const [expanded, setExpanded] = useState(false);
  const colors = useNativeColors();
  return <View style={{ alignItems: 'flex-start' }}>
    <View style={{flexDirection:'row',alignItems:'center',width:heading?'100%':undefined}}>
      {heading?<Text accessibilityRole="header" style={{flex:1,color:colors.ink,fontSize:17,lineHeight:23,fontWeight:'600'}}>{heading}</Text>:null}
      <IconAction icon="info" label={label} expanded={expanded} onPress={() => setExpanded(value => !value)} />
    </View>
    {expanded ? <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19, paddingBottom: 8 }}>{children}</Text> : null}
  </View>;
}

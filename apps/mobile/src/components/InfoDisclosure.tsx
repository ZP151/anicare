import { useState } from 'react';
import { Text, View } from 'react-native';
import { useNativeColors } from '../design/native-colors';
import { IconAction } from './IconAction';

export function InfoDisclosure({ label, children }: Readonly<{ label: string; children: string }>) {
  const [expanded, setExpanded] = useState(false);
  const colors = useNativeColors();
  return <View style={{ alignItems: 'flex-start' }}>
    <IconAction icon="info" label={label} expanded={expanded} onPress={() => setExpanded(value => !value)} />
    {expanded ? <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19, paddingBottom: 8 }}>{children}</Text> : null}
  </View>;
}

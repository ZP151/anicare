import { BlurView } from 'expo-blur';
import {
  GlassView,
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
} from 'expo-glass-effect';
import { PropsWithChildren, useEffect, useState } from 'react';
import { AccessibilityInfo, Platform, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

import { getGlassMode, supportsReduceTransparencyApi } from './glass-policy';

type GlassSurfaceProps = PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
  interactive?: boolean;
}>;

export function GlassSurface({ children, style, interactive = false }: GlassSurfaceProps) {
  const [reduceTransparency, setReduceTransparency] = useState(false);

  useEffect(() => {
    if (!supportsReduceTransparencyApi(AccessibilityInfo)) return undefined;
    void AccessibilityInfo.isReduceTransparencyEnabled().then(setReduceTransparency);
    const subscription = AccessibilityInfo.addEventListener(
      'reduceTransparencyChanged',
      setReduceTransparency,
    );
    return () => subscription.remove();
  }, []);

  const liquidGlassAvailable =
    Platform.OS === 'ios' && isLiquidGlassAvailable() && isGlassEffectAPIAvailable();
  const mode = getGlassMode({
    platform: Platform.OS,
    liquidGlassAvailable,
    reduceTransparency,
  });

  if (mode === 'liquid') {
    return (
      <GlassView glassEffectStyle="regular" isInteractive={interactive} style={style}>
        {children}
      </GlassView>
    );
  }

  if (mode === 'blur') {
    return (
      <BlurView intensity={55} tint="systemMaterial" style={style}>
        {children}
      </BlurView>
    );
  }

  return <View style={[styles.solid, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  solid: {
    backgroundColor: 'rgba(255,255,255,0.96)',
  },
});

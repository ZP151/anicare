import { BlurView } from 'expo-blur';
import {
  GlassView,
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
} from 'expo-glass-effect';
import { PropsWithChildren, useEffect, useState } from 'react';
import { AccessibilityInfo, Platform, StyleProp, StyleSheet, useColorScheme, View, ViewProps, ViewStyle } from 'react-native';

import { getGlassMode, supportsReduceTransparencyApi } from './glass-policy';

type GlassSurfaceProps = PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
  interactive?: boolean;
}> & Pick<ViewProps, 'accessibilityLabel'|'onLayout'>;

export function GlassSurface({ children, style, interactive = false, accessibilityLabel, onLayout }: GlassSurfaceProps) {
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
  const dark = useColorScheme() === 'dark';
  // Callers may use layout styles but must not paint an opaque rectangle over
  // native material. A material surface owns its background colour.
  const materialStyle = [styles.material, style, styles.clearBackground];

  if (mode === 'liquid') {
    return (
      <GlassView accessibilityLabel={accessibilityLabel} onLayout={onLayout} glassEffectStyle="regular" isInteractive={interactive} style={materialStyle}>
        {children}
      </GlassView>
    );
  }

  if (mode === 'blur') {
    return (
      <BlurView accessibilityLabel={accessibilityLabel} onLayout={onLayout} intensity={55} tint={dark ? 'systemChromeMaterialDark' : 'systemMaterial'} style={materialStyle}>
        {children}
      </BlurView>
    );
  }

  return <View accessibilityLabel={accessibilityLabel} onLayout={onLayout} style={[style, styles.solid, dark && styles.solidDark]}>{children}</View>;
}

const styles = StyleSheet.create({
  solid: {
    backgroundColor: '#FFFFFF',
  },
  solidDark: { backgroundColor: '#1C211C' },
  material: { overflow: 'hidden' },
  clearBackground: { backgroundColor: 'transparent' },
});

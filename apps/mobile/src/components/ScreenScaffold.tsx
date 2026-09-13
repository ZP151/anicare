import { PropsWithChildren, ReactElement, ReactNode, useContext, useRef, useState } from 'react';
import { Animated, KeyboardAvoidingView, Platform, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { GlassSurface } from '../design/GlassSurface';
import { HeaderCollapseContext } from './header-collapse';
import { useNativeColors } from '../design/native-colors';

interface ScreenScaffoldProps extends PropsWithChildren {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  leading?: ReactNode;
  pinHeading?: boolean;
  collapseTitle?: boolean;
  titleAccessory?: ReactNode;
  trailing?: ReactNode;
  nativeAppearance?: boolean;
  compact?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  refreshLabel?: string;
  footer?: ReactNode;
  header?: ReactNode;
  avoidKeyboard?: boolean;
  hasNativeHeader?: boolean;
  scrollEnabled?: boolean;
  wrapScroll?: (scroll: ReactElement) => ReactElement;
}

export function ScreenScaffold({
  eyebrow,
  title,
  subtitle,
  leading, pinHeading=false, collapseTitle=false, titleAccessory,
  trailing,
  children,
  nativeAppearance = true,
  compact = false,
  refreshing = false,
  onRefresh,
  refreshLabel = 'Refresh',
  footer, header, avoidKeyboard = false, hasNativeHeader = false, scrollEnabled = true, wrapScroll,
}: ScreenScaffoldProps) {
  const palette = useNativeColors();
  const insets = useContext(SafeAreaInsetsContext) ?? {top:0,left:0,right:0,bottom:0};
  const [headerHeight, setHeaderHeight] = useState(62);
  const [footerHeight,setFooterHeight]=useState(66);
  const [titleHeight, setTitleHeight] = useState(42);
  const [collapsed,setCollapsed]=useState(false);
  const collapsedRef=useRef(false);
  const scrollY = useRef(new Animated.Value(0)).current;
  const compactOpacity = scrollY.interpolate({inputRange:[Math.max(8,titleHeight-28),titleHeight+8],outputRange:[0,1],extrapolate:'clamp'});
  const expandedOpacity = scrollY.interpolate({inputRange:[0,Math.max(8,titleHeight-8)],outputRange:[1,0],extrapolate:'clamp'});
  const nativeStyle = nativeAppearance ? { backgroundColor: palette.canvas } : undefined;
  const HeadingSurface = leading || pinHeading ? GlassSurface : View;
  const heading = (
<View style={[styles.headingRow, (!!leading || pinHeading) && styles.fixedHeadingRow]}>
          {leading ? <View testID="screen-header-leading">{leading}</View> : null}
          <Animated.View accessibilityElementsHidden={collapseTitle&&!collapsed} importantForAccessibility={collapseTitle&&!collapsed?"no-hide-descendants":"auto"} style={[styles.headingCopy, (!!leading || pinHeading) && styles.leadingHeading, collapseTitle && {opacity:compactOpacity}]}><HeadingSurface style={leading || pinHeading ? {borderRadius:24,paddingHorizontal:12,paddingVertical:6,alignSelf:'center',maxWidth:'100%'} : undefined}>
            <Text accessibilityRole="header" style={[styles.title, compact && styles.compactTitle, (!!leading || pinHeading) && styles.fixedTitle, nativeAppearance && { color: palette.ink }]}>
              {title}
            </Text>
            {eyebrow ? <Text style={[styles.contextNote, nativeAppearance && { color: palette.muted }]}>{eyebrow}</Text> : null}
            {subtitle ? <Text style={[styles.subtitle, (!!leading || pinHeading) && styles.fixedSubtitle, nativeAppearance && { color: palette.muted }]}>{subtitle}</Text> : null}
          </HeadingSurface></Animated.View>
          {trailing?<GlassSurface style={{borderRadius:24}}>{trailing}</GlassSurface>:null}
        </View>
  );
  const fixedHeader = header ?? (leading || pinHeading ? heading : null);
  const scrollContent = (
      <Animated.ScrollView onScroll={Animated.event([{nativeEvent:{contentOffset:{y:scrollY}}}],{useNativeDriver:true,listener:(event:{nativeEvent:{contentOffset:{y:number}}})=>{if(!collapseTitle)return;const next=event.nativeEvent.contentOffset.y>=Math.max(8,titleHeight-10);if(next!==collapsedRef.current){collapsedRef.current=next;setCollapsed(next);}}})} scrollEventThrottle={16} scrollEnabled={scrollEnabled} testID="screen-scroll" style={styles.fill} alwaysBounceVertical accessibilityActions={onRefresh ? [{ name: 'refresh', label: refreshLabel }] : undefined} onAccessibilityAction={event => { if (event.nativeEvent.actionName === 'refresh') onRefresh?.(); }} refreshControl={onRefresh ? <RefreshControl progressViewOffset={fixedHeader?(hasNativeHeader?0:insets.top)+headerHeight:0} refreshing={refreshing} onRefresh={onRefresh} /> : undefined} contentInsetAdjustmentBehavior={hasNativeHeader || fixedHeader ? "never" : "automatic"} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" contentContainerStyle={[styles.content, styles.pullable, compact && styles.compactContent, !!footer && {paddingBottom:footerHeight+insets.bottom+16}, !!fixedHeader && {paddingTop:(hasNativeHeader?0:insets.top)+headerHeight+12}]}>
        {!fixedHeader ? heading : null}
        {fixedHeader && collapseTitle ? <Animated.View accessibilityElementsHidden={collapsed} importantForAccessibility={collapsed?"no-hide-descendants":"auto"} testID="screen-large-title" onLayout={event=>setTitleHeight(event.nativeEvent.layout.height)} style={{opacity:expandedOpacity,flexDirection:'row',alignItems:'center',gap:14}}>{titleAccessory}<View style={{flex:1,minWidth:0}}><Text accessibilityRole="header" style={[styles.title,{fontSize:32,lineHeight:38,color:palette.ink}]}>{title}</Text>{subtitle?<Text style={[styles.subtitle,{color:palette.muted}]}>{subtitle}</Text>:null}</View></Animated.View>:null}
        {children}
      </Animated.ScrollView>
  );
  return (
    <KeyboardAvoidingView testID="screen-keyboard-layout" enabled={!!footer || avoidKeyboard} behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.fill, nativeStyle]}>
      {/* Measure keyboard overlap in the full screen coordinate space. Placing
          this container inside SafeAreaView can subtract the top inset twice. */}
      <SafeAreaView edges={fixedHeader || hasNativeHeader ? ['left','right'] : ['top','left','right']} style={[styles.safeArea, nativeStyle]}>
      {wrapScroll ? wrapScroll(scrollContent) : scrollContent}
      {fixedHeader ? <View pointerEvents="box-none" testID="screen-fixed-header" onLayout={event=>setHeaderHeight(event.nativeEvent.layout.height)} style={{position:'absolute',left:0,right:0,top:hasNativeHeader?0:insets.top,zIndex:10,paddingHorizontal:12,paddingTop:4,paddingBottom:6}}><HeaderCollapseContext.Provider value={collapseTitle?{opacity:compactOpacity,collapsed}:null}>{fixedHeader}</HeaderCollapseContext.Provider></View> : null}
      {footer ? <View testID="screen-fixed-footer" onLayout={event=>setFooterHeight(event.nativeEvent.layout.height)} style={[styles.footer,{position:'absolute',left:0,right:0,bottom:insets.bottom,zIndex:10}]}>{footer}</View> : null}
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F2F2F7' },
  fill: { flex: 1 },
  footer: { paddingHorizontal: 12, paddingVertical: 6 },
  footerContent: { paddingBottom: 16 },
  content: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: Platform.OS === 'ios' ? 112 : 120, gap: 24 },
  compactContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 112, gap: 12 },
  pullable: { flexGrow: 1 },
  headingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  headingCopy: { flex: 1, minWidth: 0, gap: 4 },
  fixedHeadingRow: { alignItems: 'center', minHeight: 48, gap: 8 },
  fixedTitle: { fontSize: 17, lineHeight: 23, letterSpacing: 0, textAlign:'center' },
  fixedSubtitle: { fontSize: 12, lineHeight: 17 },
  leadingHeading: { minHeight: 44, justifyContent: 'center' },
  contextNote: { color: '#62626A', fontSize: 13, lineHeight: 18 },
  title: { color: '#1C1C1E', fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -0.4 },
  compactTitle: { fontSize: 20, lineHeight: 25, letterSpacing: -0.2 },
  subtitle: { color: '#62626A', fontSize: 16, lineHeight: 23 },
});

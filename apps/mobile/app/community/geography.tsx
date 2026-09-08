import { useRouter } from 'expo-router';
import { Linking, Pressable, Text, View } from 'react-native';
import { ScreenScaffold } from '../../src/components/ScreenScaffold';
import { AppIcon } from '../../src/components/AppIcon';
import { useNativeColors } from '../../src/design/native-colors';
import { useLocale } from '../../src/i18n/LocaleContext';

export default function CommunityGeography() {
  const {locale}=useLocale(),zh=locale==='zh-CN',c=useNativeColors(),router=useRouter();
  const rows=[
    {title:zh?'地图上的社区':'Communities on the map',body:zh?'区域 → 规划区 → 邻里。比如：西部 → 金文泰 → 西海岸。全岛保留 55 个规划区，邻里层采用 332 个官方规划分区。':'Region → planning area → neighbourhood. For example: West → Clementi → West Coast. Browse 55 planning areas and 332 official subzones.',link:'https://data.gov.sg/datasets/d_8594ae9ff96d0c708bc2af633048edfb/view',source:'URA · MP2019 subzones'},
    {title:zh?'熟悉的名称，可能有不同范围':'Familiar names can cover different places',body:zh?'西海岸是金文泰下的一个规划分区；West Coast CC 位于金文泰西。居民社区、民众俱乐部及居民联系网的名称，不等于同名规划分区的边界。':'West Coast is a Clementi subzone; West Coast CC is in Clementi West. Everyday neighbourhoods, Community Clubs and Residents’ Networks do not necessarily follow the same planning boundaries.',link:'https://www.onepa.gov.sg/rc/west-coast-ville-rn',source:'People’s Association · onePA'},
    {title:zh?'CDC 与选区':'CDCs and constituencies',body:zh?'CDC 的五个社区发展理事会辖区与地图上的五个规划区域是不同体系。选区也有独立边界。应用不会根据一个社区名字猜测居民所属的 CDC、选区或居民联系网。':'The five CDC districts are separate from the five planning regions. Electoral divisions have their own boundaries too. We do not infer a resident’s CDC, constituency or Residents’ Network from a neighbourhood name.',link:'https://www.cdc.gov.sg/about-us/five-districts/',source:'CDC Singapore · Five Districts'},
    {title:zh?'地图数据与猫的位置':'Map sources and cat locations',body:zh?'规划区使用 URA MP2025，邻里使用公开的 MP2019 分区数据（数据集更新于 2025-12-03）。边界为示意，不代表最新居民组织辖区。猫活动按延迟公开的粗略位置归类；楼栋名称是报告者提供的背景，并非固定住址。':'Planning areas use URA MP2025; neighbourhoods use the public MP2019 subzone dataset (updated 3 Dec 2025). Boundaries are indicative, not current resident-organisation jurisdictions. Cats are grouped approximately from delayed public locations. Reported building names are context, not fixed homes.',link:'https://data.gov.sg/datasets/d_2cc750190544007400b2cfd5d7f53209/view',source:'URA · MP2025 planning areas'},
  ];
  return <ScreenScaffold title={zh?'认识你的社区':'Know your neighbourhood'} trailing={<Pressable accessibilityRole="button" accessibilityLabel={zh?'返回':'Back'} onPress={()=>router.canGoBack()?router.back():router.replace('/map' as never)} style={{width:44,minHeight:44,alignItems:'center',justifyContent:'center'}}><AppIcon name="close" color={c.actionPrimary}/></Pressable>}>
    {rows.map(row=><View key={row.link} style={{padding:20,borderRadius:24,backgroundColor:c.surface,gap:12}}><Text style={{fontSize:19,fontWeight:'600',color:c.ink}}>{row.title}</Text><Text style={{fontSize:15,lineHeight:24,color:c.muted}}>{row.body}</Text><Pressable accessibilityRole="link" onPress={()=>void Linking.openURL(row.link)} style={{minHeight:44,justifyContent:'center'}}><Text style={{color:c.actionPrimary,fontSize:14}}>{row.source} ↗</Text></Pressable></View>)}
  </ScreenScaffold>;
}

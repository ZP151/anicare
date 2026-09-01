import { getCommunityMapCopy, getTabDefinitions, translate } from './catalog';
import { getReportCopy } from '../report/report-copy';

describe('localization catalog', () => {
  it('supplies every report-hub message in both supported locales', () => {
    expect(Object.keys(getReportCopy('en')).sort()).toEqual(Object.keys(getReportCopy('zh-CN')).sort());
  });

  it('uses the WhiskerCommons display name in both locales', () => {
    expect(translate('en', 'app.name')).toBe('WhiskerCommons');
    expect(translate('zh-CN', 'app.name')).toBe('WhiskerCommons');
  });

  it('defines the five approved tabs in stable route order for English', () => {
    expect(getTabDefinitions('en')).toEqual([
      { route: 'index', label: 'Nearby', accessibilityLabel: 'Nearby community cats' },
      { route: 'map', label: 'Map', accessibilityLabel: 'Community cat map' },
      { route: 'report', label: 'Report', accessibilityLabel: 'Report a community cat' },
      { route: 'following', label: 'Following', accessibilityLabel: 'Followed cats and areas' },
      { route: 'profile', label: 'Profile', accessibilityLabel: 'Your profile' },
    ]);
  });

  it('returns Simplified Chinese copy without changing route identifiers', () => {
    expect(getTabDefinitions('zh-CN').map(({ route, label }) => ({ route, label }))).toEqual([
      { route: 'index', label: '附近' },
      { route: 'map', label: '地图' },
      { route: 'report', label: '报告' },
      { route: 'following', label: '关注' },
      { route: 'profile', label: '我的' },
    ]);
    expect(translate('zh-CN', 'nearby.privacyNote')).toBe('公开位置已模糊处理，并延迟显示。');
  });

  it('provides complete privacy-safe community map labels in English', () => {
    expect([
      'Community map',
      'Map',
      'List',
      'Delayed community activity',
      'Coarse areas only · no exact pins or routes',
      'Show area list',
      'Show map',
      'Reset broad map view',
      'Choose area manually',
      'Exact pins and routes are unavailable by design.',
      'Demo map · live feed unavailable',
      'Loading delayed community activity…',
      'No delayed community activity yet',
      'Community feed unavailable · map remains privacy-safe',
      'Google Maps is unavailable. Switch to the area list to browse delayed community activity.',
      'View',
      'Follow area',
      'Sign-in and hosted area-follow support are required.',
    ]).toEqual([
      translate('en', 'map.title'),
      translate('en', 'map.mapTab'),
      translate('en', 'map.listTab'),
      translate('en', 'map.delayedActivity'),
      translate('en', 'map.legend'),
      translate('en', 'map.showAreaList'),
      translate('en', 'map.showMap'),
      translate('en', 'map.resetBroadView'),
      translate('en', 'map.chooseAreaManually'),
      translate('en', 'map.manualAreaExplanation'),
      translate('en', 'map.demoStatus'),
      translate('en', 'map.loadingStatus'),
      translate('en', 'map.emptyStatus'),
      translate('en', 'map.unavailableStatus'),
      translate('en', 'map.mapUnavailable'),
      translate('en', 'map.detail.viewAction'),
      translate('en', 'map.detail.followAction'),
      translate('en', 'map.detail.followDisabledReason'),
    ]);
  });

  it('provides complete privacy-safe community map labels in Simplified Chinese', () => {
    expect([
      '社区地图',
      '地图',
      '列表',
      '延迟显示的社区活动',
      '仅显示粗略区域 · 不显示精确位置或路线',
      '显示区域列表',
      '显示地图',
      '重置广域地图视图',
      '手动选择区域',
      '为保护社区猫，地图不提供精确位置或路线。',
      '演示地图 · 实时动态暂不可用',
      '正在加载延迟显示的社区活动…',
      '暂时没有延迟显示的社区活动',
      '社区动态暂不可用 · 地图仍保持隐私安全',
      'Google 地图暂不可用。请切换到区域列表浏览延迟显示的社区活动。',
      '查看',
      '关注区域',
      '需要登录；区域关注服务上线后才能使用此功能。',
    ]).toEqual([
      translate('zh-CN', 'map.title'),
      translate('zh-CN', 'map.mapTab'),
      translate('zh-CN', 'map.listTab'),
      translate('zh-CN', 'map.delayedActivity'),
      translate('zh-CN', 'map.legend'),
      translate('zh-CN', 'map.showAreaList'),
      translate('zh-CN', 'map.showMap'),
      translate('zh-CN', 'map.resetBroadView'),
      translate('zh-CN', 'map.chooseAreaManually'),
      translate('zh-CN', 'map.manualAreaExplanation'),
      translate('zh-CN', 'map.demoStatus'),
      translate('zh-CN', 'map.loadingStatus'),
      translate('zh-CN', 'map.emptyStatus'),
      translate('zh-CN', 'map.unavailableStatus'),
      translate('zh-CN', 'map.mapUnavailable'),
      translate('zh-CN', 'map.detail.viewAction'),
      translate('zh-CN', 'map.detail.followAction'),
      translate('zh-CN', 'map.detail.followDisabledReason'),
    ]);
  });

  it('formats every dynamic community-map sentence in English', () => {
    const copy = getCommunityMapCopy('en');

    expect(copy.areaLabel(2)).toBe('Community area 2');
    expect(copy.activityLabel(1, 'today')).toBe('1 cat active in the latest delayed window');
    expect(copy.activityLabel(2, 'this_week')).toBe('2 cats active in the delayed weekly window');
    expect(copy.activityLabel(3, 'earlier')).toBe('3 cats active in an earlier delayed window');
    expect([
      copy.verificationLabel('reported'),
      copy.verificationLabel('community_confirmed'),
      copy.verificationLabel('partner_confirmed'),
      copy.verificationLabel('disputed'),
      copy.verificationLabel('superseded'),
    ]).toEqual([
      'Reported · awaiting community review',
      'Community confirmed',
      'Partner confirmed',
      'Public information disputed',
      'Public identity updated',
    ]);
    expect([
      copy.timeLabel('today'),
      copy.timeLabel('this_week'),
      copy.timeLabel('earlier'),
    ]).toEqual([
      'Seen in the latest delayed window',
      'Seen in the delayed weekly window',
      'Seen in an earlier delayed window',
    ]);
    expect(copy.openAreaLabel('Community area 2')).toBe('Open Community area 2');
    expect(copy.areaDetailLabel('Community area 2')).toBe('Area detail: Community area 2');
    expect(copy.visibleCatsLabel(1)).toBe('1 cat visible');
    expect(copy.visibleCatsLabel(2)).toBe('2 cats visible');
    expect(copy.confirmedCatsLabel(1)).toBe('1 community-confirmed cat');
    expect(copy.confirmedCatsLabel(2)).toBe('2 community-confirmed cats');
    expect(copy.aggregateAccessibilityLabel(2, 1)).toBe('2 cats visible; 1 community-confirmed cat');
    expect(copy.viewCatLabel('Pepper')).toBe('View Pepper');
    expect(copy.reportFromAreaLabel('Community area 2')).toBe('Report from Community area 2');
  });

  it('formats every dynamic community-map sentence in Simplified Chinese', () => {
    const copy = getCommunityMapCopy('zh-CN');

    expect(copy.areaLabel(2)).toBe('社区区域2');
    expect(copy.activityLabel(1, 'today')).toBe('最近延迟时段内有 1 只猫活动');
    expect(copy.activityLabel(2, 'this_week')).toBe('延迟周时段内有 2 只猫活动');
    expect(copy.activityLabel(3, 'earlier')).toBe('较早的延迟时段内有 3 只猫活动');
    expect([
      copy.verificationLabel('reported'),
      copy.verificationLabel('community_confirmed'),
      copy.verificationLabel('partner_confirmed'),
      copy.verificationLabel('disputed'),
      copy.verificationLabel('superseded'),
    ]).toEqual([
      '已报告 · 等待社区审核',
      '社区已确认',
      '合作伙伴已确认',
      '公开信息有争议',
      '公开身份信息已更新',
    ]);
    expect([
      copy.timeLabel('today'),
      copy.timeLabel('this_week'),
      copy.timeLabel('earlier'),
    ]).toEqual([
      '最近延迟时段内有目击记录',
      '延迟周时段内有目击记录',
      '较早的延迟时段内有目击记录',
    ]);
    expect(copy.openAreaLabel('社区区域2')).toBe('打开社区区域2');
    expect(copy.areaDetailLabel('社区区域2')).toBe('区域详情：社区区域2');
    expect(copy.visibleCatsLabel(2)).toBe('可查看 2 只猫');
    expect(copy.confirmedCatsLabel(1)).toBe('其中 1 只已获社区确认');
    expect(copy.aggregateAccessibilityLabel(2, 1)).toBe('可查看 2 只猫；其中 1 只已获社区确认');
    expect(copy.viewCatLabel('Pepper')).toBe('查看 Pepper');
    expect(copy.reportFromAreaLabel('社区区域2')).toBe('从社区区域2提交报告');
  });
});

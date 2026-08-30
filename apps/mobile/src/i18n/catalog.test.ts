import { getTabDefinitions, translate } from './catalog';

describe('localization catalog', () => {
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
    expect(translate('en', 'map.delayedActivity')).toBe('Delayed community activity');
    expect(translate('en', 'map.legend')).toBe('Coarse areas only · no exact pins or routes');
    expect(translate('en', 'map.manualAreaExplanation')).toBe('Exact pins and routes are unavailable by design.');
    expect(translate('en', 'map.resetBroadView')).toBe('Reset broad map view');
  });

  it('provides complete privacy-safe community map labels in Simplified Chinese', () => {
    expect(translate('zh-CN', 'map.delayedActivity')).toBe('延迟显示的社区活动');
    expect(translate('zh-CN', 'map.legend')).toBe('仅显示粗略区域 · 不显示精确位置或路线');
    expect(translate('zh-CN', 'map.manualAreaExplanation')).toBe('为保护社区猫，地图不提供精确位置或路线。');
    expect(translate('zh-CN', 'map.resetBroadView')).toBe('重置广域地图视图');
  });
});

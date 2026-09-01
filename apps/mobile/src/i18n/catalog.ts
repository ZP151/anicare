import type { PublicSighting } from '../api/feed';

export type Locale = 'en' | 'zh-CN';

export type MessageKey =
  | 'app.name'
  | 'nearby.title'
  | 'nearby.subtitle'
  | 'nearby.privacyNote'
  | 'map.title'
  | 'map.subtitle'
  | 'map.mapTab'
  | 'map.listTab'
  | 'map.delayedActivity'
  | 'map.legend'
  | 'map.showAreaList'
  | 'map.showMap'
  | 'map.resetBroadView'
  | 'map.chooseAreaManually'
  | 'map.manualAreaExplanation'
  | 'map.demoStatus'
  | 'map.loadingStatus'
  | 'map.emptyStatus'
  | 'map.unavailableStatus'
  | 'map.detail.viewAction'
  | 'map.detail.followAction'
  | 'map.detail.followDisabledReason'
  | 'report.title'
  | 'report.subtitle'
  | 'report.action'
  | 'report.hub.title'
  | 'report.hub.subtitle'
  | 'report.hub.startAction'
  | 'report.hub.draftsTitle'
  | 'report.hub.loading'
  | 'report.hub.emptyTitle'
  | 'report.hub.emptyCopy'
  | 'report.hub.storageUnavailable'
  | 'report.hub.loadFailed'
  | 'report.hub.retryAction'
  | 'report.hub.myReports'
  | 'report.hub.signedOutExplanation'
  | 'report.hub.profileAction'
  | 'report.hub.startFailed'
  | 'report.hub.deleteFailed'
  | 'report.hub.continueDraftLabel'
  | 'report.hub.deleteDraftLabel'
  | 'report.hub.deleteAction'
  | 'report.hub.step.photo'
  | 'report.hub.step.details'
  | 'report.hub.step.safety'
  | 'report.hub.step.area'
  | 'report.hub.step.review'
  | 'following.title'
  | 'following.subtitle'
  | 'profile.title'
  | 'profile.subtitle'
  | 'common.beta';

const messages: Record<Locale, Record<MessageKey, string>> = {
  en: {
    'app.name': 'WhiskerCommons',
    'nearby.title': 'Cats nearby',
    'nearby.subtitle': 'Identity-backed sightings from your community.',
    'nearby.privacyNote': 'Public locations are blurred and shown after a safety delay.',
    'map.title': 'Community map',
    'map.subtitle': 'Delayed, coarse community activity.',
    'map.mapTab': 'Map',
    'map.listTab': 'List',
    'map.delayedActivity': 'Delayed community activity',
    'map.legend': 'Coarse areas only · no exact pins or routes',
    'map.showAreaList': 'Show area list',
    'map.showMap': 'Show map',
    'map.resetBroadView': 'Reset broad map view',
    'map.chooseAreaManually': 'Choose area manually',
    'map.manualAreaExplanation': 'Exact pins and routes are unavailable by design.',
    'map.demoStatus': 'Demo map · live feed unavailable',
    'map.loadingStatus': 'Loading delayed community activity…',
    'map.emptyStatus': 'No delayed community activity yet',
    'map.unavailableStatus': 'Community feed unavailable · map remains privacy-safe',
    'map.detail.viewAction': 'View',
    'map.detail.followAction': 'Follow area',
    'map.detail.followDisabledReason': 'Sign-in and hosted area-follow support are required.',
    'report.title': 'Report a sighting',
    'report.subtitle': 'Start a private draft and finish it when you are ready.',
    'report.action': 'Start a report',
    'report.hub.title': 'Report a sighting',
    'report.hub.subtitle': 'Start a private draft and finish it when you are ready.',
    'report.hub.startAction': 'Start a report',
    'report.hub.draftsTitle': 'Continue drafts',
    'report.hub.loading': 'Loading saved reports…',
    'report.hub.emptyTitle': 'No saved reports yet',
    'report.hub.emptyCopy': 'Start a report and you can return to it on this device.',
    'report.hub.storageUnavailable': 'Saved reports are available in native iOS and Android builds.',
    'report.hub.loadFailed': 'Saved reports could not be loaded. Try again later.',
    'report.hub.retryAction': 'Try again',
    'report.hub.myReports': 'My Reports',
    'report.hub.signedOutExplanation': 'Sign in to view reports you have submitted.',
    'report.hub.profileAction': 'Go to Profile to sign in',
    'report.hub.startFailed': 'A saved report could not be created. Try again on a native device.',
    'report.hub.deleteFailed': 'This saved report could not be deleted. Try again.',
    'report.hub.continueDraftLabel': 'Continue report draft from {step}',
    'report.hub.deleteDraftLabel': 'Delete report draft from {step}',
    'report.hub.deleteAction': 'Delete',
    'report.hub.step.photo': 'Photo',
    'report.hub.step.details': 'Details',
    'report.hub.step.safety': 'Safety',
    'report.hub.step.area': 'Area',
    'report.hub.step.review': 'Review',
    'following.title': 'Following',
    'following.subtitle': 'De-sensitive updates for cats and areas you care about.',
    'profile.title': 'Your profile',
    'profile.subtitle': 'Manage privacy, training consent and trusted roles.',
    'common.beta': 'Closed beta',
  },
  'zh-CN': {
    'app.name': 'WhiskerCommons',
    'nearby.title': '附近的社区猫',
    'nearby.subtitle': '查看与稳定身份关联的社区目击记录。',
    'nearby.privacyNote': '公开位置已模糊处理，并延迟显示。',
    'map.title': '社区地图',
    'map.subtitle': '延迟显示的粗略社区活动。',
    'map.mapTab': '地图',
    'map.listTab': '列表',
    'map.delayedActivity': '延迟显示的社区活动',
    'map.legend': '仅显示粗略区域 · 不显示精确位置或路线',
    'map.showAreaList': '显示区域列表',
    'map.showMap': '显示地图',
    'map.resetBroadView': '重置广域地图视图',
    'map.chooseAreaManually': '手动选择区域',
    'map.manualAreaExplanation': '为保护社区猫，地图不提供精确位置或路线。',
    'map.demoStatus': '演示地图 · 实时动态暂不可用',
    'map.loadingStatus': '正在加载延迟显示的社区活动…',
    'map.emptyStatus': '暂时没有延迟显示的社区活动',
    'map.unavailableStatus': '社区动态暂不可用 · 地图仍保持隐私安全',
    'map.detail.viewAction': '查看',
    'map.detail.followAction': '关注区域',
    'map.detail.followDisabledReason': '需要登录；区域关注服务上线后才能使用此功能。',
    'report.title': '报告目击',
    'report.subtitle': '先建立私密草稿，准备好后再完成。',
    'report.action': '开始报告',
    'report.hub.title': '报告目击',
    'report.hub.subtitle': '先建立私密草稿，准备好后再完成。',
    'report.hub.startAction': '开始报告',
    'report.hub.draftsTitle': '继续草稿',
    'report.hub.loading': '正在加载已保存的报告…',
    'report.hub.emptyTitle': '还没有已保存的报告',
    'report.hub.emptyCopy': '开始报告后，你可以在这台设备上继续完成。',
    'report.hub.storageUnavailable': '已保存的报告仅在原生 iOS 和 Android 版本中可用。',
    'report.hub.loadFailed': '无法加载已保存的报告，请稍后重试。',
    'report.hub.retryAction': '重试',
    'report.hub.myReports': '我的报告',
    'report.hub.signedOutExplanation': '登录后即可查看你已提交的报告。',
    'report.hub.profileAction': '前往“我的”登录',
    'report.hub.startFailed': '无法创建已保存的报告，请在原生设备上重试。',
    'report.hub.deleteFailed': '无法删除这份已保存的报告，请重试。',
    'report.hub.continueDraftLabel': '从{step}继续报告草稿',
    'report.hub.deleteDraftLabel': '删除{step}报告草稿',
    'report.hub.deleteAction': '删除',
    'report.hub.step.photo': '照片',
    'report.hub.step.details': '详情',
    'report.hub.step.safety': '安全',
    'report.hub.step.area': '区域',
    'report.hub.step.review': '确认',
    'following.title': '关注',
    'following.subtitle': '获取你关注的猫和区域的去敏更新。',
    'profile.title': '我的',
    'profile.subtitle': '管理隐私、训练授权和可信角色。',
    'common.beta': '封闭测试',
  },
};

export function translate(locale: Locale, key: MessageKey): string {
  return messages[locale][key];
}

type Verification = PublicSighting['verification'];
type TimeBucket = PublicSighting['timeBucket'];

export type CommunityMapCopy = Readonly<{
  viewAction: string;
  followAction: string;
  followDisabledReason: string;
  areaLabel: (ordinal: number) => string;
  activityLabel: (catCount: number, timeBucket: TimeBucket) => string;
  verificationLabel: (verification: Verification) => string;
  timeLabel: (timeBucket: TimeBucket) => string;
  openAreaLabel: (areaLabel: string) => string;
  areaDetailLabel: (areaLabel: string) => string;
  visibleCatsLabel: (catCount: number) => string;
  confirmedCatsLabel: (confirmedCount: number) => string;
  aggregateAccessibilityLabel: (catCount: number, confirmedCount: number) => string;
  viewCatLabel: (alias: string) => string;
  reportFromAreaLabel: (areaLabel: string) => string;
}>;

export function getCommunityMapCopy(locale: Locale): CommunityMapCopy {
  if (locale === 'zh-CN') {
    return {
      viewAction: translate(locale, 'map.detail.viewAction'),
      followAction: translate(locale, 'map.detail.followAction'),
      followDisabledReason: translate(locale, 'map.detail.followDisabledReason'),
      areaLabel: (ordinal) => `社区区域${ordinal}`,
      activityLabel: (catCount, timeBucket) => {
        if (timeBucket === 'today') return `最近延迟时段内有 ${catCount} 只猫活动`;
        if (timeBucket === 'this_week') return `延迟周时段内有 ${catCount} 只猫活动`;
        return `较早的延迟时段内有 ${catCount} 只猫活动`;
      },
      verificationLabel: (verification) => {
        const labels: Record<Verification, string> = {
          reported: '已报告 · 等待社区审核',
          community_confirmed: '社区已确认',
          partner_confirmed: '合作伙伴已确认',
          disputed: '公开信息有争议',
          superseded: '公开身份信息已更新',
        };
        return labels[verification];
      },
      timeLabel: (timeBucket) => {
        if (timeBucket === 'today') return '最近延迟时段内有目击记录';
        if (timeBucket === 'this_week') return '延迟周时段内有目击记录';
        return '较早的延迟时段内有目击记录';
      },
      openAreaLabel: (areaLabel) => `打开${areaLabel}`,
      areaDetailLabel: (areaLabel) => `区域详情：${areaLabel}`,
      visibleCatsLabel: (catCount) => `可查看 ${catCount} 只猫`,
      confirmedCatsLabel: (confirmedCount) => `其中 ${confirmedCount} 只已获社区确认`,
      aggregateAccessibilityLabel: (catCount, confirmedCount) => (
        `可查看 ${catCount} 只猫；其中 ${confirmedCount} 只已获社区确认`
      ),
      viewCatLabel: (alias) => `查看 ${alias}`,
      reportFromAreaLabel: (areaLabel) => `从${areaLabel}提交报告`,
    };
  }

  return {
    viewAction: translate(locale, 'map.detail.viewAction'),
    followAction: translate(locale, 'map.detail.followAction'),
    followDisabledReason: translate(locale, 'map.detail.followDisabledReason'),
    areaLabel: (ordinal) => `Community area ${ordinal}`,
    activityLabel: (catCount, timeBucket) => {
      const catNoun = catCount === 1 ? 'cat' : 'cats';
      if (timeBucket === 'today') return `${catCount} ${catNoun} active in the latest delayed window`;
      if (timeBucket === 'this_week') return `${catCount} ${catNoun} active in the delayed weekly window`;
      return `${catCount} ${catNoun} active in an earlier delayed window`;
    },
    verificationLabel: (verification) => {
      const labels: Record<Verification, string> = {
        reported: 'Reported · awaiting community review',
        community_confirmed: 'Community confirmed',
        partner_confirmed: 'Partner confirmed',
        disputed: 'Public information disputed',
        superseded: 'Public identity updated',
      };
      return labels[verification];
    },
    timeLabel: (timeBucket) => {
      if (timeBucket === 'today') return 'Seen in the latest delayed window';
      if (timeBucket === 'this_week') return 'Seen in the delayed weekly window';
      return 'Seen in an earlier delayed window';
    },
    openAreaLabel: (areaLabel) => `Open ${areaLabel}`,
    areaDetailLabel: (areaLabel) => `Area detail: ${areaLabel}`,
    visibleCatsLabel: (catCount) => `${catCount} ${catCount === 1 ? 'cat' : 'cats'} visible`,
    confirmedCatsLabel: (confirmedCount) => (
      `${confirmedCount} community-confirmed ${confirmedCount === 1 ? 'cat' : 'cats'}`
    ),
    aggregateAccessibilityLabel: (catCount, confirmedCount) => (
      `${catCount} ${catCount === 1 ? 'cat' : 'cats'} visible; ${confirmedCount} community-confirmed ${confirmedCount === 1 ? 'cat' : 'cats'}`
    ),
    viewCatLabel: (alias) => `View ${alias}`,
    reportFromAreaLabel: (areaLabel) => `Report from ${areaLabel}`,
  };
}

export type TabRoute = 'index' | 'map' | 'report' | 'following' | 'profile';

export interface TabDefinition {
  route: TabRoute;
  label: string;
  accessibilityLabel: string;
}

export function getTabDefinitions(locale: Locale): TabDefinition[] {
  if (locale === 'zh-CN') {
    return [
      { route: 'index', label: '附近', accessibilityLabel: '附近的社区猫' },
      { route: 'map', label: '地图', accessibilityLabel: '社区猫地图' },
      { route: 'report', label: '报告', accessibilityLabel: '报告一只社区猫' },
      { route: 'following', label: '关注', accessibilityLabel: '关注的猫和区域' },
      { route: 'profile', label: '我的', accessibilityLabel: '个人资料' },
    ];
  }

  return [
    { route: 'index', label: 'Nearby', accessibilityLabel: 'Nearby community cats' },
    { route: 'map', label: 'Map', accessibilityLabel: 'Community cat map' },
    { route: 'report', label: 'Report', accessibilityLabel: 'Report a community cat' },
    { route: 'following', label: 'Following', accessibilityLabel: 'Followed cats and areas' },
    { route: 'profile', label: 'Profile', accessibilityLabel: 'Your profile' },
  ];
}

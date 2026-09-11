export const TAB_BAR_HEIGHT = 60;
export const tabBarBottom = (safeBottom: number) => Math.max(8, safeBottom - 8);
export const tabBarOcclusion = (safeBottom: number) => TAB_BAR_HEIGHT + tabBarBottom(safeBottom);

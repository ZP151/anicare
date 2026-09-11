/** iOS reports dotted strings such as "26.6.1", not a decimal number. */
export function usesNativeLiquidTabs(platform:string,version:string|number):boolean {
 return platform==='ios' && Number.parseInt(String(version),10)>=26;
}

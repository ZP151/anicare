import type { Locale } from './catalog';

// Only untouched, explicitly synthetic fixtures are translated. Resident names remain verbatim.
const names = [
  ['阿橘', 'Marmalade'], ['小白', 'Cloud'], ['狸花', 'Tiger'], ['小墨', 'Oreo'],
  ['无图样本', 'Echo'], ['旧活动样本', 'Amber'], ['麻糬', 'Mochi'], ['奥利', 'Oliver'],
  ['露娜', 'Luna'], ['胡椒', 'Pepper'], ['小阳', 'Sunny'], ['可可', 'Coco'],
  ['小雪', 'Snowy'], ['午夜', 'Midnight'], ['饼干', 'Biscuit'], ['柳柳', 'Willow'],
] as const;

export function localizedCatName(animalId: string, alias: string, locale: Locale): string {
  const index = names.findIndex((_, i) => animalId === `00000000-0000-4000-8000-00000000a${String(i + 101)}`);
  const pair = names[index];
  if (!pair) return alias;
  const [zh, en] = pair;
  if (![zh, en, `${en} ${zh}`, `${zh} ${en}`, `${zh} / ${en}`, `${zh} · ${en}`].includes(alias)) return alias;
  return locale === 'zh-CN' ? zh : en;
}

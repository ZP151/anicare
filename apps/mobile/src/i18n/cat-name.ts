import type { Locale } from './catalog';

// Only untouched, explicitly synthetic fixtures are translated. Resident names remain verbatim.
const names = [
  ['阿橘', 'Marmalade'], ['小白', 'Cloud'], ['狸花', 'Tiger'], ['小墨', 'Oreo'],
  ['无图样本', 'Echo'], ['旧活动样本', 'Amber'], ['麻糬', 'Mochi'], ['奥利', 'Oliver'],
  ['露娜', 'Luna'], ['胡椒', 'Pepper'], ['小阳', 'Sunny'], ['可可', 'Coco'],
  ['小雪', 'Snowy'], ['午夜', 'Midnight'], ['饼干', 'Biscuit'], ['柳柳', 'Willow'],
  ['阿特拉斯', 'Atlas'], ['枫叶', 'Maple'], ['影子', 'Shadow'], ['四叶', 'Clover'],
  ['海苔', 'Nori'], ['罂粟', 'Poppy'], ['碧玉', 'Jasper'], ['味噌', 'Miso'],
  ['豆腐', 'Tofu'], ['乌檀', 'Sable'], ['像素', 'Pixel'], ['茴香', 'Fennel'],
  ['珠珠', 'Zuzu'], ['彗星', 'Comet'], ['常春藤', 'Ivy'], ['罗文', 'Rowan'],
] as const;

export function localizedCatName(animalId: string, alias: string, locale: Locale): string {
  const index = names.findIndex((_, i) => animalId === `00000000-0000-4000-8000-00000000a${String(i + 101)}`);
  const pair = names[index];
  if (!pair) return alias;
  const [zh, en] = pair;
  const suffix = ` 测试样本 S${String(index + 1).padStart(2, '0')}`;
  const original = alias.endsWith(suffix) ? alias.slice(0, -suffix.length) : alias.replace(/ 测试样本$/, '');
  const variants = zh === '麻糬' ? [zh, '麻薯'] : [zh];
  if (![en, ...variants.flatMap(name => [name, `${en} ${name}`, `${name} ${en}`, `${name} / ${en}`, `${name} · ${en}`])].includes(original)) return alias;
  return locale === 'zh-CN' ? zh : en;
}

/** A separate badge keeps synthetic provenance visible without making it part of a cat's name. */
export function catSampleLabel(animalId: string, locale: Locale): string | null {
  const index = names.findIndex((_, i) => animalId === `00000000-0000-4000-8000-00000000a${String(i + 101)}`);
  return index < 0 ? null : `${locale === 'zh-CN' ? '测试样本' : 'Test sample'} S${String(index + 1).padStart(2, '0')}`;
}

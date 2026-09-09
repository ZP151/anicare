import { localizedCatName } from './cat-name';
import { samples, legacyEnglishNames } from '../../../../tests/test-samples-provisioner/src/fixtures';

it('localises every exact provisioned alias including its test-label suffix', () => {
  samples.forEach(([, id, alias], index) => {
    const label = `测试样本 S${String(index + 1).padStart(2, '0')}`;
    const english = legacyEnglishNames[index];
    const stored = `${english ? `${english} ${alias}` : alias} ${label}`;
    const en = localizedCatName(id, stored, 'en');
    const zh = localizedCatName(id, stored, 'zh-CN');
    expect(en).toMatch(/^[A-Za-z]+$/);
    expect(zh).not.toMatch(/[A-Za-z]|测试样本/);
    expect(localizedCatName(id, `My renamed cat ${label}`, 'en')).toBe(`My renamed cat ${label}`);
  });
});
it('accepts the reported Mochi spelling without translating an unrelated resident alias', () => {
  expect(localizedCatName('00000000-0000-4000-8000-00000000a107', 'Mochi 麻薯 测试样本', 'en')).toBe('Mochi');
  expect(localizedCatName('resident-id', 'Mochi 麻薯 测试样本', 'en')).toBe('Mochi 麻薯 测试样本');
});
it('switches sample names in either direction without altering resident names', () => {
  const id = '00000000-0000-4000-8000-00000000a107';
  expect(localizedCatName(id, 'Mochi 麻糬', 'en')).toBe('Mochi');
  expect(localizedCatName(id, 'Mochi 麻糬', 'zh-CN')).toBe('麻糬');
  expect(localizedCatName(id, 'My renamed cat', 'zh-CN')).toBe('My renamed cat');
  expect(localizedCatName('resident-id', 'Mochi 麻糬', 'en')).toBe('Mochi 麻糬');
  expect(localizedCatName('00000000-0000-4000-8000-00000000a101', '阿橘', 'en')).toBe('Marmalade');
});

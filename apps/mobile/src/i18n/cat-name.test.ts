import { localizedCatName } from './cat-name';
it('switches sample names in either direction without altering resident names', () => {
  const id = '00000000-0000-4000-8000-00000000a107';
  expect(localizedCatName(id, 'Mochi 麻糬', 'en')).toBe('Mochi');
  expect(localizedCatName(id, 'Mochi 麻糬', 'zh-CN')).toBe('麻糬');
  expect(localizedCatName(id, 'My renamed cat', 'zh-CN')).toBe('My renamed cat');
  expect(localizedCatName('resident-id', 'Mochi 麻糬', 'en')).toBe('Mochi 麻糬');
  expect(localizedCatName('00000000-0000-4000-8000-00000000a101', '阿橘', 'en')).toBe('Marmalade');
});

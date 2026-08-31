import { getReportContext } from './report-context';

describe('report context', () => {
  it('retains a valid opaque cat id without turning it into user-facing copy', () => {
    const id = '00000000-0000-4000-8000-000000000102';
    const context = getReportContext(id);
    expect(context).toEqual({ animalId: id, label: 'Linked to the selected community cat' });
    expect(context?.label).not.toContain(id);
  });

  it('drops malformed route context', () => {
    expect(getReportContext('demo-cat')).toBeNull();
    expect(getReportContext(['one', 'two'])).toBeNull();
  });
});

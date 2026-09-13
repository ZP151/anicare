jest.mock('../i18n/LocaleContext',()=>({useLocale:()=>({locale:'en'})}));
import { fireEvent, render, within } from '@testing-library/react-native';

import { CatDetailScreen } from './CatDetailScreen';

describe('CatDetailScreen', () => {
  it('shows only public-safe identity context and completes the report journey', async () => {
    const onReportSighting = jest.fn();
    const view = await render(
      <CatDetailScreen
        cat={{
          animalId: '00000000-0000-4000-8000-000000000102',
          primaryAlias: 'Pepper',
          verificationLabel: 'Community confirmed',
          timeLabel: 'Seen in a delayed weekly window',
        }}
        fixture={false}
        onReportSighting={onReportSighting}
      />,
    );

    expect(within(view.getByTestId('screen-large-title')).getByText('Pepper')).toBeTruthy();
    expect(view.getAllByText('Community confirmed')).toHaveLength(1);
    expect(view.getByText('Seen in a delayed weekly window')).toBeTruthy();
    expect(view.getByText(/Coarse neighbourhood activity/)).toBeTruthy();
    expect(JSON.stringify(view.toJSON())).not.toMatch(/00000000|coordinate|similarity|score|vector/i);

    await fireEvent.press(view.getByRole('button', { name: 'Report a sighting of Pepper' }));
    expect(onReportSighting).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000102');
    await view.unmount();
  });

  it('keeps the cat detail safe when a durable draft cannot be created', async () => {
    const view = await render(
      <CatDetailScreen
        cat={{ animalId: '00000000-0000-4000-8000-000000000102', primaryAlias: 'Pepper', verificationLabel: 'Community confirmed', timeLabel: 'Seen in a delayed weekly window' }}
        fixture={false}
        onReportSighting={async () => { throw new Error('secure_offline_storage_unavailable'); }}
      />,
    );

    await fireEvent.press(view.getByRole('button', { name: 'Report a sighting of Pepper' }));
    expect(await view.findByText('A saved report could not be created. Try again on a native device.')).toBeTruthy();
    await view.unmount();
  });

  it('uses Simplified Chinese copy when durable draft creation fails', async () => {
    const view = await render(
      <CatDetailScreen
        cat={{ animalId: '00000000-0000-4000-8000-000000000102', primaryAlias: 'Pepper', verificationLabel: '社区已确认', timeLabel: '最近延迟周时段内有目击记录' }}
        fixture={false}
        locale="zh-CN"
        onReportSighting={async () => { throw new Error('secure_offline_storage_unavailable'); }}
      />,
    );

    expect(view.getByText('身份状态')).toBeTruthy();
    expect(view.getByText('粗略社区活动')).toBeTruthy();
    expect(view.getByText('这里绝不会显示精确位置、路线或时间戳。')).toBeTruthy();
    expect(JSON.stringify(view.toJSON())).not.toMatch(/coordinate|similarity|score|vector/i);
    await fireEvent.press(view.getByRole('button', { name: '报告 Pepper 的目击记录' }));
    expect(await view.findByText('无法创建已保存的报告，请在原生设备上重试。')).toBeTruthy();
    await view.unmount();
  });
});

it('makes sharing a separate primary action while retaining sightings', async () => {
 const share = jest.fn(), report = jest.fn();
 const view = await render(<CatDetailScreen cat={{ animalId: '00000000-0000-4000-8000-000000000102', primaryAlias: 'Pepper', verificationLabel: 'Reported', timeLabel: 'No public activity yet' }} fixture={false} onShareStory={share} onReportSighting={report} />);
 await fireEvent.press(view.getByRole('button', { name: 'Share a story about Pepper' }));
 expect(share).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000102');
 expect(report).not.toHaveBeenCalled();
 expect(view.getByRole('button', { name: 'Report a sighting of Pepper' })).toBeTruthy();
});

it('keeps the back action and cat identity outside the scrolling story content', async () => {
 const back=jest.fn();
 const view=await render(<CatDetailScreen cat={{animalId:'00000000-0000-4000-8000-000000000102',primaryAlias:'Pepper',verificationLabel:'Reported',timeLabel:'Delayed'}} fixture={false} onBack={back} onReportSighting={jest.fn()}/>);
 expect(within(view.getByTestId('cat-fixed-header')).getByText('Pepper',{includeHiddenElements:true})).toBeTruthy();
 expect(within(view.getByTestId('screen-scroll')).queryByRole('button',{name:'Back'})).toBeNull();
 await fireEvent.press(view.getByRole('button',{name:'Back'}));expect(back).toHaveBeenCalledTimes(1);
});

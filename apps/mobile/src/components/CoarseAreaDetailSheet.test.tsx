import { fireEvent, render } from '@testing-library/react-native';

import type { PublicAreaSummary } from '../maps/public-map-policy';
import { CoarseAreaDetailSheet } from './CoarseAreaDetailSheet';

const area: PublicAreaSummary = {
  areaKey: 'public-area-1',
  label: 'Community area 1',
  activityLabel: '2 cats active in the latest delayed window',
  catCount: 2,
  confirmedCount: 1,
  cats: [
    {
      animalId: 'animal-1',
      alias: 'Pepper',
      verificationLabel: 'Community confirmed',
      timeLabel: 'Seen in the latest delayed window',
    },
    {
      animalId: 'animal-2',
      alias: 'Mochi',
      verificationLabel: 'Reported · awaiting community review',
      timeLabel: 'Seen in the delayed weekly window',
    },
  ],
};

describe('CoarseAreaDetailSheet', () => {
  it('shows safe area context and keeps actions privacy-safe', async () => {
    const onViewCat = jest.fn();
    const onReportFromArea = jest.fn();
    const view = await render(
      <CoarseAreaDetailSheet area={area} onReportFromArea={onReportFromArea} onViewCat={onViewCat} />,
    );

    expect(view.getByText('Community area 1')).toBeTruthy();
    expect(view.getByText('2 cats active in the latest delayed window')).toBeTruthy();
    expect(view.getByText('2 cats visible')).toBeTruthy();
    expect(view.getByText('1 community confirmed')).toBeTruthy();

    await fireEvent.press(view.getByRole('button', { name: 'View Pepper' }));
    await fireEvent.press(view.getByRole('button', { name: 'View Mochi' }));
    await fireEvent.press(view.getByRole('button', { name: 'Report from Community area 1' }));
    expect(onViewCat).toHaveBeenNthCalledWith(1, 'animal-1');
    expect(onViewCat).toHaveBeenNthCalledWith(2, 'animal-2');
    expect(onReportFromArea).toHaveBeenCalledWith();

    const follow = view.getByRole('button', { name: 'Follow area' });
    expect(follow.props.accessibilityState).toEqual({ disabled: true });
    expect(view.getByText('Sign in and hosted follow support are required.')).toBeTruthy();

    const rendered = JSON.stringify(view.toJSON());
    expect(rendered).not.toMatch(/h3|cell|animal-1|animal-2|public-area-1/i);
    await view.unmount();
  });

  it('shows at most three cat rows while retaining the aggregate count', async () => {
    const manyCats: PublicAreaSummary = {
      ...area,
      catCount: 5,
      activityLabel: '5 cats active in the latest delayed window',
      cats: [
        ...area.cats,
        { animalId: 'animal-3', alias: 'Luna', verificationLabel: 'Community confirmed', timeLabel: 'Seen earlier' },
        { animalId: 'animal-4', alias: 'Cleo', verificationLabel: 'Community confirmed', timeLabel: 'Seen earlier' },
        { animalId: 'animal-5', alias: 'Simba', verificationLabel: 'Reported', timeLabel: 'Seen earlier' },
      ],
    };
    const view = await render(
      <CoarseAreaDetailSheet area={manyCats} onReportFromArea={jest.fn()} onViewCat={jest.fn()} />,
    );

    expect(view.getByText('5 cats visible')).toBeTruthy();
    expect(view.getByRole('button', { name: 'View Pepper' })).toBeTruthy();
    expect(view.getByRole('button', { name: 'View Mochi' })).toBeTruthy();
    expect(view.getByRole('button', { name: 'View Luna' })).toBeTruthy();
    expect(view.queryByRole('button', { name: 'View Cleo' })).toBeNull();
    expect(view.queryByRole('button', { name: 'View Simba' })).toBeNull();
    await view.unmount();
  });
});

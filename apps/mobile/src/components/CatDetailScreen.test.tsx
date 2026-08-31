import { fireEvent, render } from '@testing-library/react-native';

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

    expect(view.getByText('Pepper')).toBeTruthy();
    expect(view.getByText('Community confirmed')).toBeTruthy();
    expect(view.getByText('Seen in a delayed weekly window')).toBeTruthy();
    expect(view.getByText(/Coarse neighbourhood activity/)).toBeTruthy();
    expect(JSON.stringify(view.toJSON())).not.toMatch(/00000000|coordinate|similarity|score|vector/i);

    await fireEvent.press(view.getByRole('button', { name: 'Report a sighting of Pepper' }));
    expect(onReportSighting).toHaveBeenCalledTimes(1);
    await view.unmount();
  });
});

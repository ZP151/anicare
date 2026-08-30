import { fireEvent, render } from '@testing-library/react-native';

import { AnchoredCatSheet } from './AnchoredCatSheet';

describe('AnchoredCatSheet', () => {
  it('renders a safe public summary and exposes both primary journeys', async () => {
    const onViewCat = jest.fn();
    const onReportSighting = jest.fn();
    const view = await render(
      <AnchoredCatSheet
        cat={{
          animalId: '00000000-0000-4000-8000-000000000102',
          primaryAlias: 'Pepper',
          verificationLabel: 'Community confirmed',
          timeLabel: 'Seen this week',
        }}
        fixture={false}
        onReportSighting={onReportSighting}
        onViewCat={onViewCat}
      />,
    );

    expect(view.getByText('Pepper')).toBeTruthy();
    expect(view.getByText('Community confirmed')).toBeTruthy();
    expect(view.getByText('Seen this week')).toBeTruthy();
    expect(view.queryByText(/00000000/)).toBeNull();

    await fireEvent.press(view.getByRole('button', { name: 'View Pepper' }));
    await fireEvent.press(view.getByRole('button', { name: 'Report a sighting of Pepper' }));
    expect(onViewCat).toHaveBeenCalledTimes(1);
    expect(onReportSighting).toHaveBeenCalledTimes(1);
    await view.unmount();
  });

  it('labels synthetic content once', async () => {
    const view = await render(
      <AnchoredCatSheet
        cat={{
          animalId: 'demo-cat',
          displayAlias: 'Mochi · 麻糬',
          primaryAlias: 'Mochi',
          verificationLabel: 'Community confirmed',
          timeLabel: 'Seen this afternoon',
        }}
        fixture
        onReportSighting={jest.fn()}
        onViewCat={jest.fn()}
      />,
    );

    expect(view.getAllByText('Preview data')).toHaveLength(1);
    expect(view.getByText('Mochi · 麻糬')).toBeTruthy();
    expect(view.getByRole('button', { name: 'View Mochi' })).toBeTruthy();
    expect(view.getByText('Report sighting').props.numberOfLines).toBe(1);

    await view.unmount();
  });
});

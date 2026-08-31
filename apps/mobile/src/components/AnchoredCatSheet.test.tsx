import { fireEvent, render } from '@testing-library/react-native';
import { Platform, StyleSheet } from 'react-native';

import { AnchoredCatSheet, getActionMinHeight } from './AnchoredCatSheet';

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

    const reportSighting = view.getByRole('button', { name: 'Report a sighting of Mochi' });
    const reportSightingStyle = StyleSheet.flatten(reportSighting.props.style);
    const viewCat = view.getByRole('button', { name: 'View Mochi' });
    const viewCatStyle = StyleSheet.flatten(viewCat.props.style);
    expect(getActionMinHeight('android')).toBe(48);
    expect(getActionMinHeight('ios')).toBe(44);
    expect(getActionMinHeight('web')).toBe(44);
    expect(reportSightingStyle.minHeight).toBe(getActionMinHeight(Platform.OS));
    expect(viewCatStyle.minHeight).toBe(getActionMinHeight(Platform.OS));
    expect(reportSightingStyle.height).toBeUndefined();
    expect(view.getByText('Report sighting').props.numberOfLines).toBeUndefined();
    expect(reportSighting.props.hitSlop).toBeUndefined();
    expect(viewCat.props.hitSlop).toBeUndefined();

    await view.unmount();
  });

  it('uses opacity-only press feedback for frequent sheet actions', async () => {
    const view = await render(
      <AnchoredCatSheet
        cat={{
          animalId: 'demo-cat',
          primaryAlias: 'Mochi',
          verificationLabel: 'Community confirmed',
          timeLabel: 'Seen this afternoon',
        }}
        fixture={false}
        onReportSighting={jest.fn()}
        onViewCat={jest.fn()}
      />,
    );

    const viewCat = view.getByRole('button', { name: 'View Mochi' });
    await fireEvent(viewCat, 'responderGrant', { nativeEvent: {}, persist: jest.fn() });
    const pressedStyle = StyleSheet.flatten(viewCat.props.style);
    expect(pressedStyle.opacity).toBeLessThan(1);
    expect(pressedStyle.transform).toBeUndefined();

    await view.unmount();
  });
});

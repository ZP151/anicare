import { fireEvent, render } from '@testing-library/react-native';
import { Pressable } from 'react-native';

jest.mock('react-native-maps', () => ({
  __esModule: true,
  default: () => null,
  PROVIDER_GOOGLE: 'google',
}));

import { ReportAreaPicker } from './ReportAreaPicker.native';

function NativeMapBoundary({ onPress }: Readonly<{ onPress(event: { nativeEvent: { coordinate: { latitude: number; longitude: number } } }): void }>) {
  return <Pressable accessibilityRole="button" accessibilityLabel="Google map" onPress={() => onPress({ nativeEvent: { coordinate: { latitude: 1.3521, longitude: 103.8198 } } })} />;
}

describe('ReportAreaPicker native privacy boundary', () => {
  it('coarsens a Google map tap before notifying its parent', async () => {
    const onSelect = jest.fn();
    const view = await render(<ReportAreaPicker MapBoundary={NativeMapBoundary as never} onSelect={onSelect} />);

    await fireEvent.press(view.getByRole('button', { name: 'Google map' }));

    expect(onSelect).toHaveBeenCalledWith({ publicCellId: '89652636d87ffff' });
    expect(JSON.stringify(onSelect.mock.calls)).not.toContain('1.3521');
    expect(JSON.stringify(onSelect.mock.calls)).not.toContain('103.8198');
    await view.unmount();
  });
});

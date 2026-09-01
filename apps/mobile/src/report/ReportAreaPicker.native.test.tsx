import { fireEvent, render } from '@testing-library/react-native';
import { Pressable } from 'react-native';

const mockMapProps = jest.fn();

jest.mock('react-native-maps', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => { mockMapProps(props); return null; },
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

  it('renders native manual-area instructions in Simplified Chinese', async () => {
    const view = await render(<ReportAreaPicker locale="zh-CN" onSelect={jest.fn()} />);

    expect(view.getByLabelText('在 Google 地图上选择宽泛区域')).toBeTruthy();
    expect(view.getByText('点按宽泛地图以选择粗略区域，精确点按位置会立即丢弃。')).toBeTruthy();
    await view.unmount();
  });

  it('exposes the manual-area map as an accessible selection control', async () => {
    mockMapProps.mockClear();
    const view = await render(<ReportAreaPicker onSelect={jest.fn()} />);

    expect(mockMapProps.mock.calls.at(-1)?.[0]).toMatchObject({
      accessibilityLabel: 'Choose a coarse area on a Google map',
      accessibilityRole: 'button',
    });
    await view.unmount();
  });
});

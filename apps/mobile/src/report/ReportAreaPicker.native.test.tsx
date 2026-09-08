import { act, fireEvent, render } from '@testing-library/react-native';
import { Pressable } from 'react-native';

const mockMapProps = jest.fn();

jest.mock('react-native-maps', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => { mockMapProps(props); return null; },
  PROVIDER_GOOGLE: 'google',
}));

import { ReportAreaPicker } from './ReportAreaPicker.native';

function NativeMapBoundary({ onPress }: Readonly<{ onPress(event: { nativeEvent: { coordinate: { latitude: number; longitude: number } } }): void }>) {
  return <Pressable accessibilityRole="button" accessibilityLabel="Apple map" onPress={() => onPress({ nativeEvent: { coordinate: { latitude: 1.3521, longitude: 103.8198 } } })} />;
}

function OutsideSingaporeMapBoundary({ onPress }: Readonly<{ onPress(event: { nativeEvent: { coordinate: { latitude: number; longitude: number } } }): void }>) {
  return <Pressable accessibilityRole="button" accessibilityLabel="Outside map" onPress={() => onPress({ nativeEvent: { coordinate: { latitude: 35.6762, longitude: 139.6503 } } })} />;
}

describe('ReportAreaPicker native privacy boundary', () => {
  beforeEach(() => { mockMapProps.mockClear(); });
  it('coarsens an Apple map tap before notifying its parent without a Google key', async () => {
    const onSelect = jest.fn();
    const view = await render(<ReportAreaPicker androidGoogleMapsConfigured={false} MapBoundary={NativeMapBoundary as never} onSelect={onSelect} />);

    await fireEvent.press(view.getByRole('button', { name: 'Apple map' }));

    expect(onSelect).toHaveBeenCalledWith({ publicCellId: '89652636d87ffff' });
    expect(JSON.stringify(onSelect.mock.calls)).not.toContain('1.3521');
    expect(JSON.stringify(onSelect.mock.calls)).not.toContain('103.8198');
    await view.unmount();
  });

  it('renders native manual-area instructions in Simplified Chinese', async () => {
    const view = await render(<ReportAreaPicker androidGoogleMapsConfigured={false} locale="zh-CN" onSelect={jest.fn()} />);

    expect(view.getByLabelText('在地图上选择宽泛区域')).toBeTruthy();
    expect(view.getByText('点按宽泛地图以选择粗略区域，精确点按位置会立即丢弃。')).toBeTruthy();
    await view.unmount();
  });

  it('rejects taps outside Singapore before H3 selection leaves the picker', async () => {
    const onSelect = jest.fn();
    const view = await render(<ReportAreaPicker androidGoogleMapsConfigured={false} locale="zh-CN" MapBoundary={OutsideSingaporeMapBoundary as never} onSelect={onSelect} />);

    await fireEvent.press(view.getByRole('button', { name: 'Outside map' }));

    expect(onSelect).not.toHaveBeenCalled();
    expect(view.getByText('请选择新加坡境内的宽泛区域。')).toBeTruthy();
  });

  it('exposes the manual-area map as an accessible selection control', async () => {
    mockMapProps.mockClear();
    const view = await render(<ReportAreaPicker androidGoogleMapsConfigured={false} onSelect={jest.fn()} />);

    expect(mockMapProps.mock.calls.at(-1)?.[0]).toMatchObject({
      accessibilityLabel: 'Choose a coarse area on the map',
      accessibilityRole: 'button',
      provider: undefined,
    });
    await view.unmount();
  });

  it('falls back to the truthful area list when the provider never becomes ready', async () => {
    jest.useFakeTimers();
    const view = await render(<ReportAreaPicker androidGoogleMapsConfigured={false} onSelect={jest.fn()} />);
    await act(async () => { jest.advanceTimersByTime(10_000); });
    expect(view.getByText('The map is unavailable. Choose a community location that corresponds to one actual H3-9 cell.')).toBeTruthy();
    jest.useRealTimers();
  });
});

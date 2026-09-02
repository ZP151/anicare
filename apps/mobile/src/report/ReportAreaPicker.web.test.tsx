import { render } from '@testing-library/react-native';

import { ReportAreaPicker } from './ReportAreaPicker.web';

describe('ReportAreaPicker web truthfulness', () => {
  it('visibly disables all area capture because secure native location storage is unavailable', async () => {
    const view = await render(<ReportAreaPicker onSelect={jest.fn()} />);

    expect(view.getByText('Area capture is available only in native iOS and Android builds.')).toBeTruthy();
    expect(view.getByRole('button', { name: 'Use device location' }).props.accessibilityState).toEqual({ disabled: true });
    expect(view.getByRole('button', { name: 'Choose an area on the map' }).props.accessibilityState).toEqual({ disabled: true });
    await view.unmount();
  });

  it('uses the Simplified Chinese area-unavailable copy without English fallback', async () => {
    const view = await render(<ReportAreaPicker locale="zh-CN" onSelect={jest.fn()} />);

    expect(view.getByText('区域采集仅可在原生 iOS 和 Android 版本中使用。')).toBeTruthy();
    expect(view.getByRole('button', { name: '使用设备位置' }).props.accessibilityState).toEqual({ disabled: true });
    expect(view.getByRole('button', { name: '在地图上选择区域' }).props.accessibilityState).toEqual({ disabled: true });
    await view.unmount();
  });
});

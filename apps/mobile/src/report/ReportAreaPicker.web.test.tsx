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
});

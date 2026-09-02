import { fireEvent, render } from '@testing-library/react-native';

import { ReportRouteShell } from './ReportRouteShell';

const draftId = '00000000-0000-4000-8000-000000000102';

describe('ReportRouteShell', () => {
  it('keeps a valid saved-draft route truthful and offers an accessible return to the hub', async () => {
    const navigate = jest.fn();
    const view = await render(<ReportRouteShell kind="draft" locale="en" reportId={draftId} navigate={navigate} />);

    expect(view.getByText('Saved report ready')).toBeTruthy();
    expect(view.getByText('This route shell does not change your saved report.')).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: 'Back to Report' }));
    expect(navigate).toHaveBeenCalledWith('/report');
    await view.unmount();
  });

  it('rejects an invalid route ID without surfacing a presentation key', async () => {
    const view = await render(<ReportRouteShell kind="draft" locale="en" reportId="public-area-1" navigate={jest.fn()} />);

    expect(view.getByText('A valid saved-report ID is required to continue.')).toBeTruthy();
    expect(JSON.stringify(view.toJSON())).not.toContain('public-area-1');
    await view.unmount();
  });

  it('keeps receipt and history shells bilingual and intentionally incomplete', async () => {
    const receipt = await render(<ReportRouteShell kind="receipt" locale="zh-CN" reportId={draftId} navigate={jest.fn()} />);
    expect(receipt.getByText('报告回执')).toBeTruthy();
    expect(receipt.getByText('完整回执将在报告提交后显示。')).toBeTruthy();
    await receipt.unmount();

    const history = await render(<ReportRouteShell kind="history" locale="zh-CN" navigate={jest.fn()} />);
    expect(history.getByText('我的报告')).toBeTruthy();
    expect(history.getByText('已提交报告的历史记录将显示在这里。')).toBeTruthy();
    await history.unmount();
  });
});

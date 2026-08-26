import { render } from '@testing-library/react-native';

jest.mock('@shopify/react-native-skia', () => ({ ImageFormat: { JPEG: 3 }, Skia: {} }));
jest.mock('../components/ScreenScaffold', () => {
  const React = require('react');
  const { Text, View } = require('react-native');
  return {
    ScreenScaffold: ({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) =>
      React.createElement(View, null, React.createElement(Text, null, title), React.createElement(Text, null, subtitle), children),
  };
});
jest.mock('expo-router', () => ({
  router: { back: jest.fn() },
  useLocalSearchParams: () => ({ draftId: 'draft-12345678' }),
}));

import RedactionReviewScreen from '../../app/report/redaction-review';

describe('private redaction review screen', () => {
  it('states that every automatic detector is unavailable and offers no publication action', async () => {
    const view = await render(<RedactionReviewScreen />);

    expect(view.getByText('People detection: unavailable')).toBeTruthy();
    expect(view.getByText('Licence-plate detection: unavailable')).toBeTruthy();
    expect(view.getByText('Cat detection: unavailable')).toBeTruthy();
    expect(view.getByRole('button', { name: 'Choose photo for private review' })).toBeTruthy();
    expect(view.queryByText(/public upload|publish/i)).toBeNull();
  });
});

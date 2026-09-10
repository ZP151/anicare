import { act, render } from '@testing-library/react-native';
import { Text } from 'react-native';

import { ScreenScaffold } from './ScreenScaffold';

it('keeps its content visible while an accessible pull refresh is requested', async () => {
  const onRefresh = jest.fn();
  const view = await render(<ScreenScaffold compact title="Community" onRefresh={onRefresh}><Text>Existing post remains visible</Text></ScreenScaffold>);

  await act(async () => view.getByTestId('screen-scroll').props.refreshControl.props.onRefresh());

  expect(onRefresh).toHaveBeenCalledTimes(1);
  expect(view.getByText('Existing post remains visible')).toBeTruthy();
  await view.unmount();
});

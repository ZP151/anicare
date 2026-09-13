import { act, render, within } from '@testing-library/react-native';
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

it('does not add an automatic scroll inset beneath an existing native header',async()=>{
 const view=await render(<ScreenScaffold hasNativeHeader compact title="Receipt"><Text>Report received</Text></ScreenScaffold>);
 expect(view.getByTestId('screen-scroll').props.contentInsetAdjustmentBehavior).toBe('never');
 await view.unmount();
});


it('pins back navigation and its identity copy outside the scrolling content', async () => {
 const view = await render(<ScreenScaffold title="A very long conversation name" subtitle="Neighbourhood context" leading={<Text>Return action</Text>}><Text>Messages</Text></ScreenScaffold>);
 const header = view.getByTestId('screen-fixed-header');
 expect(within(header).getByText('Return action')).toBeTruthy();
 expect(within(header).getByText('Neighbourhood context')).toBeTruthy();
 expect(within(view.getByTestId('screen-scroll')).queryByText('Return action')).toBeNull();
 expect(within(view.getByTestId('screen-scroll')).getByText('Messages')).toBeTruthy();
 await view.unmount();
});
it('renders one custom identity header without a second scrolling title', async () => {
 const view = await render(<ScreenScaffold title="Post" leading={<Text>Unused return</Text>} header={<Text>Author identity</Text>}><Text>Story</Text></ScreenScaffold>);
 expect(view.queryByText('Post')).toBeNull();
 expect(view.queryByText('Unused return')).toBeNull();
 expect(within(view.getByTestId('screen-fixed-header')).getByText('Author identity')).toBeTruthy();
 await view.unmount();
});

it('keeps a close-only modal heading outside the scroll area',async()=>{
 const view=await render(<ScreenScaffold pinHeading title="Drafts" trailing={<Text>Close drafts</Text>}><Text>Saved draft</Text></ScreenScaffold>);
 expect(within(view.getByTestId('screen-fixed-header')).getByText('Close drafts')).toBeTruthy();
 expect(within(view.getByTestId('screen-scroll')).queryByText('Close drafts')).toBeNull();
 await view.unmount();
});

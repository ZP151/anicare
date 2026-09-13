import { act, fireEvent, render, within } from '@testing-library/react-native';
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

it('floats chrome over the scroll viewport and reserves measured initial space',async()=>{
 const view=await render(<ScreenScaffold title="Neighbour" leading={<Text>Back</Text>}><Text>Content</Text></ScreenScaffold>);
 const header=view.getByTestId('screen-fixed-header');
 expect(require('react-native').StyleSheet.flatten(header.props.style).position).toBe('absolute');
 await act(async()=>header.props.onLayout({nativeEvent:{layout:{height:76}}}));
 expect(require('react-native').StyleSheet.flatten(view.getByTestId('screen-scroll').props.contentContainerStyle).paddingTop).toBeGreaterThanOrEqual(88);
 await view.unmount();
});
it('offers a large scrolling title and a compact glass title for collapse mode',async()=>{
 const view=await render(<ScreenScaffold collapseTitle title="Imported Notes" leading={<Text>Back</Text>}><Text>Items</Text></ScreenScaffold>);
 expect(within(view.getByTestId('screen-scroll')).getByTestId('screen-large-title')).toBeTruthy();
 expect(within(view.getByTestId('screen-fixed-header')).queryByText('Imported Notes')).toBeNull();
 await fireEvent.scroll(view.getByTestId('screen-scroll'),{nativeEvent:{contentOffset:{y:160,x:0}}});
 expect(within(view.getByTestId('screen-fixed-header')).getByText('Imported Notes')).toBeTruthy();
 expect(view.queryByTestId('screen-large-title')).toBeNull();
 await view.unmount();
});

it('keeps the floating footer inside the bottom safe area and reserves measured space',async()=>{
 const {SafeAreaInsetsContext}=require('react-native-safe-area-context');
 const view=await render(<SafeAreaInsetsContext.Provider value={{top:59,bottom:34,left:0,right:0}}><ScreenScaffold title="Thread" leading={<Text>Back</Text>} footer={<Text>Reply composer</Text>}><Text>Last message</Text></ScreenScaffold></SafeAreaInsetsContext.Provider>);
 const footer=view.getByTestId('screen-fixed-footer');
 expect(require('react-native').StyleSheet.flatten(footer.props.style)).toMatchObject({position:'absolute',bottom:34});
 await act(async()=>footer.props.onLayout({nativeEvent:{layout:{height:92}}}));
 expect(require('react-native').StyleSheet.flatten(view.getByTestId('screen-scroll').props.contentContainerStyle).paddingBottom).toBeGreaterThanOrEqual(142);
 await view.unmount();
});

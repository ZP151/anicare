import {fireEvent,render} from '@testing-library/react-native';
jest.mock('react-native-safe-area-context',()=>require('react-native-safe-area-context/jest/mock').default);
jest.mock('../i18n/LocaleContext',()=>({useLocale:()=>({locale:'en'})}));
jest.mock('./CommunityPostImage',()=>({CommunityPostImage:()=>null}));
import {PostGallery} from './PostGallery';
const media=[{mediaId:'one',width:1200,height:800},{mediaId:'two',width:800,height:1200}];
it('opens the selected photo with a reachable close action and supports tap dismissal',async()=>{
 const view=await render(<PostGallery postId="post" media={media as never}/>);
 await fireEvent.press(view.getByRole('button',{name:'Open photo 2'}));
 expect(view.getByRole('button',{name:'Close photos'})).toBeTruthy();
 await fireEvent.press(view.getAllByRole('button',{name:'Tap to close photo'})[1]!);
 expect(view.queryByRole('button',{name:'Close photos'})).toBeNull();
 await view.unmount();
});
it('uses the measured safe viewport and keeps paging from stealing a zoomed image drag',async()=>{
 const view=await render(<PostGallery postId="post" media={media as never}/>);
 await fireEvent.press(view.getByRole('button',{name:'Open photo 1'}));
 await fireEvent(view.getByTestId('photo-viewport'),'layout',{nativeEvent:{layout:{width:390,height:640}}});
 expect(view.getByTestId('photo-zoom-0').props.maximumZoomScale).toBe(4);
 await fireEvent.scroll(view.getByTestId('photo-zoom-0'),{nativeEvent:{zoomScale:2,contentOffset:{x:0,y:0}}});
 expect(view.getByTestId('fullscreen-pages').props.scrollEnabled).toBe(false);
 await fireEvent.scroll(view.getByTestId('photo-zoom-0'),{nativeEvent:{zoomScale:1,contentOffset:{x:0,y:0}}});
 expect(view.getByTestId('fullscreen-pages').props.scrollEnabled).toBe(true);
 await fireEvent.press(view.getByRole('button',{name:'Close photos'}));
 await view.unmount();
});

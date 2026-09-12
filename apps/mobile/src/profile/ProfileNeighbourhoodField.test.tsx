import {fireEvent,render} from '@testing-library/react-native';
let mockLocale='en';
jest.mock('../i18n/LocaleContext',()=>({useLocale:()=>({locale:mockLocale})}));
import {ProfileNeighbourhoodField,profileNeighbourhood} from './ProfileNeighbourhoodField';
it('keeps the same selected ID while localizing and searching neighbourhood labels',async()=>{
 const change=jest.fn();mockLocale='en';const view=await render(<ProfileNeighbourhoodField value="sg-clsz05" onChange={change}/>);
 expect(view.getByRole('button',{name:'Neighbourhood: West Coast'})).toBeTruthy();
 mockLocale='zh-CN';await view.rerender(<ProfileNeighbourhoodField value="sg-clsz05" onChange={change}/>);
 await fireEvent.press(view.getByRole('button',{name:'邻里：西海岸 · West Coast'}));await fireEvent.changeText(view.getByLabelText('搜索邻里'),'西海岸');
 const selected=view.getByRole('radio',{name:'西海岸 · West Coast'});expect(selected.props.accessibilityState.checked).toBe(true);
 await fireEvent.press(selected);expect(change).toHaveBeenCalledWith('sg-clsz05');await view.unmount();
});
it('offers an empty search state without replacing the current value and disables changes while saving',async()=>{
 mockLocale='en';const change=jest.fn(),view=await render(<ProfileNeighbourhoodField value="clementi" onChange={change}/>);
 await fireEvent.press(view.getByRole('button',{name:'Neighbourhood: Clementi'}));await fireEvent.changeText(view.getByLabelText('Search neighbourhood'),'no-such-neighbourhood');
 expect(view.getByText('No neighbourhoods found')).toBeTruthy();expect(change).not.toHaveBeenCalled();
 await view.rerender(<ProfileNeighbourhoodField value="clementi" onChange={change} disabled/>);await fireEvent.press(view.getByRole('button',{name:'Clear neighbourhood'}));expect(change).not.toHaveBeenCalled();await view.unmount();
});
it('normalizes only recognized IDs, never a coordinate or free-text address',()=>{
 expect(profileNeighbourhood('sg-clsz05')).toBe('sg-clsz05');
 for(const value of [undefined,null,'not-real',{latitude:1.3,longitude:103.8},'My building'])expect(profileNeighbourhood(value)).toBeNull();
});

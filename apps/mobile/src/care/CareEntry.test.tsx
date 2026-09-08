import { fireEvent, render } from '@testing-library/react-native';
import { CareEntry } from './CareEntry';

const animalId='00000000-0000-4000-8000-000000000201';
describe('CareEntry',()=>{
 it('keeps one request and payload for a response-loss retry',async()=>{
  const submit=jest.fn().mockRejectedValueOnce(new Error('lost_response')).mockResolvedValueOnce(undefined);
  const view=await render(<CareEntry animalId={animalId} locale="en" signedIn createId={()=>'00000000-0000-4000-8000-000000000202'} onSubmit={submit}/>);
  await fireEvent.press(view.getByText('Feed'));
  await fireEvent.press(view.getByText('MacRitchie'));
  await fireEvent.press(view.getAllByText('Record completed care').at(-1)!);
  expect(await view.findByText(/could not confirm/i)).toBeTruthy();
  const first=submit.mock.calls[0][0];
  await fireEvent.press(view.getByText('Retry'));
  expect(submit.mock.calls[1][0]).toEqual(first);
 });
});

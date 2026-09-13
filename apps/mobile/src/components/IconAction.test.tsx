import { fireEvent, render } from '@testing-library/react-native';
import { IconAction } from './IconAction';
import { InfoDisclosure } from './InfoDisclosure';

it('keeps icon actions named, selected and inactive while busy', async () => {
  const onPress = jest.fn();
  const view = await render(<IconAction icon="save" label="Save draft" onPress={onPress} selected />);
  expect(view.queryByText('Save draft')).toBeNull();
  expect(view.getByRole('button', {name:'Save draft'}).props.accessibilityState.selected).toBe(true);
  await fireEvent.press(view.getByLabelText('Save draft'));
  expect(onPress).toHaveBeenCalledTimes(1);
  await view.rerender(<IconAction icon="save" label="Save draft" onPress={onPress} busy />);
  await fireEvent.press(view.getByLabelText('Save draft'));
  expect(onPress).toHaveBeenCalledTimes(1);
  expect(view.getByLabelText('Save draft').props.accessibilityState.busy).toBe(true);
  await view.unmount();
});
it('lets users reveal and hide the explanation without navigating away', async () => {
  const view = await render(<InfoDisclosure label="About identity linking">Linking requires review.</InfoDisclosure>);
  expect(view.queryByText('Linking requires review.')).toBeNull();
  await fireEvent.press(view.getByLabelText('About identity linking'));
  expect(view.getByText('Linking requires review.')).toBeTruthy();
  expect(view.getByLabelText('About identity linking').props.accessibilityState.expanded).toBe(true);
  await fireEvent.press(view.getByLabelText('About identity linking'));
  expect(view.queryByText('Linking requires review.')).toBeNull();
  await view.unmount();
});

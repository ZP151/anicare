import { fireEvent, render } from '@testing-library/react-native';

import { MaskEditorOverlay } from './MaskEditorOverlay';
import type { PrivacyMask } from './contracts';

const firstMask: PrivacyMask = {
  id: 'mask-one',
  rect: { x: 0.2, y: 0.2, width: 0.3, height: 0.4 },
};
const secondMask: PrivacyMask = {
  id: 'mask-two',
  rect: { x: 0.55, y: 0.25, width: 0.2, height: 0.2 },
};

type OverlayOptions = Partial<React.ComponentProps<typeof MaskEditorOverlay>>;
type OverlayView = Awaited<ReturnType<typeof render>>;

async function renderOverlay(options: OverlayOptions = {}) {
  const onSelectionChange = jest.fn();
  const onMutationPreview = jest.fn();
  const onMutationCommit = jest.fn();
  const view = await render(
    <MaskEditorOverlay
      imageWidth={200}
      imageHeight={100}
      frameWidth={200}
      frameHeight={100}
      masks={[]}
      selectedMaskId={null}
      disabled={false}
      createMaskId={() => 'mask-created'}
      onSelectionChange={onSelectionChange}
      onMutationPreview={onMutationPreview}
      onMutationCommit={onMutationCommit}
      {...options}
    />,
  );
  return Object.assign(view, { onSelectionChange, onMutationPreview, onMutationCommit });
}

function pointer(x: number, y: number) {
  return { nativeEvent: { locationX: x, locationY: y } };
}

async function grant(view: OverlayView, x: number, y: number) {
  await fireEvent(view.getByTestId('mask-editor-overlay'), 'responderGrant', pointer(x, y));
}

async function move(view: OverlayView, x: number, y: number) {
  await fireEvent(view.getByTestId('mask-editor-overlay'), 'responderMove', pointer(x, y));
}

async function release(view: OverlayView, x: number, y: number) {
  await fireEvent(view.getByTestId('mask-editor-overlay'), 'responderRelease', pointer(x, y));
}

describe('MaskEditorOverlay', () => {
  it('adds and selects one bounded default mask after an empty image tap', async () => {
    const view = await renderOverlay();

    await grant(view, 100, 50);
    await release(view, 100, 50);

    const expected = [{ id: 'mask-created', rect: { x: 0.38, y: 0.43, width: 0.24, height: 0.14 } }];
    expect(view.onSelectionChange).toHaveBeenCalledWith('mask-created');
    expect(view.onMutationCommit).toHaveBeenCalledWith(expected);
    expect(view.onMutationPreview).not.toHaveBeenCalled();
  });

  it('selects a touched mask without adding or mutating it', async () => {
    const view = await renderOverlay({ masks: [firstMask] });

    await grant(view, 70, 40);
    await release(view, 70, 40);

    expect(view.onSelectionChange).toHaveBeenCalledWith('mask-one');
    expect(view.onMutationPreview).not.toHaveBeenCalled();
    expect(view.onMutationCommit).not.toHaveBeenCalled();
  });

  it('treats a corner on an unselected mask as a body drag after selecting it', async () => {
    const view = await renderOverlay({ masks: [firstMask], selectedMaskId: null });

    await grant(view, 40, 20);
    await move(view, 60, 30);
    await release(view, 60, 30);

    expect(view.onSelectionChange).toHaveBeenCalledWith('mask-one');
    expect(view.onMutationCommit).toHaveBeenCalledWith([
      { id: 'mask-one', rect: { x: 0.3, y: 0.3, width: 0.3, height: 0.4 } },
    ]);
  });

  it('previews and commits one bounded selected-mask body move', async () => {
    const view = await renderOverlay({ masks: [firstMask], selectedMaskId: 'mask-one' });

    await grant(view, 70, 40);
    await move(view, 190, 90);
    await release(view, 190, 90);

    const expected = [{ id: 'mask-one', rect: { x: 0.7, y: 0.6, width: 0.3, height: 0.4 } }];
    expect(view.onMutationPreview).toHaveBeenCalledWith(expected);
    expect(view.onMutationCommit).toHaveBeenCalledTimes(1);
    expect(view.onMutationCommit).toHaveBeenCalledWith(expected);
  });

  it.each([
    ['top_left', 40, 20, 20, 10, { x: 0.1, y: 0.1, width: 0.4, height: 0.5 }],
    ['top_right', 100, 20, 120, 10, { x: 0.2, y: 0.1, width: 0.4, height: 0.5 }],
    ['bottom_left', 40, 60, 20, 70, { x: 0.1, y: 0.2, width: 0.4, height: 0.5 }],
    ['bottom_right', 100, 60, 120, 70, { x: 0.2, y: 0.2, width: 0.4, height: 0.5 }],
  ])('commits the expected %s corner resize', async (_corner, startX, startY, endX, endY, rect) => {
    const view = await renderOverlay({ masks: [firstMask], selectedMaskId: 'mask-one' });

    await grant(view, startX, startY);
    await move(view, endX, endY);
    await release(view, endX, endY);

    expect(view.onMutationCommit).toHaveBeenCalledWith([{ id: 'mask-one', rect }]);
  });

  it('deletes only the selected mask', async () => {
    const view = await renderOverlay({ masks: [firstMask, secondMask], selectedMaskId: 'mask-one' });

    await fireEvent.press(view.getByRole('button', { name: 'Delete selected mask' }));

    expect(view.onMutationCommit).toHaveBeenCalledWith([secondMask]);
    expect(view.onSelectionChange).toHaveBeenCalledWith(null);
  });

  it('keeps selection through ordinary rerenders and clears it if that ID disappears', async () => {
    const view = await renderOverlay({ masks: [firstMask], selectedMaskId: 'mask-one' });

    await view.rerender(
      <MaskEditorOverlay
        imageWidth={200}
        imageHeight={100}
        frameWidth={200}
        frameHeight={100}
        masks={[firstMask]}
        selectedMaskId="mask-one"
        disabled={false}
        createMaskId={() => 'mask-created'}
        onSelectionChange={view.onSelectionChange}
        onMutationPreview={view.onMutationPreview}
        onMutationCommit={view.onMutationCommit}
      />,
    );
    expect(view.onSelectionChange).not.toHaveBeenCalled();

    await view.rerender(
      <MaskEditorOverlay
        imageWidth={200}
        imageHeight={100}
        frameWidth={200}
        frameHeight={100}
        masks={[]}
        selectedMaskId="mask-one"
        disabled={false}
        createMaskId={() => 'mask-created'}
        onSelectionChange={view.onSelectionChange}
        onMutationPreview={view.onMutationPreview}
        onMutationCommit={view.onMutationCommit}
      />,
    );
    expect(view.onSelectionChange).toHaveBeenCalledWith(null);
  });

  it('emits no mutation while disabled', async () => {
    const view = await renderOverlay({ masks: [firstMask], selectedMaskId: 'mask-one', disabled: true });

    await grant(view, 70, 40);
    await move(view, 90, 40);
    await release(view, 90, 40);
    await fireEvent.press(view.getByRole('button', { name: 'Move selected mask left' }));
    await fireEvent.press(view.getByRole('button', { name: 'Delete selected mask' }));

    expect(view.onSelectionChange).not.toHaveBeenCalled();
    expect(view.onMutationPreview).not.toHaveBeenCalled();
    expect(view.onMutationCommit).not.toHaveBeenCalled();
  });

  it.each([
    ['Move selected mask left', { x: 0.18, y: 0.2, width: 0.3, height: 0.4 }],
    ['Move selected mask right', { x: 0.22, y: 0.2, width: 0.3, height: 0.4 }],
    ['Move selected mask up', { x: 0.2, y: 0.18, width: 0.3, height: 0.4 }],
    ['Move selected mask down', { x: 0.2, y: 0.22, width: 0.3, height: 0.4 }],
    ['Make selected mask wider', { x: 0.2, y: 0.2, width: 0.32, height: 0.4 }],
    ['Make selected mask narrower', { x: 0.2, y: 0.2, width: 0.28, height: 0.4 }],
    ['Make selected mask taller', { x: 0.2, y: 0.2, width: 0.3, height: 0.42 }],
    ['Make selected mask shorter', { x: 0.2, y: 0.2, width: 0.3, height: 0.38 }],
  ])('commits the same geometry action for %s', async (label, rect) => {
    const view = await renderOverlay({ masks: [firstMask], selectedMaskId: 'mask-one' });

    await fireEvent.press(view.getByRole('button', { name: label }));

    expect(view.onMutationCommit).toHaveBeenCalledWith([{ id: 'mask-one', rect }]);
  });

  it('disables a boundary no-op control without emitting a mutation', async () => {
    const boundaryMask: PrivacyMask = { id: 'mask-one', rect: { x: 0, y: 0.2, width: 0.3, height: 0.4 } };
    const view = await renderOverlay({ masks: [boundaryMask], selectedMaskId: 'mask-one' });

    expect(view.getByRole('button', { name: 'Move selected mask left' }).props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(view.getByRole('button', { name: 'Move selected mask left' }));

    expect(view.onMutationCommit).not.toHaveBeenCalled();
  });
});

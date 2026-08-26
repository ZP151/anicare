import { createRenderCoordinator } from './render-coordinator';

describe('redaction render coordinator', () => {
  it('accepts only one of two rapid mask taps', () => {
    const coordinator = createRenderCoordinator();
    expect(coordinator.beginMutation([{ id: 'first', rect: { x: 0, y: 0, width: 0.1, height: 0.1 } }])).not.toBeNull();
    expect(coordinator.beginMutation([{ id: 'second', rect: { x: 0.2, y: 0.2, width: 0.1, height: 0.1 } }])).toBeNull();
  });

  it('prevents clear from racing an in-flight add', () => {
    const coordinator = createRenderCoordinator();
    expect(coordinator.beginMutation([{ id: 'add', rect: { x: 0, y: 0, width: 0.1, height: 0.1 } }])).not.toBeNull();
    expect(coordinator.beginMutation([])).toBeNull();
  });

  it('invalidates an older selection when a newer selection begins', () => {
    const coordinator = createRenderCoordinator();
    const older = coordinator.beginSelection();
    const newer = coordinator.beginSelection();
    expect(coordinator.isCurrent(older.token)).toBe(false);
    expect(coordinator.isCurrent(newer.token)).toBe(true);
    expect(coordinator.finish(older.token)).toBe(false);
    expect(coordinator.finish(newer.token)).toBe(true);
  });

  it('binds rendering and stored state to the same copied mask snapshot', () => {
    const coordinator = createRenderCoordinator();
    const source = [{ id: 'mask', rect: { x: 0, y: 0, width: 0.1, height: 0.1 } }];
    const operation = coordinator.beginMutation(source)!;
    source.push({ id: 'later', rect: { x: 0.2, y: 0.2, width: 0.1, height: 0.1 } });
    expect(operation.masks.map(({ id }) => id)).toEqual(['mask']);
  });
});

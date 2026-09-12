import { describe, expect, it, vi } from 'vitest';
const create = vi.hoisted(() => vi.fn());
const roots = vi.hoisted(() => new Map());
vi.mock('@react-three/fiber', () => ({ _roots: roots }));
vi.mock('three', () => ({ Scene: class { type = 'Scene'; }, WebGLRenderer: class { constructor(parameters: unknown) { return create(parameters); } } }));
import { recoverableWebGLRenderer } from './recoverableWebGLRenderer';

describe('recoverable WebGL initialization', () => {
  it('does not report unavailability when an actual renderer was created', async () => {
    const renderer = { render: vi.fn(), dispose: vi.fn() }, unavailable = vi.fn();
    create.mockReturnValueOnce(renderer);
    expect(await recoverableWebGLRenderer({ antialias: true }, unavailable)).toBe(renderer);
    expect(unavailable).not.toHaveBeenCalled();
  });
  it('reports construction failure once without rejecting the uncaught R3F configure task', async () => {
    const unavailable = vi.fn(), settled = vi.fn();
    create.mockImplementationOnce(() => { throw new Error('WebGL disabled'); });
    const result = recoverableWebGLRenderer({}, unavailable);
    void result.then(settled, settled);
    await Promise.resolve(); await Promise.resolve();
    expect(unavailable).toHaveBeenCalledOnce(); expect(settled).not.toHaveBeenCalled();
  });
  it('initializes only the missing empty scene required by R3F failed-root teardown', async () => {
    const canvas = document.createElement('canvas'), setState = vi.fn();
    const state = { scene: undefined };
    roots.set(canvas, { store: { getState: () => state, setState } });
    create.mockImplementationOnce(() => { throw new Error('WebGL disabled'); });
    void recoverableWebGLRenderer({ canvas }, vi.fn());
    await Promise.resolve();
    expect(state.scene).toEqual(expect.objectContaining({ type: 'Scene' }));
    expect(setState).not.toHaveBeenCalled();
    roots.delete(canvas);
  });
});

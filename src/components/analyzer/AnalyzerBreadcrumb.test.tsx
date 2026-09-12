import { act, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnalyzerBreadcrumb } from './AnalyzerBreadcrumb';

describe('Analyzer breadcrumb available space and menu', () => {
  let host: HTMLDivElement, root: Root, resize: () => void;
  let available: number, required: number;
  const items = ['プロジェクト', 'src', 'scripts', 'Sources', 'main.swift', 'ANY /'].map(label => ({ id: label, label }));
  const onOpen = vi.fn();
  const trigger = () => host.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]');
  const menu = () => host.querySelector('[role="menu"]');
  const click = async (element: HTMLElement) => act(async () => element.click());
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    available = 900; required = 600; onOpen.mockClear();
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return { width: this.classList.contains('analyzer-breadcrumb-measure') ? required : available } as DOMRect;
    });
    vi.stubGlobal('ResizeObserver', class { constructor(callback: () => void) { resize = callback; } observe() {} disconnect() {} });
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  });
  afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  const render = async (path = items) => act(async () => root.render(<AnalyzerBreadcrumb items={path} label="現在地" currentRef={createRef()} onOpen={onOpen} />));
  it('uses measured width, expanding again in fullscreen and collapsing on return', async () => {
    await render(); expect(trigger()).toBeNull();
    available = 300; await act(async () => resize()); expect(trigger()).not.toBeNull();
    await click(trigger()!); expect(menu()).not.toBeNull();
    available = 1000; await act(async () => document.dispatchEvent(new Event('fullscreenchange')));
    expect(trigger()).toBeNull(); expect(menu()).toBeNull();
    available = 300; await act(async () => resize()); expect(trigger()).not.toBeNull();
  });
  it('keeps a short path expanded in a narrow container and collapses long labels even with three entries', async () => {
    available = 400; required = 280; await render(); expect(trigger()).toBeNull();
    required = 750; await render(items.slice(0, 3)); expect(trigger()).not.toBeNull();
  });
  it('supports keyboard selection, Escape, outside pointer and focus dismissal', async () => {
    available = 300; await render(); await click(trigger()!);
    const buttons = [...menu()!.querySelectorAll<HTMLButtonElement>('button')];
    expect(document.activeElement).toBe(buttons[0]);
    await act(async () => buttons[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true })));
    expect(document.activeElement).toBe(buttons.at(-1));
    await act(async () => buttons.at(-1)!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(menu()).toBeNull(); expect(document.activeElement).toBe(trigger());
    await click(trigger()!); await act(async () => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })));
    expect(menu()).toBeNull();
    await click(trigger()!); await click(menu()!.querySelector('button')!); expect(onOpen).toHaveBeenCalledWith('src'); expect(menu()).toBeNull();
    await click(trigger()!);
    const outside = document.createElement('button'); document.body.append(outside);
    await act(async () => outside.focus()); expect(menu()).toBeNull(); outside.remove();
  });
});

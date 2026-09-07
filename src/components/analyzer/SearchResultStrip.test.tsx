import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SearchResultStrip } from './SearchResultStrip';

describe('search result navigation', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('virtualizes a large result set while letting Home/End and Enter reach every result', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const host = document.createElement('div'); document.body.append(host); const root = createRoot(host), select = vi.fn();
    const items = Array.from({ length: 10000 }, (_, i) => ({ id: `result-${i}`, label: `callback ${i}`, subtitle: `src/${i}/long-path/file.ts:${i + 1}` }));
    try {
      await act(async () => root.render(<SearchResultStrip query="callback" items={items} onSelect={select} />));
      expect(host.querySelectorAll('[role="option"]').length).toBeLessThan(20);
      expect(host.querySelector('[role="status"]')?.textContent).toBe('10,000件一致');
      const list = host.querySelector('[role="listbox"]')!;
      await act(async () => list.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true })));
      expect(document.activeElement?.getAttribute('aria-posinset')).toBe('10000');
      expect(document.activeElement?.getAttribute('aria-setsize')).toBe('10000');
      await act(async () => (document.activeElement as HTMLButtonElement).click());
      expect(select).toHaveBeenCalledWith('result-9999');
      await act(async () => list.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true })));
      expect(document.activeElement?.getAttribute('aria-posinset')).toBe('1');
      expect(select).toHaveBeenCalledTimes(1);
      await act(async () => list.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, isComposing: true })));
      expect(document.activeElement?.getAttribute('aria-posinset')).toBe('1');
      await act(async () => list.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
      expect(document.activeElement?.getAttribute('aria-posinset')).toBe('2');
      await act(async () => { (list as HTMLElement).scrollLeft = 264 * 500; list.dispatchEvent(new Event('scroll', { bubbles: true })); });
      const entry = host.querySelector<HTMLButtonElement>('[role="option"][tabindex="0"]');
      expect(entry?.getAttribute('aria-posinset')).toBe('501');
      await act(async () => entry!.focus({ preventScroll: true }));
      expect(document.activeElement?.getAttribute('aria-posinset')).toBe('501');
    } finally { await act(async () => root.unmount()); host.remove(); }
  });
  it('fits focused cards and their outlines in narrow rows and preserves the candidate across resizes', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    let resize = () => {};
    vi.stubGlobal('ResizeObserver', class { constructor(callback: ResizeObserverCallback) { resize = () => callback([], this as unknown as ResizeObserver); } observe() {} disconnect() {} });
    const host = document.createElement('div'); document.body.append(host); const root = createRoot(host), select = vi.fn();
    const items = Array.from({ length: 130 }, (_, i) => ({ id: `result-${i}`, label: `uxTarget ${i}`, subtitle: `src/long/path/handler-${i}.ts` }));
    let width = 229;
    try {
      await act(async () => root.render(<SearchResultStrip query="uxTarget" items={items} onSelect={select} />));
      const list = host.querySelector<HTMLElement>('[role="listbox"]')!;
      Object.defineProperty(list, 'clientWidth', { configurable: true, get: () => width });
      const size = (value: number) => act(async () => { width = value; resize(); });
      const key = (value: string) => act(async () => list.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true })));
      const fits = (index: number) => {
        const card = document.activeElement as HTMLButtonElement;
        expect(card.getAttribute('data-result-index')).toBe(String(index)); expect(card.getAttribute('aria-setsize')).toBe('130');
        const left = Number.parseFloat(card.style.left) - list.scrollLeft, cardWidth = Number.parseFloat(card.style.width);
        expect(cardWidth).toBeLessThanOrEqual(Math.min(256, width - 8));
        expect(left).toBeGreaterThanOrEqual(3.999); expect(left + cardWidth).toBeLessThanOrEqual(width - 3.999);
      };
      await size(229); await key('End'); fits(129);
      await act(async () => (document.activeElement as HTMLButtonElement).click()); expect(select).toHaveBeenLastCalledWith('result-129');
      await key('Home'); fits(0);
      await act(async () => { list.scrollLeft = 229 * 65; list.dispatchEvent(new Event('scroll', { bubbles: true })); });
      await act(async () => host.querySelector<HTMLButtonElement>('[role="option"][tabindex="0"]')!.focus({ preventScroll: true })); fits(65);
      await size(980); fits(65); await key('End'); fits(129);
      await size(229); fits(129); await size(590); fits(129); await size(160); fits(129);
      await key('Home'); fits(0); await size(1100); fits(0); await key('ArrowRight'); fits(1);
      expect(host.querySelector('[role="status"]')?.textContent).toBe('130件一致');
      expect(host.querySelectorAll('[role="option"]').length).toBeLessThan(20);
      expect(select).toHaveBeenCalledTimes(1);
    } finally { await act(async () => root.unmount()); host.remove(); }
  });
});

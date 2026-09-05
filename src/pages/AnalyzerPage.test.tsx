import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnalyzerSessionProvider, scanProjectFiles, useAnalyzerSession, type AnalyzerProjectStore } from '../analyzer';
import { AnalyzerPage } from './AnalyzerPage';

vi.mock('@react-three/fiber', () => ({ Canvas: () => null, useFrame: vi.fn(), useThree: vi.fn() }));
vi.mock('../components/analyzer/AnalyzerEmptyOrbit', () => ({ AnalyzerEmptyOrbit: () => null }));
function Project({ store }: { store: AnalyzerProjectStore }) {
  const { replaceProject } = useAnalyzerSession();
  useEffect(() => replaceProject(store), [replaceProject, store]);
  return <AnalyzerPage />;
}

describe('Module Dependency exploration in the Analyzer shell', () => {
  let host: HTMLDivElement, root: Root;
  beforeEach(async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('ResizeObserver', class {
      constructor(private callback: ResizeObserverCallback) {}
      observe() { this.callback([{ contentRect: { width: 1000, height: 600 } } as ResizeObserverEntry], this as unknown as ResizeObserver); }
      disconnect() { /* no external resources */ }
    });
    const sources = [{ path:'package.json', text:'{"name":"atlas-test"}' },{path:'src/near/a.ts',text:"import '../far/b';"},{path:'src/far/b.ts',text:'export const b = 1;'}];
    const store = await scanProjectFiles(sources.map(item=>({relativePath:item.path,name:item.path.split('/').at(-1)!,extension:item.path.endsWith('.ts')?'.ts':'.json',size:item.text.length,readText:async()=>item.text})));
    await import('../components/analyzer/AnalyzerSpatialGraphStage');
    host=document.createElement('div');document.body.append(host);root=createRoot(host);
    await act(async()=>root.render(<MemoryRouter initialEntries={['/analyzer/module-dependency']}><AnalyzerSessionProvider><Project store={store}/></AnalyzerSessionProvider></MemoryRouter>));
  });
  afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();});

  it('does not select a unique search result again after explicit selection is cleared', async () => {
    const input=host.querySelector<HTMLInputElement>('input[aria-label="Analyzer Nodeを検索"]')!;
    await act(async()=>{
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'a.ts');
      input.dispatchEvent(new Event('input',{bubbles:true}));
    });
    expect(host.querySelector('[aria-label="Analyzer detail panel"]')).toBeNull();
    await act(async()=>host.querySelector<HTMLButtonElement>('[role="listbox"] button')!.click());
    expect(host.querySelector('[aria-label="Analyzer detail panel"]')).not.toBeNull();
    await act(async()=>host.querySelector('[role="application"]')!.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
    expect(input.value).toBe('a.ts');
    expect(host.querySelector('[aria-label="Analyzer detail panel"]')).toBeNull();
    expect(host.querySelectorAll('.analyzer-spatial-edge-hit')).toHaveLength(0);
  });

  it('focuses both true endpoints and selects the requested dependency from Detail', async () => {
    await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="a.ts, src/near/a.ts"]')!.click());
    await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="b.tsとの両端を表示"]')!.click());
    expect(host.querySelector('[aria-label="Analyzer detail panel"]')!.textContent).toContain('a.ts');
    expect(host.querySelector('[aria-label="Analyzer detail panel"]')!.textContent).toContain('b.ts');
    expect(host.querySelectorAll('.analyzer-spatial-edge-hit')).toHaveLength(1);
    for(const label of ['a.ts, src/near/a.ts','b.ts, src/far/b.ts']){
      const card=host.querySelector<HTMLElement>(`[aria-label="${label}"]`)!;
      expect(card).not.toBeNull();
      expect(parseFloat(card.style.left)).toBeGreaterThanOrEqual(0);
      expect(parseFloat(card.style.left)+parseFloat(card.style.width)).toBeLessThanOrEqual(1000);
      expect(parseFloat(card.style.top)).toBeGreaterThanOrEqual(0);
      expect(parseFloat(card.style.top)+parseFloat(card.style.height)).toBeLessThanOrEqual(600);
    }
  });

  it('maximizes only the workspace and exits with Escape without clearing selection', async () => {
    await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="a.ts, src/near/a.ts"]')!.click());
    const originalOverflow = document.body.style.overflow;
    await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="全画面表示"]')!.click());
    const workspace = host.querySelector<HTMLElement>('.analyzer-workspace')!;
    expect(workspace.classList.contains('is-fullscreen')).toBe(true);
    expect(workspace.getAttribute('aria-modal')).toBe('true');
    expect(workspace.querySelector('.analyzer-detail-panel')).not.toBeNull();
    expect(workspace.querySelector('.analyzer-stage-controls')).not.toBeNull();
    expect(workspace.querySelector('.analyzer-intro, .analyzer-toolbar, .analyzer-view-tabs')).toBeNull();
    expect(document.body.style.overflow).toBe('hidden');
    await act(async()=>workspace.querySelector('[role="application"]')!.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
    expect(workspace.classList.contains('is-fullscreen')).toBe(false);
    expect(workspace.querySelector('[aria-label="a.ts, src/near/a.ts"]')!.getAttribute('aria-pressed')).toBe('true');
    expect(workspace.querySelectorAll('.analyzer-spatial-edge-hit')).toHaveLength(1);
    expect(document.body.style.overflow).toBe(originalOverflow);
  });

  it('synchronizes native fullscreen changes and falls back when the API rejects', async () => {
    const workspace = host.querySelector<HTMLDivElement>('.analyzer-workspace')!;
    let native: Element | null = null;
    const original = Object.getOwnPropertyDescriptor(document,'fullscreenElement');
    Object.defineProperty(document,'fullscreenElement',{configurable:true,get:()=>native});
    workspace.requestFullscreen = vi.fn(async()=>{native=workspace;document.dispatchEvent(new Event('fullscreenchange'));});
    try {
      await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="全画面表示"]')!.click());
      expect(workspace.requestFullscreen).toHaveBeenCalledOnce();
      expect(workspace.classList.contains('is-fullscreen')).toBe(true);
      await act(async()=>{native=null;document.dispatchEvent(new Event('fullscreenchange'));});
      expect(workspace.classList.contains('is-fullscreen')).toBe(false);
      workspace.requestFullscreen = vi.fn().mockRejectedValue(new Error('Fullscreen unavailable'));
      await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="全画面表示"]')!.click());
      expect(workspace.classList.contains('is-fullscreen')).toBe(true);
      await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="全画面を終了"]')!.click());
      expect(workspace.classList.contains('is-fullscreen')).toBe(false);
    } finally {
      if (original) Object.defineProperty(document,'fullscreenElement',original);
      else Reflect.deleteProperty(document,'fullscreenElement');
    }
  });
});

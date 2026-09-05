import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnalyzerGraphTransform, AnalyzerViewModel } from '../../analyzer';
import { AnalyzerSpatialGraphStage } from './AnalyzerSpatialGraphStage';

// Verify the real interaction/presentation component; WebGL is tested in-browser.
vi.mock('@react-three/fiber', () => ({ Canvas: () => null, useFrame: vi.fn(), useThree: vi.fn() }));
const expanded = new Set<string>();
const noop = () => undefined;
const view: AnalyzerViewModel = {
  view: 'module-dependency', clusters: [], evidence: [], warnings: [],
  nodes: ['a', 'b'].map((id) => ({ id, type: 'module', label: `${id}.ts`, evidenceIds: [], metadata: {} })),
  edges: [{ id: 'a-b', sourceId: 'a', targetId: 'b', kind: 'imports', label: 'imports', evidenceIds: [], metadata: {} }],
};

function Harness() {
  const [transform, setTransform] = useState<AnalyzerGraphTransform>({ x: 0, y: 0, scale: 0.7 });
  const [selected, setSelected] = useState<string>();
  return <AnalyzerSpatialGraphStage view={view} selectedNodeId={selected} filter="all" search="" expandedPresentationIds={expanded}
    onTogglePresentation={noop} onClearSelection={() => setSelected(undefined)} onResetPresentation={noop} onSelectNode={setSelected}
    onSelectRegion={noop} onSelectEdge={noop} transform={transform} hasStoredCamera
    onTransformChange={setTransform} cameraResetKey="test" onCountsChange={noop} />;
}

describe('Spatial Atlas gesture integration', () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('ResizeObserver', class {
      callback: ResizeObserverCallback;
      constructor(callback: ResizeObserverCallback) { this.callback = callback; }
      observe() { this.callback([{ contentRect: { width: 1000, height: 600 } } as ResizeObserverEntry], this as unknown as ResizeObserver); }
      disconnect() { /* no external observer */ }
    });
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => root.render(<Harness />));
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  const zoomIn = () => document.querySelector<HTMLButtonElement>('button[aria-label="Zoom in"]')!;
  const scale = () => document.querySelector('.analyzer-stage-controls > span')!.textContent;

  it('accumulates rapid zoom input, then resets the whole-layer transform after reconcile', async () => {
    await act(async () => { zoomIn().click(); zoomIn().click(); vi.advanceTimersByTime(20); });
    expect(scale()).toBe('91%');
    expect(host.querySelector<HTMLElement>('.analyzer-spatial-overlay')!.style.transform).toContain('scale(');
    await act(async () => vi.advanceTimersByTime(400));
    expect(scale()).toBe('91%');
    expect(host.querySelector<HTMLElement>('.analyzer-spatial-overlay')!.style.transform).toBe('');
  });

  it('does not let a pending wheel settle or session timer overwrite Fit', async () => {
    await act(async () => { zoomIn().click(); vi.advanceTimersByTime(20); });
    const fit = [...host.querySelectorAll('button')].find((button) => button.textContent === 'Fit')!;
    await act(async () => fit.click());
    const fitted = scale();
    await act(async () => vi.advanceTimersByTime(1000));
    expect(scale()).toBe(fitted);
  });

  it('prevents page scrolling for wheel gestures and supports keyboard navigation', async () => {
    const stage = host.querySelector<HTMLElement>('[role="application"]')!;
    const wheel = new WheelEvent('wheel', { deltaY: -10, clientX: 400, clientY: 250, bubbles: true, cancelable: true });
    await act(async () => { stage.dispatchEvent(wheel); vi.advanceTimersByTime(400); });
    expect(wheel.defaultPrevented).toBe(true);
    const card = host.querySelector<HTMLElement>('.analyzer-spatial-module')!;
    const x = parseFloat(card.style.left);
    await act(async () => {
      stage.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      vi.advanceTimersByTime(400);
    });
    expect(parseFloat(host.querySelector<HTMLElement>('.analyzer-spatial-module')!.style.left) - x).toBeCloseTo(80);
  });

  it('shows connections only on explicit selection and retains the selection at Far', async () => {
    expect(host.querySelectorAll('.analyzer-spatial-edge-hit')).toHaveLength(0);
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="a.ts, a.ts"]')!.click());
    expect(host.querySelectorAll('.analyzer-spatial-edge-hit')).toHaveLength(1);
    await act(async () => {
      const out = host.querySelector<HTMLButtonElement>('[aria-label="Zoom out"]')!;
      for (let i = 0; i < 8; i++) out.click();
      vi.advanceTimersByTime(400);
    });
    expect(host.querySelector('[aria-label="a.ts, a.ts"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelectorAll('.analyzer-spatial-edge-hit')).toHaveLength(1);
    await act(async () => [...host.querySelectorAll('button')].find(button=>button.textContent==='選択解除')!.click());
    expect(host.querySelectorAll('.analyzer-spatial-edge-hit')).toHaveLength(0);
  });

  it('retains a selected connection when the target leaves the viewport and returns', async () => {
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="a.ts, a.ts"]')!.click());
    const stage = host.querySelector<HTMLElement>('[role="application"]')!;
    const original = host.querySelector('.analyzer-spatial-edge-hit')!.getAttribute('d');
    let moves=0;
    while(parseFloat(host.querySelector<HTMLElement>('[aria-label="b.ts, b.ts"]')?.style.left ?? '1001') <= 1000 && moves<60){
      await act(async()=>{stage.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',shiftKey:true,bubbles:true}));vi.advanceTimersByTime(400);});
      moves++;
    }
    expect(parseFloat(host.querySelector<HTMLElement>('[aria-label="b.ts, b.ts"]')?.style.left ?? '1001')).toBeGreaterThan(1000);
    expect(host.querySelector('[aria-label="a.ts, a.ts"]')).not.toBeNull();
    expect(host.querySelectorAll('.analyzer-spatial-edge-hit')).toHaveLength(1);
    for(let i=0;i<moves;i++) await act(async()=>{stage.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',shiftKey:true,bubbles:true}));vi.advanceTimersByTime(400);});
    expect(host.querySelector('.analyzer-spatial-edge-hit')!.getAttribute('d')).toBe(original);
  });

  it('prevents the native SVG focus box and pans from a connection without selecting it', async () => {
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="a.ts, a.ts"]')!.click());
    const stage = host.querySelector<HTMLElement>('[role="application"]')!;
    stage.hasPointerCapture = () => false;
    stage.setPointerCapture = () => undefined;
    const path = host.querySelector('.analyzer-spatial-edge-hit')!;
    const left = parseFloat(host.querySelector<HTMLElement>('[aria-label="a.ts, a.ts"]')!.style.left);
    const down = new MouseEvent('pointerdown', {button:0,clientX:400,clientY:300,bubbles:true,cancelable:true});
    await act(async()=>{
      path.dispatchEvent(down);
      path.dispatchEvent(new MouseEvent('pointermove',{clientX:480,clientY:320,bubbles:true}));
      path.dispatchEvent(new MouseEvent('pointerup',{clientX:480,clientY:320,bubbles:true}));
      path.dispatchEvent(new MouseEvent('click',{bubbles:true}));
      vi.advanceTimersByTime(400);
    });
    expect(down.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(stage);
    expect(host.querySelector('[aria-label="a.ts, a.ts"]')!.getAttribute('aria-pressed')).toBe('true');
    expect(parseFloat(host.querySelector<HTMLElement>('[aria-label="a.ts, a.ts"]')!.style.left)-left).toBeCloseTo(80);
  });

  it('labels and filters imports relative to the selected module', async () => {
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="a.ts, a.ts"]')!.click());
    expect(host.querySelector('.analyzer-spatial-edge-hit')!.getAttribute('data-direction')).toBe('imports');
    expect(host.querySelector('.analyzer-spatial-edge-hit')!.getAttribute('aria-label')).toBe('a.ts が b.ts を import');
    await act(async()=>host.querySelector<HTMLButtonElement>('button.is-imported-by')!.click());
    expect(host.querySelectorAll('.analyzer-spatial-edge-hit')).toHaveLength(0);
    await act(async()=>host.querySelector<HTMLButtonElement>('button.is-imports')!.click());
    expect(host.querySelectorAll('.analyzer-spatial-edge-hit')).toHaveLength(1);
    await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="b.ts, b.ts"]')!.click());
    expect(host.querySelector('.analyzer-spatial-edge-hit')!.getAttribute('data-direction')).toBe('imported-by');
    expect(host.querySelector('button.is-imported-by')!.textContent).toContain('1');
  });

  it('keeps display controls outside the pannable canvas', async () => {
    const stage = host.querySelector<HTMLElement>('[role="application"]')!;
    const controls = host.querySelector('.analyzer-spatial-toolbar')!;
    expect(stage.contains(controls)).toBe(false);
    expect(stage.contains(zoomIn())).toBe(false);
    await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="a.ts, a.ts"]')!.click());
    const button = host.querySelector<HTMLButtonElement>('button.is-imports')!;
    expect(stage.contains(button)).toBe(false);
    await act(async()=>{button.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));});
    expect(host.querySelectorAll('.analyzer-spatial-edge-hit')).toHaveLength(0);
  });
});

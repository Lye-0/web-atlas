import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {it,expect,vi} from 'vitest';
import {AnalyzerDisplaySettings} from './AnalyzerDisplaySettings';
it('opens settings, closes outside or with Escape, and restores focus without changing options',async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);const host=document.createElement('div');document.body.append(host);const root=createRoot(host),change=vi.fn();
 try{await act(async()=>root.render(<AnalyzerDisplaySettings><button onClick={change}>設定値</button></AnalyzerDisplaySettings>));const trigger=host.querySelector('button')!;
  await act(async()=>trigger.click());expect(trigger.getAttribute('aria-expanded')).toBe('true');await act(async()=>host.querySelector('[role=group]')!.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));expect(trigger.getAttribute('aria-expanded')).toBe('false');expect(document.activeElement).toBe(trigger);
  await act(async()=>trigger.click());await act(async()=>document.body.dispatchEvent(new Event('pointerdown',{bubbles:true})));expect(trigger.getAttribute('aria-expanded')).toBe('false');expect(change).not.toHaveBeenCalled();
 }finally{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();}
});

import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { scanProjectFiles, projectModuleDependency, type AnalyzerProjectStore } from '../../analyzer';
import { AnalyzerDetailPanel } from './AnalyzerDetailPanel';

function Harness({store}:{store:AnalyzerProjectStore}) {
  const view = projectModuleDependency(store);
  const [selected,setSelected] = useState(view.nodes.find(node=>node.label==='hub.ts')!.id);
  return <AnalyzerDetailPanel store={store} view={view} selectedNodeId={selected} expandedPresentationIds={new Set()}
    onSelectNode={setSelected} onTogglePresentation={()=>undefined} onClose={()=>undefined}/>;
}

describe('Module detail progressive disclosure',()=>{
  let root:Root, host:HTMLDivElement;
  beforeEach(async()=>{
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
    const sources = Array.from({length:9},(_,i)=>({path:`src/file-${i}.ts`,text:`export const value = ${i};`}));
    sources.push({path:'src/hub.ts',text:sources.map(item=>`import './${item.path.split('/').at(-1)}';`).join('\n')+"\nimport 'external-library';"});
    const store = await scanProjectFiles(sources.map(item=>({relativePath:item.path,name:item.path.split('/').at(-1)!,extension:'.ts',size:item.text.length,readText:async()=>item.text})));
    host=document.createElement('div'); document.body.append(host); root=createRoot(host);
    await act(async()=>root.render(<Harness store={store}/>));
  });
  afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();});
  const section=(name:string)=>[...host.querySelectorAll('details')].find(item=>item.querySelector('summary > span')?.textContent===name)!;
  const open=async(item:HTMLDetailsElement)=>{await act(async()=>{item.open=true;item.dispatchEvent(new Event('toggle'));});};

  it('keeps every dependency reachable while initially showing six and deferring evidence',async()=>{
    const dependencies=section('← import先');
    expect(dependencies.open).toBe(true);
    expect(dependencies.querySelectorAll('li')).toHaveLength(6);
    await act(async()=>dependencies.querySelector<HTMLButtonElement>('.analyzer-detail-show-more')!.click());
    expect(dependencies.querySelectorAll('li')).toHaveLength(9);
    expect(section('Evidence').open).toBe(false);
    expect(host.querySelector('.analyzer-evidence-block')).toBeNull();
    expect(section('Metadata').open).toBe(false);
    await open(section('Evidence'));
    expect(host.querySelector('.analyzer-evidence-block')).not.toBeNull();
    await act(async()=>dependencies.querySelector<HTMLButtonElement>('.analyzer-module-connection-name')!.click());
    expect(section('Evidence').open).toBe(false);
    expect(host.querySelector('.analyzer-evidence-block')).toBeNull();
  });

  it('retains external declarations behind their own disclosure',async()=>{
    const declarations=section('Import宣言');
    expect(declarations.open).toBe(false);
    await open(declarations);
    await act(async()=>declarations.querySelector<HTMLButtonElement>('.analyzer-detail-show-more')!.click());
    expect(declarations.querySelectorAll('li')).toHaveLength(10);
    expect(declarations.textContent).toContain('external-library');
    expect(declarations.textContent).toContain('external');
  });
});

import { describe, expect, it } from 'vitest';
import { layoutAnalyzerGraph3D } from '../../analyzer/graph3D';
import { graph3DRegionAnchors, graph3DRegionEmphasis } from '../../analyzer/graph3DRegions';
import type { AnalyzerViewModel, AnalyzerViewNode } from '../../analyzer/types';
import { graph3DNodeKind, prepareGraph3DLabels, projectGraph3DLabels, type Graph3DLabelCandidate, type Graph3DLabelContext } from './graph3DLabels';
const node=(id:string,type:AnalyzerViewNode['type']='module',label=id):AnalyzerViewNode=>({id,type,label,metadata:{},evidenceIds:[id+':e']});
const model=(view:AnalyzerViewModel['view']):AnalyzerViewModel=>({view,nodes:[],edges:[],regions:[],clusters:[],evidence:[],warnings:[]});
const context=(view:AnalyzerViewModel['view']='module-dependency'):Graph3DLabelContext=>({view,zoom:1,width:1000,height:700,top:50,bottom:650,selected:new Set(),hovered:new Set(),endpoints:new Set(),related:new Set(),roles:new Map(),previous:[]});
const candidates=(count:number):Graph3DLabelCandidate[]=>Array.from({length:count},(_,i)=>({descriptor:{id:'node:'+i,entityId:String(i),kind:'node',label:'File '+i,kindLabel:'ファイル',context:'src',tooltip:'File '+i,group:'src',importance:2},x:70+i%10*85,y:100+Math.floor(i/10)*50,depth:0}));
describe('3D label and identity policy',()=>{
  it('keeps root package, Project, entry, package script and command stages distinct',()=>{
    const root={...node('r','workspace-package','same'),metadata:{displayRole:'ROOT PACKAGE'}};
    expect(graph3DNodeKind(root)).toBe('ルートパッケージ');expect(graph3DNodeKind(node('p','project','same'))).toBe('プロジェクト');
    expect(graph3DNodeKind({...node('entry','command'),metadata:{commandType:'user-command'}})).toBe('開始コマンド');
    expect(graph3DNodeKind(node('s','package-script'))).toBe('package script');
    expect(graph3DNodeKind({...node('c','command'),metadata:{commandType:'pnpm-script',operator:'&&'}})).toBe('scriptを呼ぶコマンド');
  });
  it('prepares names once and disambiguates same-name usages by original Scope',()=>{
    const m=model('architecture');m.nodes=[node('a','stack-usage','TypeScript'),node('b','stack-usage','TypeScript')];
    m.regions=['a','b'].map(id=>({id:'scope:'+id,entityKind:'region',regionKind:'scope',label:'Scope '+id,childIds:[id],ports:[],selectable:true,evidenceIds:[],metadata:{}}));
    const graph=layoutAnalyzerGraph3D(m),a=prepareGraph3DLabels(graph);expect(prepareGraph3DLabels(graph)).toBe(a);
    expect(a.get('node:a')?.disambiguation).not.toBe(a.get('node:b')?.disambiguation);expect(graph.points).toHaveLength(2);
  });
  it('keeps small workspace names and kinds readable without selection',()=>{
    const p=candidates(3);p[0]!.descriptor.kindLabel='プロジェクト';p[1]!.descriptor.kindLabel='workspace設定';p[2]!.descriptor.kindLabel='ルートパッケージ';
    const labels=projectGraph3DLabels(p,context('workspace'));expect(labels).toHaveLength(3);expect(labels.map(l=>l.disambiguation)).toEqual(p.map(p=>p.descriptor.kindLabel));expect(labels[0]!.width).toBeLessThan(146);
  });
  it('caps ordinary cloud names while preserving selected and explicit endpoints',()=>{
    const p=candidates(100),c=context();c.selected=new Set(['2']);c.endpoints=new Set(['8','22']);c.related=new Set(p.map(p=>p.descriptor.entityId));
    const before=JSON.stringify(p),labels=projectGraph3DLabels(p,c);expect(labels.length).toBeLessThan(30);expect(labels.map(l=>l.id)).toEqual(expect.arrayContaining(['node:2','node:8','node:22']));expect(JSON.stringify(p)).toBe(before);
  });
  it('reveals a hovered/focused background target at far zoom without revealing all files',()=>{
    const c=context();c.zoom=.05;c.hovered=new Set(['8']);const labels=projectGraph3DLabels(candidates(80),c);expect(labels.map(l=>l.id)).toContain('node:8');expect(labels.length).toBeLessThan(8);
  });
  it('keeps search highlights without promoting every matching file to a label',()=>{
    const p=candidates(80),c=context(),before=projectGraph3DLabels(p,c),after=projectGraph3DLabels(p,{...c,matches:new Set(p.map(p=>p.descriptor.entityId))});
    expect(after.map(l=>l.id)).toEqual(before.map(l=>l.id));expect(after.every(l=>l.match)).toBe(true);expect(after.length).toBeLessThan(80);
  });
  it('never covers selected points or explicit endpoints with a label',()=>{
    const c=context('workspace');c.selected=new Set(['0']);c.endpoints=new Set(['1','2']);const p=candidates(3),labels=projectGraph3DLabels(p,c);
    for(const l of labels){const inset=l.selected||l.aggregate?17:9;for(const point of p)expect(point.x>l.x+inset&&point.x<l.x+inset+l.width!&&point.y>l.y-l.height!/2&&point.y<l.y+l.height!/2).toBe(false);}
  });
  it('uses previous placements and releases removed owner labels',()=>{
    const p=candidates(5),c=context('command'),first=projectGraph3DLabels(p,c);const next=projectGraph3DLabels(p,{...c,previous:first});expect(next).toEqual(first);
    expect(projectGraph3DLabels([],{...c,previous:first})).toEqual([]);expect(projectGraph3DLabels(p.slice(0,1),{...c,previous:first}).map(l=>l.id)).toEqual(['node:0']);
  });
  it('handles empty, narrow and long names with bounded labels',()=>{
    expect(projectGraph3DLabels([],context())).toEqual([]);const p=candidates(1);p[0]!.descriptor.label='長い名前'.repeat(80);const c={...context('workspace'),width:240,selected:new Set(['0'])};const labels=projectGraph3DLabels(p,c);expect(labels).toHaveLength(1);expect(labels[0]!.width).toBeLessThanOrEqual(176);expect(labels[0]!.label).toBe(p[0]!.descriptor.label);
  });
});
describe('Scope ports and original Directory ancestors',()=>{
  const fixture=()=>{const m=model('architecture');m.nodes=[node('one','stack-usage'),node('two','stack-usage'),node('three','stack-usage')];m.regions=[{id:'root',childIds:['one'],childRegionIds:['child']},{id:'child',parentRegionId:'root',childIds:['two','three'],depth:1}].map(r=>({...r,entityKind:'region',regionKind:'scope',label:r.id,ports:[],selectable:true,evidenceIds:[],metadata:{}}));return m;};
  it('locates single, multiple and nested Scope ports apart from every technology without changing the graph',()=>{
    const graph=layoutAnalyzerGraph3D(fixture()),before=JSON.stringify(graph),ports=graph3DRegionAnchors(graph);
    expect(ports.size).toBe(2);for(const [id,p]of ports){expect(graph.regions.some(r=>r.original.id===id)).toBe(true);for(const node of graph.points)expect(Math.hypot(p[0]-node.x,p[1]-node.y,p[2]-node.z)).toBeGreaterThan(20);}
    expect(JSON.stringify(graph)).toBe(before);
  });
  it('emphasizes actual ancestors, preserves selected precedence and clears transient ancestry',()=>{
    const graph=layoutAnalyzerGraph3D(fixture());graph.regions[1]!.original.metadata.compressedPaths=['a','a/b'];
    const e=graph3DRegionEmphasis(graph,'child');expect(e.get('child')).toBe('selected');expect(e.get('root')).toBe('ancestor');
    expect(graph3DRegionEmphasis(graph,'root','child').get('root')).toBe('selected');expect(graph3DRegionEmphasis(graph)).toEqual(new Map());
  });
});

it('dims unrelated labels only while relation emphasis exists and restores them on leave',()=>{
  const c=context('workspace'); c.emphasisIds=new Set(['0','1']);
  const labels=projectGraph3DLabels(candidates(3),c);
  expect(labels.find(l=>l.id==='node:0')).toMatchObject({emphasized:true,dimmed:false});
  expect(labels.find(l=>l.id==='node:2')).toMatchObject({emphasized:false,dimmed:true});
  c.previous=labels;c.emphasisIds=new Set();
  expect(projectGraph3DLabels(candidates(3),c).every(l=>!l.dimmed&&!l.emphasized)).toBe(true);
});


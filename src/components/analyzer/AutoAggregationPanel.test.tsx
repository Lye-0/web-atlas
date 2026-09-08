// Regression cases independently supplied by the accuracy reviewer (ACC-01 / UX-03).
// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { AutoAggregationPanel } from './AutoAggregationPanel';
import { SemanticExpression } from './SemanticExpression';
import type { AggregationGroup } from '../../analyzer/autoAggregation';
let host:HTMLDivElement,root:Root;
beforeEach(()=>{(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();});
const group=(size:number):AggregationGroup=>({id:'stable-scope',label:'scope',x:0,y:0,z:0,minimumMembers:8,memberIds:Array.from({length:size},(_,i)=>`n${i}`)});
const originalRelations=Array.from({length:45},(_,i)=>({id:`e${i}`,source:`n${i}`,target:`n${(i+1)%45}`,kind:'reads',confidence:'source',label:'read',siteCount:1,evidenceCount:2}));
const selectNode=vi.fn(),selectEdge=vi.fn();
async function panel(size:number,relationSize=45) {const g=group(size);await act(async()=>root.render(<AutoAggregationPanel enabled={true} counts={{scope:size,individual:0,automaticMembers:size,automaticGroups:1,manualMembers:0,manualGroups:0,representations:1}} groups={[g]} aggregates={[{...g,id:'display:stable-scope',groupId:g.id,mode:'automatic',matchingCount:0,memberIds:[...g.memberIds]}]} expandedIds={new Set()} collapsedIds={new Set()} inspection={{kind:'group',id:g.id}} onInspection={vi.fn()} onGroupMode={vi.fn()} relations={[]} originalRelations={originalRelations.slice(0,relationSize)} nodeLabel={id=>({title:id})} onSelectNode={selectNode} onSelectRelation={selectEdge}/>));}
async function next(label:string){const holder=host.querySelector(`[aria-label="${label}"]`)!;const button=[...holder.querySelectorAll('button')].find(b=>b.textContent==='次へ')!;await act(async()=>button.click());}
it('all group members and internal original relations remain accessible past page two',async()=>{
 await panel(45);await next('全メンバー');await next('全メンバー');expect(host.querySelectorAll('[data-aggregation-member-id]')).toHaveLength(5);expect(host.querySelector('[data-aggregation-member-id="n44"]')).not.toBeNull();
 await act(async()=>host.querySelector<HTMLButtonElement>('[data-aggregation-member-id="n44"]')!.click());expect(selectNode).toHaveBeenCalledWith('n44');
 const details=[...host.querySelectorAll('details')].find(d=>d.querySelector('summary')?.textContent?.includes('元の関係'))!;
 await act(async()=>{details.open=true;details.dispatchEvent(new Event('toggle'));});await next('元の関係');await next('元の関係');expect(host.querySelectorAll('[data-aggregation-relation-id]')).toHaveLength(5);expect(host.querySelector('[data-aggregation-relation-id="e44"]')).not.toBeNull();
});
it('filter shrinking an inspected stable group recovers the final available member page',async()=>{
 await panel(45);await next('全メンバー');await next('全メンバー');await panel(5,5);expect(host.querySelectorAll('[data-aggregation-member-id]')).toHaveLength(5);expect(host.querySelector('[data-aggregation-member-id="n4"]')).not.toBeNull();
});
it('filter shrinking inspected original relations recovers their final available page',async()=>{
 await panel(45);const details=[...host.querySelectorAll('details')].find(d=>d.querySelector('summary')?.textContent?.includes('元の関係'))!;
 await act(async()=>{details.open=true;details.dispatchEvent(new Event('toggle'));});await next('元の関係');await next('元の関係');await panel(45,5);expect(host.querySelectorAll('[data-aggregation-relation-id]')).toHaveLength(5);
});
it('copy action writes the complete original expression, including await, whitespace and literals',async()=>{
 const text="await runner.runChecked(['for-each-ref', `--format=${refFormat}`], { cwd: root, timeoutMs: 12000 })\n",writeText=vi.fn().mockResolvedValue(undefined);vi.stubGlobal('navigator',{clipboard:{writeText}});
 await act(async()=>root.render(<SemanticExpression text={text}/>));await act(async()=>host.querySelector('button')!.click());expect(writeText).toHaveBeenCalledWith(text);expect(host.querySelector('pre code')!.textContent).toBe(text);vi.unstubAllGlobals();
});
it('scope8 distinguishes current5, individual1, other-auto1 and manual1 and exposes each original current owner',async()=>{
 const g=group(8),parent={...g,id:'parent',label:'Parent',memberIds:['n6',...Array.from({length:19},(_,i)=>`p${i}`)]},manual={...g,id:'manual',label:'Manual',memberIds:['n7']};
 const aggregates=[{...g,id:'display-g',groupId:g.id,memberIds:g.memberIds.slice(0,5),mode:'automatic' as const,matchingCount:0,breakdown:{'use/source':3,'operation/source':2}},{...parent,id:'display-parent',groupId:parent.id,memberIds:[...parent.memberIds],mode:'automatic' as const,matchingCount:0},{...manual,id:'display-manual',groupId:manual.id,memberIds:[...manual.memberIds],mode:'manual' as const,matchingCount:0}];
 const ownerById=new Map<string,string>([['n5','n5'],...aggregates.flatMap(a=>a.memberIds.map(id=>[id,a.id] as [string,string]))]);
 await act(async()=>root.render(<AutoAggregationPanel enabled={true} counts={{scope:27,individual:1,automaticMembers:25,automaticGroups:2,manualMembers:1,manualGroups:1,representations:4}} groups={[g,parent,manual]} aggregates={aggregates} ownerById={ownerById} expandedIds={new Set()} collapsedIds={new Set()} inspection={{kind:'group',id:g.id}} onInspection={vi.fn()} onGroupMode={vi.fn()} relations={[]} originalRelations={[]} nodeLabel={id=>({title:id})} onSelectNode={selectNode} onSelectRelation={selectEdge}/>));
 expect(host.querySelector('.auto-aggregation-membership-counts')!.textContent).toContain('この集合 5 · 個別表示 1 · 別の自動集約 1 · 別の手動折りたたみ 1');
 expect(host.querySelectorAll('[data-aggregation-member-id]')).toHaveLength(5);expect(host.querySelector('[aria-label="表示集合の内訳"]')!.textContent).toContain('3対象');
 const toggle=[...host.querySelectorAll('button')].find(b=>b.textContent==='所属範囲全体の一覧を見る')!;expect(toggle).toBeDefined();await act(async()=>toggle.click());expect(host.querySelectorAll('[data-aggregation-member-id]')).toHaveLength(8);
 expect(host.querySelector('[data-aggregation-member-id="n0"]')!.textContent).toContain('この集合に自動集約');expect(host.querySelector('[data-aggregation-member-id="n5"]')!.textContent).toContain('個別表示');expect(host.querySelector('[data-aggregation-member-id="n6"]')!.textContent).toContain('別の集合に自動集約');expect(host.querySelector('[data-aggregation-member-id="n7"]')!.textContent).toContain('別の集合に手動で折りたたみ');expect(host.querySelector('[data-aggregation-member-id="p0"]')).toBeNull();
});

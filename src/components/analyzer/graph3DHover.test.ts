import { expect, it } from 'vitest';
import { graph3DHoverEmphasis } from './graph3DHover';
const edges=[
 {id:'out',source:'selected',target:'peer',active:true},
 {id:'back',source:'peer',target:'selected',active:true},
 {id:'other',source:'selected',target:'other-peer',active:true},
 {id:'outside',source:'peer',target:'unrelated',active:false},
];
it('isolates a connected peer and all parallel directions without following unrelated edges',()=>{
 expect(graph3DHoverEmphasis(edges,'peer')).toEqual({edgeIds:new Set(['out','back']),nodeIds:new Set(['selected','peer'])});
 expect(graph3DHoverEmphasis(edges,'other-peer').edgeIds).toEqual(new Set(['other']));
});
it('leaves unrelated points, unrelated lines, blank space and no-selection graphs unchanged',()=>{
 for(const id of ['unrelated','outside','removed',undefined])expect(graph3DHoverEmphasis(edges,id).edgeIds.size).toBe(0);
 for(const id of ['selected','peer','out'])expect(graph3DHoverEmphasis(edges.map(e=>({...e,active:false})),id).edgeIds.size).toBe(0);
});
it('isolates one selected-context line and preserves hover on the selected point',()=>{
 expect(graph3DHoverEmphasis(edges,'out').edgeIds).toEqual(new Set(['out']));
 expect(graph3DHoverEmphasis(edges,'selected').edgeIds).toEqual(new Set(['out','back','other']));
});

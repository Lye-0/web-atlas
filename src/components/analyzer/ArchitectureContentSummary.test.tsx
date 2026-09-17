import {describe,it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {ArchitectureContentSummary} from './ArchitectureContentSummary';
import {ArchitectureContentControl} from './ArchitectureContentControl';
import {architectureContentMembership,architectureContentDescription} from './architectureContentMembership';
import type {ArchitectureContentChoice} from '../../analyzer/semantic/architectureContent';
import type {SemanticNode} from '../../analyzer/semantic/types';
const unknown:ArchitectureContentChoice={id:'unknown',label:'対象環境未特定',group:'environment',meaning:'unknown'};
const node=(environments:string[]=[],attributes:SemanticNode['attributes']={}):SemanticNode=>({id:'n',label:'production',kind:'subsystem',group:'',attributes,evidence:[],confidence:'source',architecture:{kind:'tool-operation',environments,roles:[],files:[],memberIds:[],entryPaths:[],context:[],technologyNames:[],auxiliary:false}});
describe('content labels, counts and membership',()=>{
 it('keeps full arbitrary names near the selector and puts the counting definition behind disclosure',()=>{
  const choice={...unknown,label:'共有（staging-東日本-長い環境名 / release-西日本-長い環境名）'};
  const host=document.createElement('div');host.innerHTML=renderToStaticMarkup(<ArchitectureContentSummary current={{view:'architecture-map',nodes:[node()],edges:[]}} choice={choice} nodes={12} edges={8} total={99} emptyScope={false} emptyFiltered={false} onProject={()=>{}} onAll={()=>{}}/>);
  expect(host.querySelector('.architecture-content-name')?.textContent).toBe(choice.label);expect(host.querySelector('details')?.textContent).toContain('12対象・8関係');expect(host.querySelector('details')?.textContent).toContain('解析全体：99対象');
  const main=host.cloneNode(true) as HTMLElement;main.querySelector('details')?.remove();expect(main.textContent).toContain('現在の図：1構成要素・0本の関係線');expect(main.textContent).not.toContain('12対象');
  expect(host.querySelector('details')?.hasAttribute('open')).toBe(false);expect(host.textContent).not.toContain('構成モデルのID数');
 });
 it('separates environment, composition and routes in one native selector',()=>{
  const choices=[unknown,{id:'logical',label:'論理定義',meaning:'definition',group:'composition' as const},{id:'db',label:'DB構造変更',group:'path' as const}];
  const host=document.createElement('div');host.innerHTML=renderToStaticMarkup(<ArchitectureContentControl choices={choices} value="logical" onChange={()=>{}}/>);
  expect([...host.querySelectorAll('optgroup')].map(e=>e.label)).toEqual(['環境・設定から見る','構成区分から見る','経路から見る']);expect(host.querySelector('option[selected]')?.textContent).toBe('論理定義');
 });
 it('distinguishes missing target environment from execution location and known peers',()=>{
  const script=node([],{purpose:'script',executionPlace:'unconfirmed'});expect(architectureContentMembership(script,unknown,'core').reason).toContain('script自身');
  const known=node(['production'],{purpose:'deploy',executionPlace:'unconfirmed'});const explanation=architectureContentMembership(known,unknown,'peer');expect(explanation.label).toBe('直接の相手・経路');expect(explanation.reason).toContain('production');expect(explanation.reason).not.toContain('対象環境名が記録されていません');
  expect(architectureContentDescription(unknown)).toContain('操作の実行場所とは別');
 });
});

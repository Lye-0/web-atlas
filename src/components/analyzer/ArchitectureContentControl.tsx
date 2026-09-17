import type {ArchitectureContentChoice} from '../../analyzer/semantic/architectureContent';
import './architecture-content-control.css';
export function ArchitectureContentControl({choices,value,onChange}:{choices:readonly ArchitectureContentChoice[];value:string;onChange:(id:string)=>void}){
 return <label className="architecture-content-control"><span>表示内容</span><select aria-label="表示内容" value={value} onChange={e=>onChange(e.target.value)} data-fullscreen-popover="true">
  <option value="all">全体 — 現在の構成図</option>
  {(['environment','path'] as const).map(group=><optgroup key={group} label={group==='environment'?'環境から見る':'経路から見る'}>{choices.filter(c=>c.group===group).map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</optgroup>)}
 </select></label>;
}

import type {ArchitectureContentChoice} from '../../analyzer/semantic/architectureContent';
import './architecture-content-control.css';
export function ArchitectureContentControl({choices,value,onChange}:{choices:readonly ArchitectureContentChoice[];value:string;onChange:(id:string)=>void}){
 return <label className="architecture-content-control"><span>表示内容</span><select aria-label="表示内容" value={value} onChange={e=>onChange(e.target.value)} data-fullscreen-popover="true">
  <optgroup label="基本表示"><option value="all">全体</option>{choices.some(c=>c.id==='simple-overview')&&<option value="simple-overview">簡易全体</option>}</optgroup>
  {(['environment','composition','path'] as const).map(group=><optgroup key={group} label={{environment:'環境・設定',composition:'構成区分',path:'経路'}[group]}>{choices.filter(c=>c.group===group).map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</optgroup>)}
 </select></label>;
}

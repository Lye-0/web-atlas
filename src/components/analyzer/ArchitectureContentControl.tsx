import type {ArchitectureContentChoice} from '../../analyzer/semantic/architectureContent';
import './architecture-content-control.css';
export function ArchitectureContentControl({choices,value,onChange}:{choices:readonly ArchitectureContentChoice[];value:string;onChange:(id:string)=>void}){
 return <label className="architecture-content-control"><span>表示内容</span><select aria-label="表示内容" value={value} onChange={e=>onChange(e.target.value)} data-fullscreen-popover="true">
  <option value="all">全体</option>
  {(['environment','composition','path'] as const).map(group=><optgroup key={group} label={{environment:'環境・設定から見る',composition:'構成区分から見る',path:'経路から見る'}[group]}>{choices.filter(c=>c.group===group).map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</optgroup>)}
 </select></label>;
}

import type {ArchitectureHeading} from '../../analyzer/semantic/architectureHeadings';
import './architecture-context-polish.css';

export function ArchitectureEnvironmentHeadings({headings}:{headings:readonly ArchitectureHeading[]}){
 return <g className="architecture-environment-headings" aria-label="環境と分類の見出し" pointerEvents="none">
  {headings.map(h=><text key={h.id} data-environment-heading={h.id} x={h.left} y={h.top+12} className="architecture-environment-name" aria-label={h.label}><title>{h.label}</title>{h.lines.map((line,i)=><tspan key={i} x={h.left} dy={i?16:0}>{line}</tspan>)}</text>)}
 </g>;
}

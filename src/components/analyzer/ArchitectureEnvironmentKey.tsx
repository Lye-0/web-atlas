import {useMemo} from 'react';
import type {SemanticNode} from '../../analyzer/semantic/types';
import {architectureEnvironmentHeadings} from '../../analyzer/semantic/architectureHeadings';
import './architecture-context-polish.css';
export function ArchitectureEnvironmentKey({nodes}:{nodes:readonly SemanticNode[]}){
 const headings=useMemo(()=>nodes.some(n=>n.attributes.unifiedFlow)?architectureEnvironmentHeadings(nodes):[],[nodes]);
 return headings.length>0?<ul className="architecture-environment-key" aria-label="環境の囲いの見出し">{headings.map(h=><li key={h.id} data-environment-key={h.id}><b aria-hidden="true">{h.number}</b><span title={h.label}>{h.label}</span></li>)}</ul>:null;
}

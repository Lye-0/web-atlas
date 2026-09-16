import {useState} from 'react';
import type {ArchitectureHeading} from '../../analyzer/semantic/architectureHeadings';
import './architecture-context-polish.css';

function Heading({heading:h}:{heading:ArchitectureHeading}){
 const [open,setOpen]=useState(false);
 return <div className="architecture-environment-heading" style={{left:h.left,top:h.top,width:h.width}} data-environment-heading={h.id}>
  <button type="button" style={{height:h.height}} aria-label={h.label} aria-expanded={open} onClick={()=>setOpen(!open)} onBlur={()=>setOpen(false)} onKeyDown={e=>{if(e.key==='Escape')setOpen(false);}}><span>{h.label}</span></button>
  {open&&<p className="architecture-environment-full">{h.label}</p>}
 </div>;
}
export function ArchitectureEnvironmentHeadings({headings}:{headings:readonly ArchitectureHeading[]}){
 return <div className="architecture-environment-headings" aria-label="環境と分類の見出し">
  <svg aria-hidden="true">{headings.map(h=><path key={h.id} d={`M${h.anchorX},${h.anchorY} L${Math.max(h.left,Math.min(h.left+h.width,h.anchorX))},${Math.max(h.top,Math.min(h.top+h.height,h.anchorY))}`}/>)}</svg>
  {headings.map(h=><Heading key={h.id} heading={h}/>)}
 </div>;
}

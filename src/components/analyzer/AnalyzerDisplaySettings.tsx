import {useEffect,useId,useRef,useState,type ReactNode} from 'react';

export function AnalyzerDisplaySettings({children}:{children:ReactNode}){
 const [open,setOpen]=useState(false),root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null),id=useId();
 useEffect(()=>{if(!open)return;const outside=(event:PointerEvent)=>{if(event.target instanceof Node&&!root.current?.contains(event.target))setOpen(false);};document.addEventListener('pointerdown',outside,true);return()=>document.removeEventListener('pointerdown',outside,true);},[open]);
 return <div ref={root} className="analyzer-display-settings" data-fullscreen-popover="true" onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))setOpen(false);}} onKeyDown={event=>{if(event.key==='Escape'&&open){event.preventDefault();event.stopPropagation();setOpen(false);trigger.current?.focus();}}}>
  <button ref={trigger} type="button" aria-expanded={open} aria-controls={id} onClick={()=>setOpen(value=>!value)}>表示設定</button>
  {open&&<div id={id} role="group" aria-label="表示設定" className="analyzer-display-settings-panel">{children}</div>}
 </div>;
}

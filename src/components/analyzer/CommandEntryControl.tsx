import type { PackageScriptFact } from '../../analyzer';
export function CommandEntryControl({scripts,entryScriptId,onChange,compact=false}:{scripts:readonly PackageScriptFact[];entryScriptId?:string;onChange:(id:string)=>void;compact?:boolean}) {
  const current=scripts.find(script=>script.id===entryScriptId);
  return <label className={'analyzer-filter-control analyzer-entry-control'+(compact?' analyzer-fullscreen-entry':'')}>
    <span>{compact?'開始':'開始コマンド'}</span>
    <select value={entryScriptId??''} onChange={event=>onChange(event.target.value)} aria-label="Command Flowのentry script" title={current?current.packageName+' · '+current.scriptName:'開始コマンド'} data-fullscreen-popover={compact||undefined}>
      {!scripts.length&&<option value="">scriptなし</option>}{scripts.map(script=><option key={script.id} value={script.id}>{script.packageName} · {script.scriptName}</option>)}
    </select>
  </label>;
}

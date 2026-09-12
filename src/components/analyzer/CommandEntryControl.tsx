import type { PackageScriptFact } from '../../analyzer';
export function CommandEntryControl({scripts,entryScriptId,onChange,compact=false}:{scripts:readonly PackageScriptFact[];entryScriptId?:string;onChange:(id:string)=>void;compact?:boolean}) {
  const current=scripts.find(script=>script.id===entryScriptId);
  const label=(script:PackageScriptFact)=>{const repeated=scripts.filter(other=>other.packageName===script.packageName&&other.scriptName===script.scriptName).length>1;const path=script.sourcePath??script.filePath;return `${script.packageName} · ${script.scriptName}${path&&(repeated||!path.endsWith('package.json'))?` · ${path}`:''}`;};
  return <label className={'analyzer-filter-control analyzer-entry-control'+(compact?' analyzer-fullscreen-entry':'')}>
    <span>{compact?'開始':'開始コマンド'}</span>
    <select value={entryScriptId??''} onChange={event=>onChange(event.target.value)} aria-label="Command Flowのentry script" title={current?label(current):'開始コマンド'} data-fullscreen-popover={compact||undefined}>
      {!scripts.length&&<option value="">scriptなし</option>}{scripts.map(script=><option key={script.id} value={script.id}>{label(script)}</option>)}
    </select>
  </label>;
}

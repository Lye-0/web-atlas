/** Preserve distinguishing path components; full paths remain on canonical data/tooltips. */
export function architectureShortPath(path:string,peers:readonly string[]):string{
 const normal=(value:string)=>value.replaceAll('\\','/').replace(/^\.\//,'').replace(/\/$/,'');
 const value=normal(path);if(!value||value==='.')return 'プロジェクト直下';
 const all=[...new Set([...peers,path].map(normal))].filter(p=>p&&p!=='.'),segments=all.map(p=>p.split('/'));
 let prefix=0,suffix=0;
 if(segments.length>1){const shortest=Math.min(...segments.map(p=>p.length));while(prefix<shortest-1&&segments.every(p=>p[prefix]===segments[0]![prefix]))prefix++;while(suffix<shortest-prefix-1&&segments.every(p=>p[p.length-1-suffix]===segments[0]![segments[0]!.length-1-suffix]))suffix++;}
 const trim=(p:string)=>p.split('/').slice(prefix,suffix?-suffix:undefined);
 const parts=trim(value),other=all.filter(p=>p!==value).map(p=>trim(p).join('/'));
 for(let length=Math.min(2,parts.length);length<=parts.length;length++){
  const suffix=parts.slice(-length).join('/');if(!other.some(p=>p===suffix||p.endsWith('/'+suffix)))return suffix;
 }
 return value;
}

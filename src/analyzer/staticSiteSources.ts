import {templateElements} from './templateSyntax';
import {localPath,directoryFor} from './projectPaths';
export interface StaticSiteEntry {path:string;root:string;references:{path:string;start:number;end:number}[]}
/** Documents/templates/fixtures are not browser entry points merely because they contain HTML. */
export function staticSiteEntries(sources:Record<string,string>):StaticSiteEntry[]{
 const entries:StaticSiteEntry[]=[];
 for(const [path,source]of Object.entries(sources)){
  if(!/\.html?$/i.test(path)||/(?:^|\/)(?:tests?|specs?|__tests__|fixtures?|__fixtures__|templates?|views|docs?|examples?|samples?|dist|build|coverage|\.next)(?:\/|$)/i.test(path)||!/<(?:!doctype\s+html|html\b)/i.test(source)||/<%|{{|{%/.test(source))continue;
  const root=directoryFor(path),references:StaticSiteEntry['references']=[];
  for(const element of templateElements(source))for(const a of element.attributes){
   if(!(element.name==='script'&&a.name==='src'||element.name==='link'&&a.name==='href'&&element.attributes.some(v=>v.name==='rel'&&v.value==='stylesheet')))continue;
   if(/^(?:[a-z]+:|\/\/|#)|[${}]/i.test(a.value))continue;
   const target=localPath(root,a.value.split(/[?#]/)[0]!);
   if(target&&Object.hasOwn(sources,target))references.push({path:target,start:a.start,end:a.end});
  }
  if(references.some(r=>/\.[cm]?js$/.test(r.path)))entries.push({path,root,references});
 }
 return entries;
}

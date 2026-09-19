import { arrayValue,directoryFor,localPath,objectValue,parseStructuredConfig,textValue } from './manifestAdapters';
import { normalizeIdentifier,type Ecosystem } from './stackRegistry';
import { expandedProjectId,type ExpansionContext } from './expandedScan';
import { parseJsonc } from './parsers';
import { jsonLocations } from './jsonLocations';
import { parseDocument } from 'yaml';
import { sourceSyntax } from './sourceSyntax';

interface LockedVersion { ecosystem:Ecosystem; name:string; version:string; descriptor?:string; importer?:string; sourceIdentity?:string; dependencies?:{name:string;version?:string;sourceIdentity?:string}[]; framework?:string;unsupportedVersion?:boolean;start:number; end:number }
const sourceIdentity=(value:unknown)=>typeof value==='string'?value:value&&typeof value==='object'?JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)))):undefined;
const registryVersion=(value:string,ecosystem:Ecosystem='npm')=>ecosystem==='pypi'?/^v?(?:\d+!)?\d+(?:\.\d+)*(?:(?:a|b|rc)\d+)?(?:\.post\d+)?(?:\.dev\d+)?(?:\+[\w.]+)?$/i.test(value):ecosystem==='composer'?/^(?:dev-[\w./-]+|v?\d+(?:\.[\dx*]+){0,3}(?:[-.]?(?:dev|alpha|beta|rc|patch)\d*)?)$/i.test(value):/^v?\d+(?:\.\d+){1,3}(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(value);
function packageVersion(value:string):{name:string;version:string}|undefined {const at=value.lastIndexOf('@');if(at<=0)return;const version=value.slice(at+1);return registryVersion(version)?{name:value.slice(0,at),version}:undefined;}

/** Only resolution metadata is returned; lock contents never declare direct dependencies. */
export function lockVersions(path:string,source:string,format?:string):LockedVersion[]{
  const file=(format??path.split('/').at(-1)!).toLowerCase();const result:LockedVersion[]=[];
  const add=(ecosystem:Ecosystem,name:string,version:string,start:number,end:number,extra:Partial<LockedVersion>={})=>{if(name&&version)result.push({ecosystem,name,version,start,end,...extra,...registryVersion(version,ecosystem)?{}:{unsupportedVersion:true}});};
  if(file==='yarn.lock'&&!/^__metadata:/m.test(source)){
    const headers=[...source.matchAll(/^([^\s#][^\n]*):\s*$/gm)];
    headers.forEach((header,index)=>{const end=headers[index+1]?.index??source.length;const body=source.slice(header.index!,end);const version=body.match(/^\s+version\s+"([^"]+)"/m)?.[1];if(!version)return;
      for(const descriptor of header[1]!.split(/,\s*/).map(value=>value.replace(/^"|"$/g,''))){const at=descriptor.lastIndexOf('@');if(at>0)add('npm',descriptor.slice(0,at),version,header.index!,end,{descriptor:descriptor.slice(at+1)});}
    });return result;
  }
  const toml=['cargo.lock','uv.lock'].includes(file);const yaml=['yarn.lock','pubspec.lock','pnpm-lock.yaml'].includes(file);
  const data=toml?parseStructuredConfig('lock.toml',source):yaml?parseStructuredConfig('lock.yaml',source):objectValue(parseJsonc(source));
  const yamlDocument=yaml?parseDocument(source):undefined;
  const locations=!toml&&!yaml?jsonLocations(source):undefined;
  const range=(keys:string[],name:string)=>{const found=locations?.get(JSON.stringify(keys))?.value;if(found)return found;const start=source.indexOf(name);return{start:Math.max(0,start),end:Math.max(0,start)+name.length};};
  if(toml){
    const ecosystem:Ecosystem=file==='cargo.lock'?'cargo':'pypi';
    const blocks=[...sourceSyntax(source,'toml').code.matchAll(/^\[\[package\]\][ \t]*$/gm)];
    for(const[index,record]of arrayValue(data.package).map(objectValue).entries()){const name=textValue(record.name),version=textValue(record.version);const origin=objectValue(record.source);const local=textValue(origin.editable??origin.virtual??origin.directory);const dependencies=arrayValue(record.dependencies).flatMap(value=>{if(typeof value==='string'){const match=value.match(/^(\S+)(?:\s+([^\s(]+))?(?:\s+\(([^)]+)\))?$/);return match?[{name:match[1]!,version:match[2],sourceIdentity:match[3]}]:[];}const dependency=objectValue(value);return textValue(dependency.name)?[{name:textValue(dependency.name),version:textValue(dependency.version)||undefined,sourceIdentity:sourceIdentity(dependency.source)}]:[];});add(ecosystem,name,version,blocks[index]?.index??0,blocks[index+1]?.index??source.length,{sourceIdentity:sourceIdentity(record.source),importer:local?localPath(directoryFor(path),local):undefined,dependencies});}
  }else if(file==='composer.lock')for(const group of ['packages','packages-dev'])for(const[index,record]of arrayValue(data[group]).map(objectValue).entries()){const name=textValue(record.name),at=range([group,String(index)],name);add('composer',name,textValue(record.version),at.start,at.end);}
  else if(file==='packages.lock.json'){
    if(![1,2].includes(Number(data.version)))throw new Error(`NuGet lock version ${textValue(data.version)} は未対応`);
    for(const[framework,records]of Object.entries(objectValue(data.dependencies)))for(const[name,raw]of Object.entries(objectValue(records))){const record=objectValue(raw);if(record.type==='Project')continue;const at=range(['dependencies',framework,name],name);add('nuget',name,textValue(record.resolved),at.start,at.end,{framework});}
  }
  else if(file==='package-lock.json'){
    for(const[key,raw]of Object.entries(objectValue(data.packages))){const record=objectValue(raw);if(!key.includes('node_modules/')||record.link)continue;const name=textValue(record.name)||key.slice(key.lastIndexOf('node_modules/')+13);const at=range(['packages',key],key);add('npm',name,textValue(record.version),at.start,at.end,{importer:key.slice(0,key.lastIndexOf('node_modules/')).replace(/\/$/,'')});}
  }else if(file==='yarn.lock')for(const[key,raw]of Object.entries(data)){if(key==='__metadata')continue;const record=objectValue(raw),resolved=packageVersion(textValue(record.resolution).replace('@npm:','@'));if(!resolved||!textValue(record.resolution).includes('@npm:'))continue;for(const descriptor of key.split(/,\s*/)){const at=descriptor.lastIndexOf('@npm:');if(at<0||descriptor.slice(0,at)!==resolved.name)continue;const node=yamlDocument?.getIn([key,'version'],true)as{range?:[number,number,number]}|undefined;if(node?.range)add('npm',resolved.name,textValue(record.version),node.range[0],node.range[1],{descriptor:descriptor.slice(at+5)});}}
  else if(file==='bun.lock'){
    if(![0,1,2].includes(Number(data.lockfileVersion)))throw new Error(`Bun lock version ${textValue(data.lockfileVersion)} は未対応`);
    for(const[key,raw]of Object.entries(objectValue(data.packages))){const resolved=packageVersion(textValue(arrayValue(raw)[0]));if(!resolved||key!==resolved.name)continue;const at=range(['packages',key],key);add('npm',resolved.name,resolved.version,at.start,at.end);}
  }else if(file==='deno.lock'){
    if(!['4','5'].includes(String(data.version)))throw new Error(`Deno lock version ${textValue(data.version)} は未対応`);
    for(const[specifier,version]of Object.entries(objectValue(data.specifiers))){if(!specifier.startsWith('npm:'))continue;const packageSpecifier=specifier.slice(4),at=packageSpecifier.lastIndexOf('@');if(at<=0)continue;const r=range(['specifiers',specifier],specifier);add('npm',packageSpecifier.slice(0,at),textValue(version),r.start,r.end,{descriptor:packageSpecifier.slice(at+1)});}
  }else if(file==='pubspec.lock')for(const[name,raw]of Object.entries(objectValue(data.packages))){const at=range(['packages',name],name);add('dart',name,textValue(objectValue(raw).version),at.start,at.end);}
  else if(file==='package.resolved')for(const[index,raw]of arrayValue(data.pins??objectValue(data.object).pins).map(objectValue).entries()){const at=range(['pins',String(index)],textValue(raw.identity));add('swift',textValue(raw.identity??raw.package),textValue(objectValue(raw.state).version),at.start,at.end);}
  return result;
}

export function scanLockedVersions(context:ExpansionContext):void{
  const locks=new Map<string,LockedVersion[]>();
  const custom=new Map(context.projects.flatMap(project=>typeof project.attributes.lockPath==='string'&&!project.attributes.lockDisabled?[[localPath(project.directory,project.attributes.lockPath),project.attributes.runtime==='deno'?'deno.lock':project.ecosystem==='nuget'?'packages.lock.json':'']as const]:[]));
  for(const[path,source]of context.sources)if(custom.get(path)||/(?:yarn\.lock|bun\.lock|deno\.lock|Cargo\.lock|uv\.lock|composer\.lock|packages\.lock\.json|package-lock\.json|pubspec\.lock|Package\.resolved)$/.test(path))try{locks.set(path,lockVersions(path,source,custom.get(path)||undefined));}catch(error){context.builder.addWarning({id:`warning:lock:${path}`,filePath:path,severity:'warning',message:`lock解析は未完了: ${error instanceof Error?error.message:String(error)}`});}
  for(const project of context.projects){
    if(project.attributes.lockDisabled)continue;
    const candidates=[...locks].filter(([path])=>{if(typeof project.attributes.lockPath==='string')return path===localPath(project.directory,project.attributes.lockPath);const dir=directoryFor(path);if(project.directory===dir)return true;
      return context.projects.some(root=>root.directory===dir&&root.ecosystem===project.ecosystem&&root.members.some(member=>{const resolved=localPath(root.directory,member);if(!resolved)return false;const regex=new RegExp('^'+resolved.split('**').map(part=>part.split('*').map(piece=>piece.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('[^/]*')).join('.*')+'$');return regex.test(project.directory)||regex.test(project.path);}));
    }).sort(([a],[b])=>directoryFor(b).length-directoryFor(a).length);
    for(const dependency of project.dependencies){
      const match=candidates.map(([path,records])=>{const owners=records.filter(record=>record.ecosystem===project.ecosystem&&normalizeIdentifier(project.ecosystem,record.name)===normalizeIdentifier(project.ecosystem,project.name)&&(record.importer===project.directory||project.ecosystem==='cargo'&&!record.sourceIdentity));const declared=owners.length===1?owners[0]!.dependencies?.filter(item=>normalizeIdentifier(project.ecosystem,item.name)===normalizeIdentifier(project.ecosystem,dependency.name)):undefined;const frameworks=String(project.attributes.targetFramework??'').split(';').filter(Boolean);return{path,records:records.filter(record=>record.ecosystem===project.ecosystem&&normalizeIdentifier(project.ecosystem,record.name)===normalizeIdentifier(project.ecosystem,dependency.name)&&(!record.descriptor||record.descriptor===dependency.version)&&(!record.framework||!frameworks.length||frameworks.includes(record.framework.split('/')[0]!))&&(declared===undefined||declared.some(item=>(!item.version||item.version===record.version)&&(!item.sourceIdentity||item.sourceIdentity===record.sourceIdentity))))};}).find(item=>item.records.length);
      if(!match)continue;const versions=[...new Set(match.records.map(record=>record.version))];
      if(match.records.some(record=>record.unsupportedVersion)){context.builder.addWarning({id:`warning:lock-version-form:${project.path}:${dependency.name}`,filePath:match.path,severity:'warning',message:`${dependency.name}: ${project.ecosystem} lockのversion表現は未対応`});continue;}
      const frameworkSpecific=project.ecosystem==='nuget'&&match.records.every(record=>record.framework)&&new Set(match.records.map(record=>record.framework)).size===match.records.length;
      if(versions.length!==1&&!frameworkSpecific||new Set(match.records.map(record=>record.sourceIdentity??'')).size>1){context.builder.addWarning({id:`warning:lock-ambiguous:${project.path}:${dependency.name}`,filePath:match.path,severity:'warning',message:`${dependency.name}: lockのversion/source候補が複数あり未解決`});continue;}
      const resolutionEvidence=match.records.map(record=>context.evidence(match.path,record.start,record.end,'lock-version',`${dependency.name}の解決version ${record.version}${record.framework?` / ${record.framework}`:''}（直接依存宣言への補助情報）`,'declaration'));
      const store=context.builder.build([]);for(const relation of store.relations.filter(relation=>relation.kind==='depends-on'&&relation.sourceId===expandedProjectId(project))){const target=store.facts.find(fact=>fact.id===relation.targetId);const name=typeof relation.metadata.packageName==='string'?relation.metadata.packageName:target?.kind==='external-package'?target.packageName:undefined;if(!target||!name||normalizeIdentifier(project.ecosystem,name)!==normalizeIdentifier(project.ecosystem,dependency.name))continue;
        context.builder.addRelation({...relation,evidenceIds:[...relation.evidenceIds,...resolutionEvidence],metadata:{...relation.metadata,resolvedVersion:versions.length===1?versions[0]:undefined,resolvedVersions:versions,lockPath:match.path,lockResolutions:JSON.stringify(match.records.map(record=>({version:record.version,framework:record.framework,source:record.sourceIdentity,start:record.start,end:record.end})))}});
        context.builder.addFact({...target,evidenceIds:target.kind==='technology'?target.evidenceIds:[...target.evidenceIds,...resolutionEvidence],metadata:{...target.metadata,resolvedVersions:[...new Set([...(Array.isArray(target.metadata.resolvedVersions)?target.metadata.resolvedVersions:[]),...versions])],lockPaths:[...new Set([...(Array.isArray(target.metadata.lockPaths)?target.metadata.lockPaths:[]),match.path])]}});
      }
    }
  }
}

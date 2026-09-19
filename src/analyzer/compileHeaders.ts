import { parseJsonc } from './parsers';
import { directoryFor,localPath } from './projectPaths';
import { commandArgv,parseCommandExpression } from './commandParser';
import { languageImports } from './sourceSyntax';

/** A header receives a language only from an explicit local compilation unit/include chain. */
export function compileHeaderLanguages(sources:ReadonlyMap<string,string>):Map<string,'c'|'cpp'> {
  const candidates=new Map<string,Set<'c'|'cpp'>>();
  const visit=(path:string,language:'c'|'cpp',includeDirs:string[],seen:Set<string>)=>{
    if(seen.has(path)||!sources.has(path))return;seen.add(path);
    if(path.endsWith('.h')){const values=candidates.get(path)??new Set();values.add(language);candidates.set(path,values);}
    for(const reference of languageImports(path,sources.get(path)!)){
      const targets=[directoryFor(path),...includeDirs].map(directory=>localPath(directory,reference.specifier)).filter((value):value is string=>Boolean(value&&sources.has(value)));
      if(new Set(targets).size===1)visit(targets[0]!,language,includeDirs,seen);
    }
  };
  for(const[path,source]of sources)if(path.endsWith('compile_commands.json'))try{
    const records=parseJsonc(source);if(!Array.isArray(records))continue;
    for(const record of records){if(!record||typeof record!=='object'||typeof record.file!=='string')continue;
      const directory=localPath(directoryFor(path),typeof record.directory==='string'?record.directory:'.');if(!directory)continue;
      const target=localPath(directory,record.file);if(!target||!sources.has(target))continue;
      const argv:string[]=Array.isArray(record.arguments)?record.arguments.filter((value:unknown)=>typeof value==='string'):typeof record.command==='string'?commandArgv(parseCommandExpression(record.command)[0]!):[];
      const inputIndex=argv.findIndex((value,index)=>index>0&&localPath(directory,value)===target);let mode:string|undefined;
      for(let index=1;index<(inputIndex<0?argv.length:inputIndex);index++){if(argv[index]==='-x')mode=argv[++index];else if(argv[index]!.startsWith('-x')&&argv[index]!.length>2)mode=argv[index]!.slice(2);}if(mode==='none')mode=undefined;
      const language=mode?/^(?:c\+\+|c\+\+-header)$/.test(mode)?'cpp':/^(?:c|c-header)$/.test(mode)?'c':undefined:/\.(?:cpp|cc|cxx)$/.test(target)||/\+\+$/.test(argv[0]??'')?'cpp':target.endsWith('.c')?'c':undefined;
      if(!language)continue;const includes=argv.flatMap((value,index)=>value==='-I'||value==='-iquote'?[argv[index+1]??'']:value.startsWith('-I')?[value.slice(2)]:[]).map(value=>localPath(directory,value)).filter((value):value is string=>Boolean(value));
      visit(target,language,includes,new Set());
    }
  }catch{/* malformed compilation databases stay unresolved */}
  return new Map([...candidates].filter(([,values])=>values.size===1).map(([path,values])=>[path,[...values][0]!]));
}

import { commandArgv, commandSourceRange, parseCommandExpression, type CommandFragment } from './commandParser';
import type { ExpansionContext } from './expandedScan';
import {expandedProjectId,localPath}from'./projectPaths';
import{commandProjectPath}from'./commandProject';
import{commandSubcommand,runtimeEntryArgument,workingDirectoryArgument}from'./runtimeArgv';

const executables:Record<string,string>={node:'nodejs',npm:'npm',pnpm:'pnpm',yarn:'yarn',bun:'bun',deno:'deno',python:'python',python3:'python',pip:'pip',pip3:'pip',uv:'uv',cargo:'cargo',composer:'composer',nuget:'nuget',mvn:'maven',mvnw:'maven',gradle:'gradle',gradlew:'gradle',java:'jvm',go:'go',ruby:'ruby',php:'php',webpack:'webpack',esbuild:'esbuild',jest:'jest',pytest:'pytest',cypress:'cypress',kubectl:'kubernetes',netlify:'netlify',nginx:'nginx',httpd:'apache-http-server',apache2:'apache-http-server',dotnet:'dotnet','docker-compose':'docker-compose'};
export function commandStackId(argv:readonly string[]):string|undefined{
  const executable=argv[0]?.replace(/^\.\//,'').toLowerCase();if(executable==='docker')return argv[1]==='compose'?'docker-compose':'docker';
  if(executable==='firebase')return /^emulators:(?:start|exec)$/.test(argv[1]??'')?'firebase-emulator-suite':argv[1]==='deploy'&&argv.some((arg,index)=>arg==='--only'&&/^hosting(?::|,|$)/.test(argv[index+1]??'')||/^--only=hosting(?::|,|$)/.test(arg))?'firebase-hosting':'firebase';
  return executable?executables[executable]:undefined;
}
export function commandPurpose(argv:readonly string[]):'start'|'build'|'test'|'deploy'|'install'|'tool'{
  if(argv[0]==='esbuild'&&!argv.some(value=>['--version','--help'].includes(value)))return'build';
  const subcommand=commandSubcommand(argv);if(['pytest','jest','cypress'].includes(argv[0]??'')||/^(?:test|emulators:exec)$/.test(subcommand??''))return'test';
  if(/^(?:deploy|publish|apply)$/.test(subcommand??''))return'deploy';if(/^(?:build|compile|package|bundle)$/.test(subcommand??''))return'build';
  if(/^(?:install|add|restore|sync)$/.test(subcommand??''))return'install';if(/^(?:run|dev|start|up|emulators:start)$/.test(subcommand??''))return'start';return'tool';
}
export function scanCommandEvidence(context:ExpansionContext):void{
  const scripts:Extract<ReturnType<typeof context.builder.getFact>,{kind:'package-script'}>[]=[];context.builder.forEachFact(fact=>{if(fact.kind==='package-script')scripts.push(fact);});
  for(const script of scripts){
    if(script.metadata.purpose==='entry-point'&&script.metadata.ecosystem==='pypi'){
      const callable=script.command.match(/^([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*):([A-Za-z_]\w*)$/);if(callable){const target=[`${callable[1]!.replaceAll('.','/')}.py`,`src/${callable[1]!.replaceAll('.','/')}.py`].map(value=>localPath(script.packagePath,value)).filter((path):path is string=>Boolean(path&&context.sources.has(path)));if(target.length===1){const ev=context.evidence(script.sourcePath,script.commandStartOffset??0,script.commandEndOffset??script.command.length,'python-console-entry','Python console scriptのmodule:function登録');const id=`runtime:console:${script.id}`;context.technology('python',script.sourcePath,script.commandStartOffset??0,script.commandEndOffset??script.command.length,'usage','console scriptのPython callable');context.builder.addFact({id,kind:'runtime',label:`Python console · ${script.scriptName}`,runtimeType:'python',packageId:script.packageId,filePath:script.sourcePath,configPath:script.sourcePath,evidenceIds:[ev],metadata:{dictionaryStackId:'python',entryPath:target[0]!,entryFunction:callable[2]!,entryScriptId:script.id,commandPurpose:'start',declaration:true,observed:false}});context.relation(script.id,id,'starts',[ev]);}}
    }
    const visit=(fragment:CommandFragment)=>{
      const argv=commandArgv(fragment);const stackId=commandStackId(argv);const{start,end}=commandSourceRange(context.sources.get(script.sourcePath)??'',script,fragment);
      if(stackId)context.technology(stackId,script.sourcePath,start,end,'usage',`${commandPurpose(argv)} command: ${argv.slice(0,2).join(' ')}`);
      const executable=argv[0];const runtime=({bun:'bun',deno:'deno',node:'nodejs',python:'python',python3:'python',java:'jvm',dotnet:'dotnet'}as Record<string,string>)[executable??''];
      const cwd=fragment.workingDirectory??workingDirectoryArgument(argv);const directory=cwd?localPath(script.packagePath,cwd):script.packagePath;const selected=commandProjectPath(argv,directory??script.packagePath);const project=selected.explicit?context.projects.find(project=>project.path===selected.path||project.directory===selected.path):cwd&&directory?context.owner(directory+'/'):context.projects.find(project=>expandedProjectId(project)===script.packageId)??context.owner(script.sourcePath);
      if(runtime&&directory&&(!selected.explicit||project)){const operand=runtimeEntryArgument(argv);const entryArg=operand&&/\.(?:[cm]?[jt]sx?|py|java|jar|csproj)$/.test(operand)?operand:undefined;const entry=entryArg?localPath(directory,entryArg):undefined;
        if(entry&&(context.sources.has(entry)||entry.endsWith('.jar'))&&(!['bun','deno','dotnet'].includes(executable!)||argv[1]==='run'||executable==='java')){
          const ev=context.evidence(script.sourcePath,start,end,'runtime-command',`${runtime}: ${entry}`);const id=`runtime:command:${script.packageId}:${runtime}:${entry}`;
          let sourceEntry=entry;let entryMode:string|undefined;let entryFunction:string|undefined;if(runtime==='dotnet'&&project){const program=localPath(project.directory,'Program.cs');const source=program?context.sources.get(program):undefined;if(program&&source&&project.attributes.webSdk&&/\bWebApplication\.CreateBuilder\s*\(/.test(source)){sourceEntry=program;entryMode='top-level';}else if(program&&source&&/\bstatic\s+(?:async\s+)?(?:void|int|Task(?:<int>)?)\s+Main\s*\(/.test(source)){sourceEntry=program;entryFunction='Main';}}
          context.builder.addFact({id,kind:'runtime',label:`${runtime} · ${entryArg}`,runtimeType:runtime,packageId:project?expandedProjectId(project):script.packageId,configPath:script.sourcePath,filePath:project?.path??script.sourcePath,evidenceIds:[ev],metadata:{dictionaryStackId:runtime,entryPath:sourceEntry,invocationTargetPath:entry,entryMode,entryFunction,commandPurpose:'start',declaration:true,observed:false}});context.relation(script.id,id,'starts',[ev],{purpose:'start'});
        }
      }
      fragment.children.forEach(visit);
    };parseCommandExpression(script.command).forEach(visit);
  }
}

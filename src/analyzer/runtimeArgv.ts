/** Supported CLI operands are positional after their own option grammar, never arbitrary filename-like arguments. */
export function runtimeEntryArgument(argv:readonly string[]):string|undefined{
 const executable=argv[0]?.replace(/^\.\//,'');let index=1;
 if(executable==='dotnet'){if(argv[1]!=='run')return;const flag=argv.findIndex(value=>value==='--project');return flag>=0?argv[flag+1]:argv.find(value=>value.startsWith('--project='))?.slice(10);}
 if(executable==='bun'||executable==='deno'){if(argv[1]!=='run')return;index=2;}
 const values=executable==='java'?new Set(['-cp','-classpath','--class-path','-p','--module-path','--source','--add-modules','--add-exports','--add-opens']):executable==='python'||executable==='python3'?new Set(['-W','-X']):new Set(['--config','-c','--import-map','--loader','--import','--require','-r','--cwd']);
 for(;index<argv.length;index++){const value=argv[index]!;if(value==='--'){index++;break;}if(executable==='java'&&value==='-jar')return argv[index+1];if(['python','python3'].includes(executable??'')&&['-c','-m'].includes(value)||['node','bun'].includes(executable??'')&&['-e','--eval','-p','--print'].includes(value))return;if(values.has(value)){index++;continue;}if(value.startsWith('-'))continue;return value;}
 return argv[index];
}
export function commandSubcommand(argv:readonly string[]):string|undefined{
 const values=new Set(['--project','--directory','--manifest-path','--working-dir','--project-dir','--features','--target','--configuration','-f','--file','-p','-d','--filter','--only']);
 for(let index=1;index<argv.length;index++){const value=argv[index]!;if(values.has(value)){index++;continue;}if(value.startsWith('-'))continue;return value;}
 return undefined;
}
export function workingDirectoryArgument(argv:readonly string[]):string|undefined{if(argv[0]!=='uv')return;const index=argv.indexOf('--directory');return index>=0?argv[index+1]:argv.find(value=>value.startsWith('--directory='))?.slice(12);}

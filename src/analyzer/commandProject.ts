import{localPath}from'./projectPaths';
/** A command can select a project only through a recorded, literal path flag. */
export function commandProjectPath(argv:readonly string[],base:string):{path?:string;explicit:boolean}{
  if(argv[0]==='dotnet'&&['restore','build','test','publish'].includes(argv[1]??'')){const project=argv.slice(2).find(value=>/\.(?:csproj|sln|slnx)$/.test(value));if(project)return{path:localPath(base,project),explicit:true};}
  const flags=argv[0]==='cargo'?['--manifest-path']:['mvn','mvnw'].includes(argv[0]??'')?['-f','--file']:['gradle','gradlew'].includes(argv[0]??'')?['-p','--project-dir']:argv[0]==='composer'?['-d','--working-dir']:['dotnet','uv'].includes(argv[0]??'')?['--project']:[];
  for(let index=1;index<argv.length;index++){const argument=argv[index]!;const flag=flags.find(flag=>argument===flag||argument.startsWith(flag+'='));if(!flag)continue;const value=argument===flag?argv[index+1]:argument.slice(flag.length+1);return{path:value?localPath(base,value):undefined,explicit:true};}
  return{explicit:false};
}

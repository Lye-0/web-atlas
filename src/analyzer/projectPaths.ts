import type { ManifestProject } from './manifestAdapters';
import { packageIdForPath } from './types';

export function directoryFor(path:string):string{return path.includes('/')?path.slice(0,path.lastIndexOf('/')):'.';}
export function localPath(base:string,value:string):string|undefined{
  if(!value||/^(?:[a-z]+:|\/|\\)/i.test(value))return undefined;
  const result=base==='.'?[]:base.replaceAll('\\','/').split('/');
  for(const part of value.replaceAll('\\','/').split('/')){if(part==='..'){if(!result.length)return undefined;result.pop();}else if(part&&part!=='.')result.push(part);}
  return result.join('/')||'.';
}
export const expandedProjectId=(project:ManifestProject):string=>project.ecosystem==='npm'&&project.path.endsWith('package.json')?packageIdForPath(project.directory):`package:${project.path}:${project.ecosystem}${project.attributes.configScope?`:${project.directory}`:''}`;

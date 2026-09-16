import type {SemanticNode} from '../../analyzer/semantic/types';
import {architectureShortPath} from './architectureShortPath';

/** Explain whose positioning was inherited without reclassifying the selected entity. */
export function architectureDefinitionPresentation(node:SemanticNode,nodes:ReadonlyMap<string,SemanticNode>){
 const path=String(node.attributes.definitionPath??''),ownerId=String(node.attributes.definitionOwnerId??'');
 const inherited=Boolean(ownerId&&ownerId!==node.id),owner=inherited?nodes.get(ownerId):undefined;
 const filename=path.replaceAll('\\','/').split('/').at(-1)??'';
 const matching=[...new Set([...nodes.values()].map(n=>String(n.attributes.definitionPath??'')).filter(p=>p&&p.replaceAll('\\','/').split('/').at(-1)===filename))];
 const parent=path.split('/').slice(0,-1).join('/');
 return {path,owner,inherited,filename,shortPath:matching.length>1?`${architectureShortPath(parent,matching.map(p=>p.split('/').slice(0,-1).join('/')))} / ${filename}`:filename,
  location:String(node.attributes.definitionLocation??'').split(' · ')[0],role:String(node.attributes.compositionRole??'')};
}

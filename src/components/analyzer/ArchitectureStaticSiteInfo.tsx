import {ArchitectureEvidenceList} from './ArchitectureEvidence';
import type {SemanticNode} from '../../analyzer/semantic/types';
/** Document statements and declared defaults are explanatory metadata, never live service status. */
export function ArchitectureStaticSiteInfo({node,sources}:{node:SemanticNode;sources:Record<string,string>}){
 const inputs=node.attributes.inputPaths;
 const details=node.attributes.customStaticDetails,destinations=node.attributes.documentedDestinations;
 if(!Array.isArray(details)&&!Array.isArray(destinations))return null;
 return <section className="simple-overview-section">
  {Array.isArray(details)&&<><h4>設定上の入力・出力と使用条件</h4>{details.map((text,i)=><p key={i} style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{text}</p>)}</>}
  {Array.isArray(inputs)&&inputs.length>0&&<details className="analyzer-detail-accordion"><summary>入力パスの内訳：{inputs.length}件</summary><div className="analyzer-detail-accordion-body">{inputs.map((path,i)=><p key={i} style={{overflowWrap:'anywhere'}}>{path}</p>)}</div></details>}
  {Array.isArray(destinations)&&<><h4>文書に記載された公開先</h4>{destinations.map((text,i)=><p key={i} style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{text}</p>)}<details className="analyzer-detail-accordion"><summary>公開先の記載位置と根拠</summary><ArchitectureEvidenceList evidence={node.evidence.filter(e=>e.description.startsWith('DEPLOYMENT節の公開先記載'))} sources={sources}/></details></>}
 </section>;
}

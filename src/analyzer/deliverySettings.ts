import { arrayValue, objectValue, staticBlocks } from './manifestAdapters';
import { hclValues } from './providerAdapters';
import { publicUrlText } from './urlPrivacy';

const keys=new Set(['hostname','default','name','id','phase','kind','zone_id','proxied','enable_cdn','cache_enabled','default_ttl','default_cache_ttl','cache_expiration_time','cache_expiration_time_browser','min_ttl','max_ttl','ttl','cache','action','expression','enabled','mode','value','path_pattern','target_origin_id','viewer_protocol_policy','cache_policy_id','cache_mode','serve_while_stale','behavior','TargetOriginId','ViewerProtocolPolicy','CachePolicyId','PathPattern','MinTTL','DefaultTTL','MaxTTL','Compress','AllowedMethods','CachedMethods','domain_name','address','url']);
const containers=new Set(['rules','rule','action_parameters','edge_ttl','browser_ttl','cache_key','cache_behavior','default_cache_behavior','ordered_cache_behavior','cdn_policy','cache_setting','condition','caching','origin','backend','items','Items','behaviors','options','children','DefaultCacheBehavior','CacheBehaviors']);
export function staticDeliverySettings(value:unknown,depth=0):unknown {
  if(depth>8)return undefined;if(Array.isArray(value))return value.map(item=>staticDeliverySettings(item,depth+1));if(value===null||typeof value!=='object')return typeof value==='string'?publicUrlText(value):value;
  return Object.fromEntries(Object.entries(objectValue(value)).filter(([key])=>keys.has(key)||containers.has(key)).map(([key,item])=>[key,staticDeliverySettings(item,depth+1)]));
}
export function hclDeliverySettings(body:string,depth=0):unknown {
  if(depth>8)return{};const parsed=hclValues(body);const result=objectValue(staticDeliverySettings(parsed.attributes));
  const blocks=staticBlocks(body);
  for(const block of blocks)if(containers.has(block.type)&&!blocks.some(parent=>parent!==block&&parent.start<block.start&&parent.end>block.end)){const prior=arrayValue(result[block.type]);result[block.type]=[...prior,hclDeliverySettings(block.body,depth+1)];}
  const unresolved=parsed.unresolved.filter(item=>keys.has(item.split(':')[0]??''));if(unresolved.length)result.unresolved=unresolved.map(publicUrlText);
  return result;
}

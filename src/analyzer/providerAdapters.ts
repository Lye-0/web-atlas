import { getStack } from '../data';
import { arrayValue, directoryFor, localPath, objectValue, parseStructuredConfig, sourceRangeFor, staticBlocks, textValue } from './manifestAdapters';
import { expandedProjectId, type ExpansionContext } from './expandedScan';
import { sourceSyntax } from './sourceSyntax';
import { scriptIdFor } from './types';
import type { AnalyzerMetadata } from './types';
import { publicUrlText } from './urlPrivacy';
import{jsonLocations}from'./jsonLocations';
import{parseDocument,parseAllDocuments}from'yaml';
import { yamlCommandOffsets } from './yamlCommandOffsets';
import { hclDeliverySettings, staticDeliverySettings } from './deliverySettings';
import { connectDeclaration } from './declarationConnections';
function structuredRange(path:string,source:string,keys:string[]):{start:number;end:number}{
  if(/\.jsonc?$/.test(path)){const location=jsonLocations(source).get(JSON.stringify(keys));if(location)return{start:location.key?.start??location.value.start,end:location.value.end};}
  else{const value=parseDocument(source).getIn(keys,true)as{range?:[number,number,number]}|undefined;if(value?.range)return{start:value.range[0],end:value.range[1]};}
  throw new Error(`設定要素の元位置を特定できません: ${keys.join('.')}`);
}

export interface ProviderResource {
  stackId: string; path: string; start: number; end: number; name: string; type: 'database' | 'storage' | 'auth' | 'other';
  environment: string; provider?: string; project?: string; endpoint?: string; identity?: string; origin?: string; parentId?: string; binding?: string;
  role?: 'external' | 'local' | 'delivery' | 'deployment'; attributes?: AnalyzerMetadata;
}
export function addProviderResource(context: ExpansionContext, resource: ProviderResource): string {
  resource={...resource,name:publicUrlText(resource.name),endpoint:resource.endpoint?publicUrlText(resource.endpoint):undefined,origin:resource.origin?publicUrlText(resource.origin):undefined,identity:resource.identity?publicUrlText(resource.identity):undefined,attributes:Object.fromEntries(Object.entries(resource.attributes??{}).map(([key,value])=>[key,typeof value==='string'?publicUrlText(value):Array.isArray(value)?value.map(publicUrlText):value]))};
  const { builder, technology, relation, evidence, owner } = context;
  const occurrence = `${resource.path}:${resource.start}:${resource.name}`;
  const legacyAuthId = `resource:${resource.path}:firebase-auth`;
  let sameIdentity:string|undefined;
  if(resource.project&&(resource.identity||resource.endpoint))builder.forEachFact(fact=>{if(fact.kind==='resource'&&fact.dictionaryStackId===resource.stackId&&fact.metadata.projectIdentity===resource.project&&fact.metadata.environment===resource.environment&&(resource.identity&&fact.metadata.stableIdentity===resource.identity||resource.endpoint&&fact.metadata.endpoint===resource.endpoint))sameIdentity??=fact.id;});
  const id = sameIdentity??(resource.stackId === 'firebase-authentication' && resource.environment === 'local' && resource.path.endsWith('firebase.json') && builder.getFact(legacyAuthId)
    ? legacyAuthId : `resource:provider:${JSON.stringify([resource.stackId, resource.project || occurrence, resource.environment, resource.identity || resource.endpoint || occurrence])}`);
  const ev = evidence(resource.path, resource.start, resource.end, `provider:${resource.stackId}`, `${resource.name}（${resource.environment}の明示設定）`, 'usage');
  const project = owner(resource.path);
  builder.addFact({ id, kind: 'resource', label: resource.name, filePath: resource.path, resourceType: resource.type, dictionaryStackId: resource.stackId, packageId: project ? expandedProjectId(project) : undefined, binding: resource.binding, evidenceIds: [ev],
    metadata: { ...resource.attributes, dictionaryStackId: resource.stackId, environment: resource.environment, provider: resource.provider ?? resource.stackId, projectIdentity: resource.project, endpoint: resource.endpoint, stableIdentity: resource.identity,
      origin: resource.origin, parentResourceId: resource.parentId, resourceRole: resource.role ?? (resource.environment === 'local' ? 'local' : 'external'), configurationOccurrence: occurrence, observed: false } });
  technology(resource.stackId, resource.path, resource.start, resource.end, 'usage', `${resource.name}の構成/使用`);
  if (resource.parentId) relation(resource.parentId, id, 'contains', [ev], { environment: resource.environment });
  if (project) relation(expandedProjectId(project), id, 'uses', [ev], { environment: resource.environment, source: 'explicit configuration' });
  return id;
}

interface HclValues { attributes: Record<string, unknown>; unresolved: string[] }
/** Bounded HCL literal reader. References/interpolation are retained as unresolved expressions. */
export function hclValues(body: string): HclValues {
  const { code, literals } = sourceSyntax(body, 'toml'); const nested = staticBlocks(body); const attributes: Record<string, unknown> = {}; const unresolved: string[] = [];
  for (const match of code.matchAll(/\b([a-zA-Z_]\w*)\s*=\s*/g)) {
    if (nested.some(block => match.index! >= block.start && match.index! < block.end)) continue;
    const start = match.index! + match[0].length; const originalTail = body.slice(start); const literal = literals.find(item => item.start >= match.index! + match[1]!.length && /^\s*=\s*$/.test(body.slice(match.index! + match[1]!.length, item.start)));
    if (literal) {
      const lineEnd=code.indexOf('\n',literal.end);const remainder=code.slice(literal.end,lineEnd<0?code.length:lineEnd).trim();
      if (literal.value.includes('${')||remainder) unresolved.push(`${match[1]}: ${literal.value}${remainder}`); else attributes[match[1]!] = literal.value;
      continue;
    }
    const scalar = originalTail.match(/^(true|false|-?\d+(?:\.\d+)?)(?=\s|$|[,}])/);
    const scalarEnd=start+(scalar?.[0].length??0);const lineEnd=code.indexOf('\n',scalarEnd);const remainder=code.slice(scalarEnd,lineEnd<0?code.length:lineEnd).trim();
    if (scalar&&!remainder) attributes[match[1]!] = scalar[1] === 'true' ? true : scalar[1] === 'false' ? false : Number(scalar[1]);
    else unresolved.push(`${match[1]}: ${originalTail.split('\n')[0]?.trim().slice(0, 100)}`);
  }
  return { attributes, unresolved };
}
function warn(context: ExpansionContext, path: string, message: string, suffix = message) { context.builder.addWarning({ id: `warning:provider:${path}:${publicUrlText(suffix)}`, severity: 'warning', filePath: path, detectorId: 'provider-adapter', message: publicUrlText(message) }); }
function recordRange(source: string, value: string) { try { return sourceRangeFor(source, value); } catch { return { start: 0, end: source.length }; } }
const firebaseServices: Record<string, { stackId: string; type: ProviderResource['type']; port: number; name: string }> = {
  auth: { stackId: 'firebase-authentication', type: 'auth', port: 9099, name: 'Auth' }, firestore: { stackId: 'cloud-firestore', type: 'database', port: 8080, name: 'Firestore' }, storage: { stackId: 'firebase-storage', type: 'storage', port: 9199, name: 'Storage' },
  hosting: { stackId: 'firebase-hosting', type: 'other', port: 5000, name: 'Hosting' }, functions: { stackId: 'firebase', type: 'other', port: 5001, name: 'Functions' }, database: { stackId: 'firebase', type: 'database', port: 9000, name: 'Realtime Database' },
};

function scanFirebaseConfig(context: ExpansionContext, path: string, source: string, config: Record<string, unknown>) {
  const { technology, relation, evidence } = context; const rc = localPath(directoryFor(path), '.firebaserc');
  let projectIdentity: string | undefined;
  if (rc && context.sources.has(rc)) try { projectIdentity = textValue(objectValue(parseStructuredConfig(rc, context.sources.get(rc)!).projects).default) || undefined; } catch { /* warning is reported for the config itself */ }
  technology('firebase', path, 0, source.length, 'declaration', 'Firebase project configuration');
  if (Object.keys(objectValue(config.emulators)).length) {
    const range = recordRange(source, 'emulators'); const suite = addProviderResource(context, { stackId: 'firebase-emulator-suite', path, ...range, name: 'Firebase Local Emulator Suite', type: 'other', environment: 'local', project: projectIdentity, identity: `suite:${path}`, role: 'local' });
    for (const [service, raw] of Object.entries(objectValue(config.emulators))) {
      const descriptor = firebaseServices[service]; if (!descriptor || !raw || typeof raw !== 'object') continue;
      const setting = objectValue(raw); const host = textValue(setting.host) || '127.0.0.1'; const port = Number(setting.port ?? descriptor.port); const endpoint = `http://${host.includes(':') ? `[${host}]` : host}:${port}`;
      addProviderResource(context, { stackId: descriptor.stackId, path, ...recordRange(source, service), name: `${descriptor.name} Emulator · ${host}:${port}`, type: descriptor.type, environment: 'local', project: projectIdentity, endpoint, parentId: suite, role: 'local', attributes: { emulatorService: service, configured: true } });
    }
  }
  for (const [index, raw] of arrayValue(config.hosting).entries()) {
    const hosting = objectValue(raw); if (!Object.keys(hosting).length) continue; const target = textValue(hosting.target || hosting.site) || `hosting:${index}`;
    const resource = addProviderResource(context, { stackId:'firebase-hosting', path, ...recordRange(source, 'hosting'), name: `Firebase Hosting · ${target}`, type:'other', environment:'deployment', project:projectIdentity, identity:textValue(hosting.site) || undefined, role:'delivery', attributes:{ publicDirectory:textValue(hosting.public), hostingTarget:target } });
    for (const rewrite of arrayValue(hosting.rewrites).map(objectValue)) {
      const destination = textValue(rewrite.destination || rewrite.function); if (!destination) continue;
      const ev = evidence(path, 0, source.length, 'firebase-hosting-rewrite', `rewrite ${textValue(rewrite.source)} → ${destination}`);
      relation(resource, resource, 'uses-config', [ev], { sourcePath:textValue(rewrite.source), destination });
    }
  }
}

function scanTerraform(context: ExpansionContext, path: string, source: string) {
  const records: Array<{ type: string; name: string; values: Record<string, unknown>; origins: string[]; start: number; end: number; unresolved: string[] }> = [];
  if (path.endsWith('.tf.json')) {
    const data = parseStructuredConfig(path, source);
    for (const [type, resources] of Object.entries(objectValue(data.resource))) for (const [name, raw] of Object.entries(objectValue(resources))) {
      const values = objectValue(raw); const origins = arrayValue(values.origin).map(objectValue).flatMap(origin => [textValue(origin.domain_name), textValue(origin.url)]).filter(Boolean);
      records.push({ type, name, values, origins, ...recordRange(source, name), unresolved: [] });
    }
  } else {
    const blocks = staticBlocks(source);
    for (const block of blocks.filter(block => block.type === 'resource' && block.labels.length === 2)) {
      const parsed = hclValues(block.body); const origins: string[] = [];
      for (const child of staticBlocks(block.body)) {
        if (!['origin','backend'].includes(child.type)) continue; const values = hclValues(child.body).attributes;
        const type = textValue(values.type); if (child.type === 'origin' && type && type !== 'OriginUrl') continue;
        const origin = textValue(values.domain_name || values.address || values.url); if (origin) origins.push(origin);
      }
      records.push({ type: block.labels[0]!, name:block.labels[1]!, values:parsed.attributes, origins, start:block.start, end:block.end, unresolved:parsed.unresolved });
    }
  }
  for (const record of records) {
    const { type, name, values, origins, start, end } = record;
    let stackId: string | undefined;
    if (['cloudflare_dns_record','cloudflare_record'].includes(type) && values.proxied === true) stackId = 'cloudflare-cdn';
    if(type==='cloudflare_ruleset'&&values.phase==='http_request_cache_settings')stackId='cloudflare-cdn';
    if (type === 'aws_cloudfront_distribution') stackId = 'amazon-cloudfront';
    if (type === 'fastly_service_vcl') stackId = 'fastly-cdn';
    if (['google_compute_backend_bucket','google_compute_backend_service'].includes(type) && values.enable_cdn === true) stackId = 'google-cloud-cdn';
    if (type === 'bunnynet_pullzone') stackId = 'bunny-cdn';
    if (type === 'akamai_property' && ['prd_Fresca','prd_SPM','Fresca','SPM'].includes(textValue(values.product_id))) stackId = 'akamai-ion';
    if (!stackId) continue;
    const body=path.endsWith('.tf.json')?undefined:staticBlocks(source.slice(start,end)).find(block=>block.type==='resource')?.body;
    const deliverySettings=JSON.stringify(body===undefined?staticDeliverySettings(values):hclDeliverySettings(body));
    const origin = origins[0] || textValue(values.content || values.value || values.bucket || values.bucket_name) || undefined;
    const resourceId = addProviderResource(context, { stackId, path, start, end, name: `${getStack(stackId)?.name} · ${textValue(values.name) || name}`, type:'other', environment:'deployment', identity:textValue(values.id) || undefined, project:textValue(values.zone_id) || undefined, origin, role:'delivery', attributes:{ declaredResourceType:type, resourceName:name, origins, deliverySettings, cacheEnabled:typeof values.enable_cdn==='boolean'?values.enable_cdn:typeof values.cache_enabled==='boolean'?values.cache_enabled:'not-declared', enabled: values.enabled === undefined ? 'not-declared' : values.enabled === true } });
    for (const item of origins.length ? origins : origin ? [origin] : []) {
      const originId = addProviderResource(context, { stackId, path, start, end, name:`Origin · ${item}`, type:'other', environment:'deployment', endpoint:item, role:'external', attributes:{ resourceRole:'origin', originOnly:true } });
      context.relation(resourceId, originId, 'uses-config', [context.evidence(path,start,end,'cdn-origin','CDNのorigin設定')], { relationClass:'delivery-origin', origin:publicUrlText(item) });
      connectDeclaration(context,resourceId,originId,'delivery-origin','CDNが参照するOriginの宣言',path,start,end,false);
    }
    for (const unresolved of record.unresolved) warn(context,path,`IaCの式は未評価: ${unresolved}`,`${name}:${unresolved}`);
  }
}

function scanCloudFormation(context: ExpansionContext, path: string, source: string, data: Record<string, unknown>) {
  for (const [name, raw] of Object.entries(objectValue(data.Resources))) {
    const resource = objectValue(raw); if (resource.Type !== 'AWS::CloudFront::Distribution') continue;
    const config = objectValue(objectValue(resource.Properties).DistributionConfig); const range = structuredRange(path,source,['Resources',name]);
    const id = addProviderResource(context, { stackId:'amazon-cloudfront', path, ...range, name:`CloudFront · ${name}`, type:'other', environment:'deployment', role:'delivery', attributes:{ enabled:config.Enabled === undefined ? 'not-declared' : config.Enabled === true, distributionName:name,deliverySettings:JSON.stringify(staticDeliverySettings(config)) } });
    for (const[index,origin] of arrayValue(config.Origins).map(objectValue).entries()) {
      const domain = textValue(origin.DomainName); if (!domain) { warn(context,path,`CloudFront ${name} origin DomainNameの参照は未解決`); continue; }
      const target = addProviderResource(context, { stackId:'amazon-cloudfront', path, ...structuredRange(path,source,['Resources',name,'Properties','DistributionConfig','Origins',String(index),'DomainName']), name:`Origin · ${domain}`, type:'other', environment:'deployment', endpoint:domain, role:'external', attributes:{ originOnly:true } });
      context.relation(id,target,'uses-config',[context.evidence(path,range.start,range.end,'cdn-origin','CloudFront distribution origin')],{ relationClass:'delivery-origin' });
      connectDeclaration(context,id,target,'delivery-origin','CloudFrontが参照するOriginの宣言',path,range.start,range.end,false);
    }
  }
}

function addJob(context: ExpansionContext, path: string, source: string, name: string, command: string, purpose: string, suppliedRange?:{start:number;end:number},workingDirectory?:string): string {
  const project = context.owner(workingDirectory===undefined?path:workingDirectory+'/'); const packageId = project ? expandedProjectId(project) : 'project:root'; const id = scriptIdFor(packageId, `${path}:${name}`); const range = suppliedRange??recordRange(source, command);
  const ev = context.evidence(path, range.start, range.end, 'provider-command', `${name}: ${purpose}`, 'declaration');
  context.builder.addFact({ id, kind:'package-script', label:name, packageId, packageName:project?.name ?? 'Project', packagePath:workingDirectory??project?.directory ?? '.', scriptName:name, command, sourcePath:path, commandStartOffset:range.start, commandEndOffset:range.end, filePath:path, evidenceIds:[ev], metadata:{ purpose, configurationPath:path } });
  context.relation(packageId,id,'contains',[ev]); return id;
}
function scanGitlabCi(context: ExpansionContext, path: string, source: string, data: Record<string, unknown>, seen = new Set<string>(), depth = 0, jobs = new Map<string,string>(), pending: Array<{ name:string; need:string; path:string; source:string }> = [],repositoryDirectory=directoryFor(path)): void {
  if(!Object.keys(data).length)return;
  if (depth > 8 || seen.has(path)) { warn(context,path,'GitLab CI local includeの循環または深さ上限'); return; }
  const next = new Set([...seen,path]); context.technology('gitlab-ci',path,0,source.length,'declaration','GitLab CI pipeline宣言');
  if(depth===0)addProviderResource(context,{stackId:'gitlab-ci',path,start:0,end:source.length,name:'GitLab CI pipeline',type:'other',environment:'configuration',role:'deployment',attributes:{pipeline:true,stages:arrayValue(data.stages).map(textValue)}});
  for (const include of arrayValue(data.include)) {
    const value = typeof include === 'string' ? include : textValue(objectValue(include).local);
    if (!value) { warn(context,path,'remote/project/template CI includeは取得しません'); continue; }
    const target = localPath(repositoryDirectory, value.replace(/^\//,''));
    if (!target || !context.sources.has(target)) { warn(context,path,`local include未解決: ${value}`); continue; }
    try { scanGitlabCi(context,target,context.sources.get(target)!,parseStructuredConfig(target,context.sources.get(target)!),next,depth+1,jobs,pending,repositoryDirectory); } catch { warn(context,target,'CI includeを解析できませんでした'); }
  }
  for (const [name, raw] of Object.entries(data)) {
    if (name.startsWith('.')) continue; const job = objectValue(raw); if (!job.script) continue;
    const commands = arrayValue(job.script).map(textValue).filter(Boolean); if (!commands.length) continue;
    jobs.set(name,addJob(context,path,source,name,commands.join(' && '),'ci-job',structuredRange(path,source,[name,'script']),repositoryDirectory));
    const fact=context.builder.getFact(jobs.get(name)!);if(fact?.kind==='package-script'){fact.commandSourceOffsets=yamlCommandOffsets(source,name);if(fact.commandSourceOffsets){fact.commandStartOffset=fact.commandSourceOffsets[0]!;fact.commandEndOffset=fact.commandSourceOffsets.at(-1)!;}}
    if (job.rules || job.only || job.except) warn(context,path,`${name}: 実行条件は未評価`,name);
  }
  for (const [name, raw] of Object.entries(data)) {
    const from = jobs.get(name); if (!from) continue;
    for (const need of arrayValue(objectValue(raw).needs)) pending.push({name,need:typeof need==='string'?need:textValue(objectValue(need).job),path,source});
  }
  if(depth===0)for(const relation of pending){const from=jobs.get(relation.need),to=jobs.get(relation.name);if(from&&to)context.relation(from,to,'executes',[context.evidence(relation.path,0,relation.source.length,'ci-needs',`${relation.name} needs ${relation.need}`)],{relationClass:'pipeline-dependency'});else warn(context,relation.path,`CI needs対象が未解決: ${relation.need}`);}
  const server = textValue(objectValue(data.variables).CI_SERVER_URL);
  if (server) try { if (new URL(server).hostname === 'gitlab.com')addProviderResource(context,{stackId:'gitlab',path,...recordRange(source,server),name:'GitLab repository server',type:'other',environment:'repository',project:'gitlab.com',endpoint:server,role:'external',attributes:{repositoryProvider:true}}); } catch { warn(context,path,'CI_SERVER_URLは静的URLとして未解決'); }
}

function scanDeployment(context: ExpansionContext,path:string,source:string,data:Record<string,unknown>):void {
  const name=path.split('/').at(-1)!;
  if (/^(?:docker-)?compose\.ya?ml$/i.test(name)) {
    context.technology('docker-compose',path,0,source.length,'declaration','Compose services構成'); const resources = new Map<string,string>();
    for (const [service,raw] of Object.entries(objectValue(data.services))) {
      const setting=objectValue(raw); const image=textValue(setting.image); const build=typeof setting.build==='string'?setting.build:textValue(objectValue(setting.build).context);
      const buildPath=build?localPath(directoryFor(path),build):undefined;const target=buildPath?context.projects.filter(project=>project.directory===buildPath):[];
      const id=addProviderResource(context,{ stackId:'docker-compose',path,...recordRange(source,service),name:`Compose · ${service}`,type:'other',environment:'deployment',identity:`compose:${path}:${service}`,role:'deployment',attributes:{ image,buildContext:build,deploymentTargetPath:target.length===1?target[0]!.directory:undefined,ports:arrayValue(setting.ports).map(textValue),serviceName:service } });resources.set(service,id);
      const officialImage=image.replace(/^(?:docker\.io\/)?library\//,'').replace(/^docker\.io\//,'');const product=/^mariadb(?::|@|$)/.test(officialImage)?'mariadb':/^redis(?::|@|$)/.test(officialImage)?'redis':/^(?:mcr\.microsoft\.com\/mssql\/server|microsoft\/mssql-server)(?::|@|$)/.test(image)?'sql-server':/^postgres(?::|@|$)/.test(officialImage)?'postgresql':/^mysql(?::|@|$)/.test(officialImage)?'mysql':undefined;
      if(product) addProviderResource(context,{ stackId:product,path,...recordRange(source,image),name:`${getStack(product)?.name} · ${service}`,type:'database',environment:'deployment',identity:`compose:${path}:${service}`,provider:product,role:'external',attributes:{ image,serviceName:service } });
    }
    for(const[service,raw]of Object.entries(objectValue(data.services)))for(const dependency of Array.isArray(objectValue(raw).depends_on)?arrayValue(objectValue(raw).depends_on).map(textValue):Object.keys(objectValue(objectValue(raw).depends_on))) { const from=resources.get(service),to=resources.get(dependency);if(from&&to){context.relation(from,to,'depends-on',[context.evidence(path,0,source.length,'compose-dependency',`${service} depends_on ${dependency}`)],{relationClass:'deployment'});const fact=context.builder.getFact(from);if(fact)fact.metadata.deploymentDependencies=[...(Array.isArray(fact.metadata.deploymentDependencies)?fact.metadata.deploymentDependencies:[]),to];} }
  }
  if (typeof data.apiVersion==='string'&&['Deployment','StatefulSet','DaemonSet','Job','CronJob','Service','Ingress'].includes(textValue(data.kind))) {
    const metadata=objectValue(data.metadata);const resourceName=textValue(metadata.name);if(!resourceName)return;const spec=objectValue(data.spec);const pod=objectValue(objectValue(spec.template).spec);
    addProviderResource(context,{stackId:'kubernetes',path,...recordRange(source,resourceName),name:`${textValue(data.kind)} · ${resourceName}`,type:'other',environment:textValue(metadata.namespace)||'deployment',identity:`${textValue(metadata.namespace)}:${textValue(data.kind)}:${resourceName}:${path}`,role:'deployment',attributes:{apiVersion:textValue(data.apiVersion),kind:textValue(data.kind),selector:JSON.stringify(spec.selector??{}),images:arrayValue(pod.containers).map(item=>textValue(objectValue(item).image)),servicePorts:arrayValue(spec.ports).map(item=>JSON.stringify(item))}});
  }
  if (name==='netlify.toml'&&Object.keys(data).length) {const build=objectValue(data.build);addProviderResource(context,{stackId:'netlify',path,start:0,end:source.length,name:'Netlify deployment',type:'other',environment:'deployment',role:'delivery',attributes:{publish:textValue(build.publish),functions:textValue(build.functions),redirects:JSON.stringify(data.redirects??[])}});if(textValue(build.command))addJob(context,path,source,'build',textValue(build.command),'build');}
  if (/(?:^|\/)\.github\/workflows\//.test(path)) for(const[jobName,raw]of Object.entries(objectValue(data.jobs))){for(const[stepIndex,step]of arrayValue(objectValue(raw).steps).map(objectValue).entries()){if(textValue(step.uses).split('@')[0]==='actions/deploy-pages') {context.technology('github-pages',path,...Object.values(recordRange(source,textValue(step.uses))) as [number,number],'declaration','明示Pages deploy action');addJob(context,path,source,`${jobName}:${stepIndex}`,textValue(step.uses),'deploy-pages');addProviderResource(context,{stackId:'github-pages',path,...recordRange(source,textValue(step.uses)),name:`GitHub Pages · ${jobName}`,type:'other',environment:'deployment',role:'delivery',attributes:{workflowJob:jobName,deployAction:textValue(step.uses)}});}}}
}

export async function scanProviderConfigurations(context: ExpansionContext): Promise<void> {
  for (const [path,source] of context.sources) {
    try {
      if (/\.tf(?:\.json)?$/.test(path)) { scanTerraform(context,path,source);continue; }
      const name=path.split('/').at(-1)!;
      if (/\.(?:jsonc?|ya?ml|toml)$/.test(path)) {
        if(/\.ya?ml$/.test(path)&&parseAllDocuments(source).length>1)continue;
        const data=parseStructuredConfig(path,source);
        if(name==='firebase.json')scanFirebaseConfig(context,path,source,data);
        if(name==='.gitlab-ci.yml')scanGitlabCi(context,path,source,data);
        scanCloudFormation(context,path,source,data);scanDeployment(context,path,source,data);
        if(['prd_Fresca','prd_SPM','Fresca','SPM'].includes(textValue(data.productId))) {
          const behaviors=arrayValue(objectValue(data.rules).behaviors).map(objectValue);const origin=behaviors.find(item=>item.name==='origin');
          const propertyId=addProviderResource(context,{stackId:'akamai-ion',path,start:0,end:source.length,name:`Akamai Ion · ${textValue(data.propertyName)||textValue(data.propertyId)||name}`,type:'other',environment:'deployment',identity:textValue(data.propertyId)||undefined,origin:textValue(objectValue(origin?.options).hostname)||undefined,role:'delivery',attributes:{productId:textValue(data.productId),deliverySettings:JSON.stringify(staticDeliverySettings(data.rules))}});
          const hostname=textValue(objectValue(origin?.options).hostname);if(/^[a-zA-Z0-9.-]+(?::\d+)?$/.test(hostname)){const target=addProviderResource(context,{stackId:'akamai-ion',path,start:0,end:source.length,name:'Origin · '+hostname,type:'other',environment:'deployment',endpoint:hostname,role:'external',attributes:{originOnly:true}});connectDeclaration(context,propertyId,target,'delivery-origin','Ionが参照するOriginの宣言',path,0,source.length);}
        }
        if(/wrangler\.(?:jsonc?|toml)$/.test(path))for(const[environment,variant]of [['default',data],...Object.entries(objectValue(data.env))] as [string,unknown][])for(const binding of arrayValue(objectValue(variant).kv_namespaces).map(objectValue)){
          const name=textValue(binding.binding);if(!name)continue;addProviderResource(context,{stackId:'cloudflare-kv',path,...recordRange(source,name),name:`Workers KV · ${name}`,type:'database',environment,identity:textValue(binding.id)||undefined,binding:name,role:'external'});
        }
      }
      if (/^(?:nginx|httpd|apache2)\.conf$/.test(name)) {
        const stackId=name==='nginx.conf'?'nginx':'apache-http-server';const cleaned=source.replace(/^\s*#.*$/gm,'');
        const syntax=sourceSyntax(cleaned,'nginx');const values=stackId==='nginx'?[...syntax.code.matchAll(/\b(?:proxy_pass|server_name|root|upstream)\s+/g)].map(match=>cleaned.slice(match.index!+match[0].length).split(/[;{\n]/)[0]!.trim()):[...cleaned.matchAll(/^\s*(?:DocumentRoot|ProxyPass|ServerName)\s+([^\n]+)/gm)].map(match=>match[1]!.trim());
        if(values.length||stackId==='nginx'&&/\bserver\s*\{/.test(cleaned)||stackId==='apache-http-server'&&/<VirtualHost\b/.test(cleaned))addProviderResource(context,{stackId,path,start:0,end:source.length,name:getStack(stackId)!.name,type:'other',environment:'deployment',role:'delivery',attributes:{directives:values}});
      }
    } catch(error) { warn(context,path,`対応設定を解析できません: ${error instanceof Error?error.message:String(error)}`); }
  }
}

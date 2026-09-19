import { describe, expect, it } from 'vitest';
import { scanProjectFiles } from './scan';
import type { AnalyzerSourceFile } from './types';
import { cdnAsset } from './providerSourceAdapters';
import { hclValues } from './providerAdapters';
import { semanticInput } from './semantic/client';
import { maskUrlSecrets } from './urlPrivacy';

const files = (sources: Record<string,string>): AnalyzerSourceFile[] => Object.entries(sources).map(([relativePath,source])=>({relativePath,name:relativePath.split('/').at(-1)!,extension:'.'+relativePath.split('.').at(-1),size:source.length,readText:async()=>source}));
const detected=async(sources:Record<string,string>)=>(await scanProjectFiles(files(sources))).facts.filter(fact=>fact.kind==='technology').map(fact=>fact.dictionaryStackId);

describe('explicit provider adapters',()=>{
  it('resolves explicit SDK endpoints while keeping connector and server identity separate',async()=>{
    const store=await scanProjectFiles(files({'db.ts':"import {createClient} from '@supabase/supabase-js';import Redis from 'ioredis';import {createPool} from 'mariadb';const supabase=createClient('https://demo.supabase.co','public');const cache=new Redis('redis://127.0.0.1:6379');const db=createPool({host:'database',database:'app'});function fake(createClient){return createClient('https://fake.supabase.co','public');}"}));
    const resources=store.facts.filter(fact=>fact.kind==='resource');expect(resources).toHaveLength(3);
    expect(resources.find(fact=>fact.dictionaryStackId==='supabase')?.metadata).toMatchObject({endpoint:'https://demo.supabase.co',projectIdentity:'demo.supabase.co'});
    expect(resources.find(fact=>fact.dictionaryStackId==='mariadb')?.metadata).toMatchObject({serverIdentityResolved:false,provider:'mysql-compatible-unresolved'});
    expect(JSON.stringify(resources)).not.toContain('fake.supabase.co');
  });
  it('removes URL credentials from facts, identities and saved source while preserving source offsets',async()=>{
    const source='<script src="https://unpkg.com/react@19/index.js?token=SYNTHETIC_SECRET_CDN_943&version=19"></script>';
    const origin='https://SYNTHETIC_USER_943:SYNTHETIC_PASS_943@example.com/assets';
    const store=await scanProjectFiles(files({'index.html':source,'cdn.tf':`resource "bunnynet_pullzone" "assets" {\n name = "assets"\n origin {\n type = "OriginUrl"\n url = "${origin}"\n }\n}`}));
    const serialized=JSON.stringify({store,input:semanticInput(store)});
    for(const secret of ['SYNTHETIC_SECRET_CDN_943','SYNTHETIC_USER_943','SYNTHETIC_PASS_943'])expect(serialized).not.toContain(secret);
    expect(maskUrlSecrets(source)).toHaveLength(source.length);
    expect(maskUrlSecrets(source).indexOf('&version=19')).toBe(source.indexOf('&version=19'));
    expect(store.facts.filter(fact=>fact.kind==='technology').map(fact=>fact.dictionaryStackId)).toEqual(expect.arrayContaining(['unpkg','bunny-cdn']));
    expect(cdnAsset('https://unpkg.com/react@19/index.js?token=private')?.packageName).toBe('react');
  });
  it.each([
    ['cloudflare-cdn','cdn.tf','resource "cloudflare_dns_record" "web" {\n zone_id = "zone-1"\n name = "www"\n content = "origin.example.com"\n proxied = true\n}'],
    ['amazon-cloudfront','cdn.yaml','Resources:\n  Assets:\n    Type: AWS::CloudFront::Distribution\n    Properties:\n      DistributionConfig:\n        Enabled: true\n        Origins:\n          - Id: assets\n            DomainName: assets.s3.amazonaws.com\n'],
    ['fastly-cdn','cdn.tf','resource "fastly_service_vcl" "web" {\n name = "web"\n backend {\n name = "origin"\n address = "origin.example.com"\n }\n}'],
    ['google-cloud-cdn','cdn.tf','resource "google_compute_backend_bucket" "web" {\n name = "web"\n bucket_name = "assets"\n enable_cdn = true\n}'],
    ['akamai-ion','property.json','{"productId":"prd_Fresca","propertyId":"prp_1","rules":{"behaviors":[{"name":"origin","options":{"hostname":"origin.example.com"}}]}}'],
    ['bunny-cdn','cdn.tf','resource "bunnynet_pullzone" "assets" {\n name = "assets"\n origin {\n type = "OriginUrl"\n url = "https://origin.example.com"\n }\n}'],
    ['jsdelivr','index.html','<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css">'],
    ['unpkg','index.html','<script src="https://unpkg.com/react@19/umd/react.js"></script>'],
  ])('detects %s from a declared distribution or asset reference',async(stackId,path,source)=>{
    const store=await scanProjectFiles(files({'apps/web/package.json':'{"name":"web"}',[`apps/web/${path}`]:source}));
    expect(store.facts.some(fact=>fact.kind==='technology'&&fact.dictionaryStackId===stackId)).toBe(true);
    const resource=store.facts.find(fact=>fact.kind==='resource'&&fact.dictionaryStackId===stackId)!;
    expect(resource.metadata.observed).toBe(false);
    expect(store.evidence.filter(item=>resource.evidenceIds.includes(item.id)).every(item=>item.filePath===`apps/web/${path}`)).toBe(true);
    expect(store.relations.some(edge=>edge.sourceId==='package:apps/web'&&edge.targetId===resource.id&&edge.kind==='uses')).toBe(true);
    expect(store.facts.some(fact=>fact.kind==='external-package')).toBe(false);
  });
  it('rejects provider lookalikes, commented declarations, arbitrary strings and spoofed hostnames',async()=>{
    const ids=await detected({
      'wrangler.json':'{"name":"worker","main":"src/index.ts","r2_buckets":[{"binding":"BUCKET","bucket_name":"assets"}]}',
      'fake.tf':'# resource "cloudflare_dns_record" "fake" { proxied = true }\nresource "google_compute_backend_bucket" "plain" {\n enable_cdn = false\n}\nresource "cloudflare_dns_record" "dns" {\n proxied = false\n}',
      'property.json':'{"productId":"prd_Site_Defender","rules":{}}',
      'index.html':'<!-- <script src="https://unpkg.com/react"></script> --><script src="https://unpkg.com.evil.example/react"></script>',
      'example.ts':'const note="https://cdn.jsdelivr.net/npm/bootstrap@5"; // import "https://unpkg.com/react"',
    });
    for(const id of ['cloudflare-cdn','google-cloud-cdn','akamai-ion','jsdelivr','unpkg'])expect(ids).not.toContain(id);
    expect(cdnAsset('https://cdn.jsdelivr.net.evil.com/npm/react')).toBeUndefined();
    expect(cdnAsset('https://unpkg.com/@scope/name@1.2.3/file.js')?.packageName).toBe('@scope/name');
    expect(cdnAsset('https://cdn.jsdelivr.net/gh/example/repo/file.js')?.packageName).toBeUndefined();
  });
  it('keeps HCL interpolation and references unresolved and reads literals around comments',()=>{
    const result=hclValues('proxied = true\nname = "hello { world }" # comment\ncontent = var.origin\nzone_id = "${var.zone}"');
    expect(result.attributes).toMatchObject({proxied:true,name:'hello { world }'});expect(result.attributes).not.toHaveProperty('content');expect(result.attributes).not.toHaveProperty('zone_id');expect(result.unresolved).toHaveLength(2);
  });
  it('does not accept computed HCL booleans or import scripts inside HTML comments',async()=>{
    expect(hclValues('proxied = true && var.enabled').attributes).not.toHaveProperty('proxied');
    const ids=await detected({'cdn.tf':'resource "cloudflare_dns_record" "web" {\n proxied = true && var.enabled\n}', 'index.html':'<!-- <script type="module">import "https://unpkg.com/react@19";</script> -->'});
    expect(ids).not.toContain('cloudflare-cdn');expect(ids).not.toContain('unpkg');
  });
  it('preserves imported API and instance lexical identities under shadowing',async()=>{
    const store=await scanProjectFiles(files({'app.ts':`import {initializeApp}from'firebase/app';import{getAuth,connectAuthEmulator as connectLocal}from'firebase/auth';const app=initializeApp({projectId:'demo'});const auth=getAuth(app);function invoke(connectLocal){connectLocal(auth,'http://127.0.0.1:9099');} function other(auth){connectLocal(auth,'http://127.0.0.1:9098');}` }));
    const auth=store.facts.find(fact=>fact.kind==='resource'&&fact.dictionaryStackId==='firebase-authentication')!;
    expect(auth.metadata.environment).toBe('cloud');expect(store.facts.some(fact=>fact.kind==='technology'&&fact.dictionaryStackId==='firebase-emulator-suite')).toBe(false);
  });
  it('separates Auth local from Firestore cloud and recognizes imported aliases only',async()=>{
    const store=await scanProjectFiles(files({'package.json':'{"name":"app","dependencies":{"firebase":"12"}}','src/app.ts':`
      import { initializeApp } from 'firebase/app';
      import { getAuth, connectAuthEmulator as connectLocal } from 'firebase/auth';
      import { getFirestore } from 'firebase/firestore';
      const app = initializeApp({ projectId: 'demo-app' });
      const auth = getAuth(app); const db = getFirestore(app);
      connectLocal(auth, 'http://127.0.0.1:9099');
      function connectFirestoreEmulator() {} connectFirestoreEmulator();
    `}));
    const resources=store.facts.filter(fact=>fact.kind==='resource');
    expect(resources.find(fact=>fact.dictionaryStackId==='firebase-authentication')).toMatchObject({metadata:{environment:'local',endpoint:'http://127.0.0.1:9099'}});
    expect(resources.find(fact=>fact.dictionaryStackId==='cloud-firestore')).toMatchObject({metadata:{environment:'cloud',projectIdentity:'demo-app'}});
    expect(resources.filter(fact=>fact.dictionaryStackId==='cloud-firestore')).toHaveLength(1);
    expect(resources.some(fact=>fact.dictionaryStackId==='firebase-emulator-suite')).toBe(true);
    const ids=await detected({'package.json':'{"dependencies":{"firebase-tools":"14"}}','fake.ts':'function connectAuthEmulator(a,b){} connectAuthEmulator(auth,"http://localhost:9099");'});
    expect(ids).not.toContain('firebase-emulator-suite');
  });
  it('keeps Suite and individual configured endpoints local without claiming a running process',async()=>{
    const store=await scanProjectFiles(files({'firebase.json':'{"emulators":{"auth":{"port":9099},"firestore":{"port":8080},"storage":{"port":9199}},"hosting":{"public":"dist","target":"site"}}','.firebaserc':'{"projects":{"default":"demo-app"}}'}));
    const suite=store.facts.find(fact=>fact.kind==='resource'&&fact.dictionaryStackId==='firebase-emulator-suite')!;
    expect(suite.metadata.environment).toBe('local');
    expect(store.relations.filter(edge=>edge.sourceId===suite.id&&edge.kind==='contains')).toHaveLength(3);
    expect(store.facts.filter(fact=>fact.kind==='resource'&&fact.metadata.configurationOccurrence).every(fact=>fact.metadata.observed===false)).toBe(true);
    expect(store.facts.some(fact=>fact.kind==='technology'&&fact.dictionaryStackId==='firebase-hosting')).toBe(true);
  });
  it('reads CI jobs and bounded local includes without inventing workspace members',async()=>{
    const store=await scanProjectFiles(files({'.gitlab-ci.yml':'include:\n  - local: ci/test.yml\n  - local: ../outside.yml\nstages: [test, deploy]\ndeploy:\n  script: echo deploy\n  needs: [test]\n','ci/test.yml':'include:\n - local: .gitlab-ci.yml\ntest:\n script: pytest\n'}));
    expect(store.facts.filter(fact=>fact.kind==='package-script').map(fact=>fact.scriptName).sort()).toEqual(['deploy','test']);
    expect(store.facts.some(fact=>fact.kind==='workspace-pattern')).toBe(false);
    expect(store.facts.some(fact=>fact.kind==='technology'&&fact.dictionaryStackId==='gitlab')).toBe(false);
    expect(store.warnings.some(warning=>warning.message.includes('循環'))).toBe(true);
    expect(store.warnings.some(warning=>warning.message.includes('outside'))).toBe(true);
    const jobs=store.facts.filter(fact=>fact.kind==='package-script');const test=jobs.find(job=>job.scriptName==='test')!,deploy=jobs.find(job=>job.scriptName==='deploy')!;
    expect(store.relations.some(edge=>edge.sourceId===test.id&&edge.targetId===deploy.id&&edge.metadata.relationClass==='pipeline-dependency')).toBe(true);
  });
});

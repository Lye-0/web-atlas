// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { analyzeSemanticSources } from './analyze';
import { initializeTestParser, testLanguage, testParser } from './testRuntime';
import { scanProjectFiles } from '../scan';
import { semanticInput } from './client';
import type { AnalyzerSourceFile } from '../types';
import { projectSemanticView } from './project';
import { representativeSources } from '../fixtures/stack-coverage/representative';

beforeAll(initializeTestParser);
const analyze=async(sources:Record<string,string>)=>{
  const files:AnalyzerSourceFile[]=Object.entries(sources).map(([relativePath,source])=>({relativePath,name:relativePath.split('/').at(-1)!,extension:'.'+relativePath.split('.').at(-1),size:source.length,readText:async()=>source}));
  const store=await scanProjectFiles(files);const input=semanticInput(store);return{store,input,analysis:await analyzeSemanticSources(input,testLanguage,undefined,testParser)};
};

describe('dedicated stack semantic primitives',()=>{
  it('retains the Nuxt server callback implicit response separately from the wrapper factory result',async()=>{
    const path='server/api/users.get.ts';const source="export default defineEventHandler(()=>({name:'Alice'}));";const{analysis}=await analyze({'package.json':'{"dependencies":{"nuxt":"4"}}',[path]:source});const entry=analysis.nodes.find(node=>node.kind==='entry'&&node.attributes.endpoint==='/api/users')!;const handle=analysis.edges.find(edge=>edge.source===entry.id&&edge.kind==='handles')!;expect(handle).toBeDefined();const returned=projectSemanticView(analysis,'data-flow').nodes.find(node=>node.path===path&&node.data?.role==='return'&&node.attributes.owner===handle.target);expect(returned).toBeDefined();expect(analysis.edges.some(edge=>edge.kind==='returns'&&edge.target===returned!.id)).toBe(true);
  });
  it('uses Bootstrap only along the HTML script/module loading path',async()=>{
    const sources={'package.json':'{"dependencies":{"bootstrap":"5"}}','style.ts':"import 'bootstrap/dist/css/bootstrap.css';",'main.ts':"import './style';",'index.html':'<script type="module" src="./main.ts"></script><button class="btn">Save</button>','other.html':'<button class="btn">Other</button>'};const{analysis}=await analyze(sources);const uses=analysis.edges.filter(edge=>edge.kind==='uses-style');expect(uses).toHaveLength(1);expect(analysis.nodes.find(node=>node.id===uses[0]!.source)?.path).toBe('index.html');expect(uses[0]!.evidence.map(at=>at.path)).toEqual(expect.arrayContaining(['index.html','main.ts','style.ts']));
    const isolated=await analyze({...sources,'index.html':'<button class="btn">Save</button>'});expect(isolated.analysis.edges.some(edge=>edge.kind==='uses-style')).toBe(false);
  });
  it('enriches each distinct MUI JSX event once and retains two distinct attributes',async()=>{
    const{analysis}=await analyze({'package.json':'{"dependencies":{"@mui/material":"7"}}','App.tsx':"import Button from '@mui/material/Button';function save(){}export function App(){return <><Button onClick={save}/><Button onClick={save}/></>}"});const entries=analysis.nodes.filter(node=>node.kind==='entry'&&node.attributes.event==='onClick');expect(entries).toHaveLength(2);expect(new Set(entries.map(node=>node.evidence[0]!.start)).size).toBe(2);for(const entry of entries)expect(analysis.edges.filter(edge=>edge.source===entry.id&&edge.kind==='handles')).toHaveLength(1);
  });
  it('connects Vue root state declaration to v-model without using a use-site as its declaration',async()=>{
    const{analysis}=await analyze({'App.vue':'<script setup lang="ts">import{ref}from"vue";const count=ref(0);function change(){return count.value;}</script><template><input v-model="count"></template>'});const binding=analysis.nodes.find(node=>node.attributes.binding&&node.label==='count')!;const links=analysis.edges.filter(edge=>edge.target===binding.id&&edge.kind==='binds-value');expect(links).toHaveLength(1);expect(analysis.nodes.find(node=>node.id===links[0]!.source)?.data?.role).toBe('declaration');
  });
  it.each([false,true])('keeps WPF Binding source unresolved unless DataContext=this is explicit: %s',async(explicit)=>{
    const{analysis}=await analyze({'app.csproj':'<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><UseWPF>true</UseWPF></PropertyGroup></Project>','MainWindow.xaml':'<Window x:Class="App.MainWindow"><TextBlock Text="{Binding Title}"/></Window>','MainWindow.xaml.cs':`namespace App{class MainWindow{public string Title{get;set;}public MainWindow(){${explicit?'this.DataContext=this;':''}}}}`});const binding=analysis.nodes.find(node=>node.attributes.binding&&node.label==='Title')!;expect(analysis.edges.some(edge=>edge.target===binding.id&&edge.kind==='binds-value')).toBe(explicit);if(!explicit)expect(binding.data?.resolution).toBe('unresolved');
  });
  it('preserves server method and canonical paths while replacing generic file-route candidates',async()=>{
    const{analysis}=await analyze({'package.json':'{"dependencies":{"@sveltejs/kit":"2"}}','src/routes/+server.ts':'export function GET(){return Response.json({name:"Alice"});}export function POST(){return Response.json({ok:true});}'});const entries=analysis.nodes.filter(node=>node.kind==='entry'&&node.attributes.fileRoute);expect(entries.map(node=>node.attributes.method).sort()).toEqual(['GET','POST']);expect(analysis.nodes.filter(node=>node.kind==='entry'&&node.attributes.endpoint).every(node=>node.attributes.endpoint==='/')).toBe(true);
  });
  it('does not treat SWR data methods or nested Redux action payloads as cache invalidation/dispatch',async()=>{
    const{analysis}=await analyze({'swr.ts':"import useSWR from'swr';function useData(){const{data,mutate:refresh}=useSWR('/api',fetch);data?.map(x=>x);refresh();return data;}",'redux.ts':"import{createSlice,configureStore}from'@reduxjs/toolkit';const active=createSlice({name:'active',initialState:{value:0},reducers:{increment(state){state.value++;}}});const unused=createSlice({name:'unused',initialState:{ghost:0},reducers:{increment(state){state.ghost++;}}});const store=configureStore({reducer:{active:active.reducer,unused:unused.reducer}});store.dispatch(active.actions.increment(unused.actions.increment(1)));"});
    const invalidation=analysis.edges.filter(edge=>edge.kind==='invalidates-cache');expect(invalidation).toHaveLength(1);expect(analysis.nodes.find(node=>node.id===invalidation[0]!.source)?.attributes.callee).toBe('refresh');const dispatched=analysis.edges.filter(edge=>edge.kind==='dispatches-action');expect(dispatched).toHaveLength(1);expect(analysis.nodes.find(node=>node.id===dispatched[0]!.target)?.evidence.some(at=>at.start<280)).toBe(true);
  });
  it('respects qualified EF context types and explicit IsRequired(false)',async()=>{
    const{analysis}=await analyze({'app.csproj':'<Project Sdk="Microsoft.NET.Sdk"><ItemGroup><PackageReference Include="Microsoft.EntityFrameworkCore" Version="10"/></ItemGroup></Project>','Real.cs':'using Microsoft.EntityFrameworkCore;namespace Real{class User{public string Name{get;set;}}class AppDb:DbContext{public DbSet<User> Users{get;set;}protected void Configure(ModelBuilder builder){builder.Entity<User>().Property(x=>x.Name).IsRequired(false);}}}','Fake.cs':'namespace Fake{class AppDb{public void SaveChanges(){}}}','Run.cs':'class Service{public void Run(Fake.AppDb db){db.SaveChanges();}}'});
    const user=analysis.nodes.find(node=>node.kind==='model'&&node.label==='User')!;expect(user.fields?.find(field=>field.name==='Name')).toMatchObject({optional:true,nullable:true});expect(analysis.nodes.some(node=>node.path==='Run.cs'&&node.kind==='operation'&&node.attributes.dictionaryStackId==='entity-framework-core')).toBe(false);
  });
  it('does not dispatch into a reducer that was never registered in that Redux store',async()=>{
    const{analysis}=await analyze({'store.ts':"import{createSlice,configureStore}from'@reduxjs/toolkit';const active=createSlice({name:'active',initialState:{count:0},reducers:{increment(state){state.count++;}}});const unused=createSlice({name:'unused',initialState:{ghost:0},reducers:{haunt(state){state.ghost++;}}});const store=configureStore({reducer:{active:active.reducer}});function click(){store.dispatch(unused.actions.haunt());}"});expect(analysis.edges.some(edge=>edge.kind==='dispatches-action')).toBe(false);
  });
  it.each([['redux-toolkit',"import{createSlice,configureStore}from'@reduxjs/toolkit';const slice=createSlice({name:'counter',initialState:{count:0},reducers:{increment(state){state.count++;}}});const store=configureStore({reducer:{counter:slice.reducer}});function click(){store.dispatch(slice.actions.increment());}"],['pinia',"import{defineStore}from'pinia';const useCounter=defineStore('counter',{state:()=>({count:0}),actions:{increment(){this.count++;}}});const counter=useCounter();function click(){counter.increment();}"]])('connects %s bound actions to their state fields',async(stackId,source)=>{
    const{analysis}=await analyze({'store.ts':source});const state=analysis.nodes.find(node=>node.kind==='model'&&node.attributes.dictionaryStackId===stackId&&node.fields?.some(field=>field.name==='count'))!;expect(state).toBeDefined();expect(analysis.edges.some(edge=>edge.kind==='dispatches-action')).toBe(true);expect(analysis.edges.some(edge=>edge.kind==='updates-state'&&edge.target===state.id)).toBe(true);
  });
  it('connects SWR key/fetcher/result type and bound mutate to the originating cache request',async()=>{
    const{analysis}=await analyze({'store.ts':"import useSWR from'swr';interface User{name:string;}async function fetcher(url:string){return fetch(url).then(response=>response.json());}function useUsers(){const{data,mutate}=useSWR<User[]>('/api/users',fetcher);mutate();return data;}"});expect(analysis.edges.some(edge=>edge.kind==='fetcher')).toBe(true);expect(analysis.edges.some(edge=>edge.kind==='declared-result-shape')).toBe(true);expect(analysis.edges.some(edge=>edge.kind==='invalidates-cache')).toBe(true);
  });
  it('connects EF Core DbSet, Fluent fields and typed-context writes while retaining unrelated lookalikes',async()=>{
    const{analysis}=await analyze({'app.csproj':'<Project Sdk="Microsoft.NET.Sdk"><ItemGroup><PackageReference Include="Microsoft.EntityFrameworkCore" Version="10"/></ItemGroup></Project>','db.cs':'using Microsoft.EntityFrameworkCore; class User{public string Name {get;set;}}class AppDb:DbContext{public DbSet<User> Users {get;set;}protected override void OnModelCreating(ModelBuilder builder){builder.Entity<User>().Property(user=>user.Name).HasMaxLength(80).IsRequired();}}class Service{public void Save(AppDb db,User user){db.Users.Add(user);db.SaveChanges();}public void Fake(Other db){db.SaveChanges();}}'});
    const user=analysis.nodes.find(node=>node.kind==='model'&&node.label==='User')!;expect(user.fields?.find(field=>field.name==='Name')?.constraints).toContain('max_length=80');expect(analysis.edges.some(edge=>edge.kind==='entity-set'&&edge.target===user.id)).toBe(true);expect(analysis.edges.some(edge=>edge.kind==='writes-model'&&edge.target===user.id)).toBe(true);
    const fake=analysis.nodes.find(node=>node.kind==='function'&&node.attributes.name==='Fake')!;expect(analysis.nodes.some(node=>node.kind==='operation'&&node.attributes.dictionaryStackId==='entity-framework-core'&&node.evidence.some(at=>at.start>=fake.evidence[0]!.start&&at.end<=fake.evidence[0]!.end))).toBe(false);
  });
  it('selects each Supabase resource by its bound source instance in a shared scope',async()=>{
    const{analysis}=await analyze({'db.ts':"import{createClient}from'@supabase/supabase-js';const first=createClient('https://first.supabase.co','public');const second=createClient('https://second.supabase.co','public');function one(){return first.from('users').select();}function two(){return second.from('users').select();}"});
    for(const name of ['first','second']){const operations=analysis.nodes.filter(node=>node.kind==='operation'&&String(node.attributes.callee).startsWith(name+'.'));const edges=analysis.edges.filter(edge=>operations.some(node=>node.id===edge.source)&&edge.kind==='uses-resource');expect(edges.length).toBeGreaterThan(0);expect(edges.every(edge=>String(analysis.nodes.find(node=>node.id===edge.target)?.attributes.endpoint).includes(`${name}.supabase.co`))).toBe(true);}
  });
  it.each([['express',"import express,{Router}from'express';const app=express(),router=Router();app.use('/v1',router);app.use('/v2',router);router.get('/users',users);"],['fastify',"import fastify from'fastify';const app=fastify();function routes(instance){instance.get('/users',users);}app.register(routes,{prefix:'/v1'});app.register(routes,{prefix:'/v2'});"]])('preserves both %s mount contexts and removes the unmounted generic route',async(stackId,registration)=>{
    const{analysis}=await analyze({'api.ts':registration+'function users(){return 1;}'});const endpoints=analysis.nodes.filter(node=>node.kind==='entry'&&node.attributes.endpoint).map(node=>node.attributes.endpoint);expect(endpoints).toEqual(expect.arrayContaining(['/v1/users','/v2/users']));expect(endpoints).not.toContain('/users');expect(analysis.nodes.filter(node=>node.attributes.dictionaryStackId===stackId&&node.attributes.endpoint)).toHaveLength(2);
  });
  it('does not publish an unregistered Fastify plugin or a Nest method without a verified Controller',async()=>{
    const{analysis}=await analyze({'api.ts':"import fastify from'fastify';function routes(instance){instance.get('/ghost',users);}function users(){}",'controller.ts':"import {Get}from'@nestjs/common';class Api{@Get('/ghost')users(){return 1;}}",'web.ts':"export function fetchGhost(){return fetch('/ghost');}"});expect(analysis.nodes.some(node=>node.kind==='entry'&&node.attributes.endpoint==='/ghost')).toBe(false);expect(analysis.edges.some(edge=>edge.kind==='http')).toBe(false);
  });
  it('reconciles aliased Nest decorator source spans with the generic route candidate',async()=>{
    const{analysis}=await analyze({'api.ts':"import {Controller as RouteGroup,Get as HttpGet}from'@nestjs/common';@RouteGroup('a')class Api{@HttpGet('users')users(){return 1;}}"});expect(analysis.nodes.filter(node=>node.kind==='entry'&&node.attributes.endpoint).map(node=>node.attributes.endpoint)).toEqual(['/a/users']);
  });
  it('resolves auth model type symbols and imported aliases without escaping a generic type parameter',async()=>{
    const{analysis}=await analyze({'model.ts':'export interface Session {userId:string;}','auth.ts':"import{auth}from'@clerk/nextjs/server';import type{Session as LoginSession}from'./model';interface Session{ghost:string;}async function known(){const value:LoginSession=await auth();return value;}async function unknown<Session>(){const value:Session=await auth();return value;}"});
    const edges=analysis.edges.filter(edge=>edge.kind==='produces-shape');expect(edges).toHaveLength(1);expect(analysis.nodes.find(node=>node.id===edges[0]!.target)).toMatchObject({path:'model.ts',label:'Session'});
  });
  it('does not bind a shadowed router handler parameter to a same-name outer function',async()=>{
    const{analysis}=await analyze({'api.ts':"import express,{Router}from'express';const app=express(),router=Router();app.use('/api',router);function users(){}function configure(users){router.get('/users',users);}"});
    const entry=analysis.nodes.find(node=>node.attributes.dictionaryStackId==='express'&&node.attributes.endpoint==='/api/users')!;expect(entry.confidence).toBe('unresolved');expect(analysis.edges.some(edge=>edge.source===entry.id&&edge.kind==='handles')).toBe(false);
  });
  it.each([['express',"import express,{Router} from 'express'; const app=express();const router=Router();app.use('/api',router);router.get('/users',users);"],['fastify',"import fastify from 'fastify';const app=fastify();app.register(function routes(instance){instance.get('/users',users);},{prefix:'/api'});"]])('resolves %s static mount/prefix to handler and direct processing',async(stackId,registration)=>{
    const{analysis}=await analyze({'api.ts':registration+' function load(){return {name:"Alice"};} function users(){return load();}'});const entry=analysis.nodes.find(node=>node.attributes.dictionaryStackId===stackId&&node.attributes.endpoint==='/api/users')!;const users=analysis.nodes.find(node=>node.attributes.name==='users'&&node.kind==='function')!;expect(entry).toBeDefined();expect(analysis.edges.some(edge=>edge.source===entry.id&&edge.target===users.id&&edge.kind==='handles')).toBe(true);expect(analysis.edges.some(edge=>edge.source===users.id&&edge.kind==='calls')).toBe(true);
  });
  it('binds NestJS Controller method decorators to typed handlers and their application model',async()=>{
    const{analysis}=await analyze({'api.ts':"import {Controller,Get} from '@nestjs/common';interface User{name:string;} @Controller('api') export class Api { @Get('users') users():User{return this.load();} load():User{return {name:'Alice'};} }"});const entry=analysis.nodes.find(node=>node.attributes.dictionaryStackId==='nestjs'&&node.attributes.endpoint==='/api/users')!;expect(entry).toBeDefined();const users=analysis.nodes.find(node=>node.attributes.className==='Api'&&node.attributes.name==='users')!;expect(analysis.edges.some(edge=>edge.source===entry.id&&edge.target===users.id&&edge.kind==='handles')).toBe(true);expect(projectSemanticView(analysis,'data-model').nodes.find(node=>node.label==='User')?.fields?.[0]?.name).toBe('name');
  });
  it('replaces only resolved Firebase Auth callsites and retains a separate unknown instance request',async()=>{
    const{analysis}=await analyze({'auth.ts':"import {initializeApp} from 'firebase/app';import {getAuth,connectAuthEmulator as local} from 'firebase/auth';const app=initializeApp({projectId:'demo'});const auth=getAuth(app);local(auth,'http://localhost:9099');function other(unknownApp){return getAuth(unknownApp);}"});
    const unknown=analysis.architecture!.nodes.filter(node=>node.architecture?.request?.kind==='auth');expect(unknown).toHaveLength(1);expect(unknown[0]!.architecture!.request!.expression).toContain('getAuth(unknownApp)');expect(unknown[0]!.architecture!.request!.expression).not.toContain('getAuth(app)');
  });
  it.each([['clerk',"import {auth} from '@clerk/nextjs/server';",'auth()'],['auth0',"import {Auth0Client} from '@auth0/nextjs-auth0/server'; const client=new Auth0Client();",'client.getSession()']])('keeps %s application Session fields and explicit auth output without inventing a branded model',async(stackId,imports,call)=>{
    const{analysis}=await analyze({'auth.ts':`${imports} interface Session {userId:string; expiresAt:number;} export async function current(){const session:Session=await ${call};return session;}`});
    const session=analysis.nodes.find(node=>node.kind==='model'&&node.label==='Session')!;expect(session.fields?.map(field=>field.name)).toEqual(['userId','expiresAt']);expect(session.attributes.dictionaryStackId).toBeUndefined();
    expect(analysis.edges.some(edge=>edge.kind==='produces-shape'&&edge.target===session.id&&analysis.nodes.find(node=>node.id===edge.source)?.attributes.dictionaryStackId===stackId)).toBe(true);
    expect(projectSemanticView(analysis,'data-model').nodes.some(node=>node.id===session.id)).toBe(true);
  });
  it('tracks chained Supabase calls and leaves a shadowed client unattributed',async()=>{
    const{analysis}=await analyze({'data.ts':"import {createClient} from '@supabase/supabase-js'; const client=createClient('https://project.supabase.co','public'); interface UserInput{name:string;} export async function save(input:UserInput){return client.from('users').insert(input).select();} function fake(client){return client.from('fake').insert({ghost:1});}"});
    const ops=analysis.nodes.filter(node=>node.kind==='operation'&&node.attributes.dictionaryStackId==='supabase');expect(ops.map(node=>node.attributes.callee)).toEqual(expect.arrayContaining(["client.from('users').insert"]));expect(ops.some(node=>node.evidence.some(item=>analysis.nodes.find(fn=>fn.attributes.name==='fake')?.evidence.some(range=>item.start>=range.start&&item.end<=range.end)))).toBe(false);
    expect(analysis.edges.some(edge=>edge.kind==='accepts-shape')).toBe(true);
  });
  it('assigns non-npm implementation groups to their declared app after common architecture discovery',async()=>{
    const{analysis}=await analyze(representativeSources);const model=analysis.architecture!;const api=model.nodes.find(node=>node.label==='api'&&node.architecture?.kind==='application')!;
    const components=model.nodes.filter(node=>node.architecture?.kind==='component'&&node.architecture.files.some(path=>path.startsWith('services/api/')));
    expect(components.length).toBeGreaterThan(0);expect(components.every(node=>node.architecture?.parentId===api.id)).toBe(true);
    const root=model.nodes.find(node=>node.label==='expansion-fixture')!;expect(root.architecture?.files.some(path=>path.startsWith('services/api/'))).toBe(false);
  });
  it('keeps two Python projects with the same API role in separate architecture owners',async()=>{
    const{analysis}=await analyze({'package.json':'{"name":"root"}','services/a/pyproject.toml':'[project]\nname="a"\ndependencies=["fastapi"]','services/b/pyproject.toml':'[project]\nname="b"\ndependencies=["fastapi"]','services/a/main.py':"from fastapi import FastAPI\napp=FastAPI()\n@app.get('/a')\ndef load(): return 1",'services/b/main.py':"from fastapi import FastAPI\napp=FastAPI()\n@app.get('/b')\ndef load(): return 2"});
    const model=analysis.architecture!;for(const name of ['a','b']){const unit=model.nodes.find(node=>node.label===name&&node.architecture?.kind==='application')!;const components=model.nodes.filter(node=>node.architecture?.kind==='component'&&node.architecture.files.includes(`services/${name}/main.py`));expect(components.length).toBeGreaterThan(0);expect(components.every(node=>node.architecture?.parentId===unit.id)).toBe(true);expect(unit.architecture?.files).toEqual([`services/${name}/main.py`]);}
  });
  it('does not brand Python models from comments, field strings or unimported base names',async()=>{
    const{analysis}=await analyze({'pyproject.toml':'[project]\nname="api"\ndependencies=["pydantic","sqlalchemy"]','app.py':'class Plain:\n note: str = "BaseModel"\nclass Notes:\n text: str = "Mapped"\nclass BaseModel: pass\nclass Other(BaseModel):\n value: str\n'});
    const projected=projectSemanticView(analysis,'data-model');
    expect(projected.nodes.some(node=>['pydantic','sqlalchemy'].includes(String(node.attributes.dictionaryStackId)))).toBe(false);
  });
  it.each([['vue','App.vue','// defineProps<{ghost: string}>()\nconst props=defineProps<{title: string}>();'],['svelte','App.svelte','// export let ghost: string;\nexport let title: string;']])('ignores %s comment props and preserves the live declaration range',async(stackId,path,script)=>{
    const source=`<script lang="ts" setup>\n${script}\n</script><button>Save</button>`;const{analysis}=await analyze({[path]:source});
    const fields=analysis.nodes.filter(node=>node.kind==='model'&&node.attributes.dictionaryStackId===stackId).flatMap(node=>node.fields??[]);
    expect(fields.map(field=>field.name)).toContain('title');expect(fields.map(field=>field.name)).not.toContain('ghost');
    const range=fields.find(field=>field.name==='title')!.evidence![0]!;expect(source.slice(range.start,range.end)).toContain('title');
  });
  it('does not attach an Angular templateUrl lookalike without a bound Component decorator',async()=>{
    const{analysis}=await analyze({'package.json':'{"dependencies":{"@angular/core":"20"}}','app.ts':"const example={templateUrl:'./fake.html'};function save(){}",'fake.html':'<button (click)="save()">Save</button>'});
    expect(analysis.nodes.some(node=>node.path==='fake.html'&&node.attributes.dictionaryStackId==='angular')).toBe(false);
  });
  it('leaves mismatching WPF x:Class handlers unresolved even for a same-name sibling',async()=>{
    const{analysis}=await analyze({'app.csproj':'<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><UseWPF>true</UseWPF></PropertyGroup></Project>','MainWindow.xaml':'<Window x:Class="App.OtherWindow"><Button Click="Save" /></Window>','MainWindow.xaml.cs':'namespace App { public partial class MainWindow { public void Save(){} } }'});
    const event=analysis.nodes.find(node=>node.attributes.event==='Click')!;expect(event.confidence).toBe('unresolved');expect(analysis.edges.some(edge=>edge.source===event.id&&edge.kind==='handles')).toBe(false);
  });
  it.each([
    ['vue','App.vue',`<script setup lang="ts">\nimport { ref } from 'vue';\nconst count = ref(0);\nconst props = defineProps<{title: string}>();\nfunction save() { count.value++; }\n</script>\n<template><button @click="save">Save</button><input v-model="count"></template>`,'click'],
    ['svelte','App.svelte',`<script lang="ts">\nexport let title: string;\nlet count = $state(0);\nfunction save() { count++; }\n</script>\n<button onclick={save}>Save</button><input bind:value={count}>`,'click'],
  ])('connects %s template events and props/state with original positions',async(stackId,path,source)=>{
    const{analysis}=await analyze({[path]:source});const event=analysis.nodes.find(node=>node.kind==='entry'&&node.attributes.event==='click')!;
    const handler=analysis.nodes.find(node=>node.kind==='function'&&node.attributes.name==='save')!;
    expect(event.attributes.dictionaryStackId).toBe(stackId);expect(analysis.edges.some(edge=>edge.source===event.id&&edge.target===handler.id&&edge.kind==='handles')).toBe(true);
    expect(source.slice(event.evidence[0]!.start,event.evidence[0]!.end)).toMatch(/(?:@click|onclick)/);
    expect(analysis.nodes.filter(node=>node.kind==='model').flatMap(node=>node.fields??[]).map(field=>field.name)).toEqual(expect.arrayContaining(['title','count']));
    expect(analysis.edges.some(edge=>edge.kind==='template-binding')).toBe(true);
  });
  it('maps WPF x:Class, Click and Binding into code-behind without creating a production emulator',async()=>{
    const{analysis}=await analyze({'app.csproj':'<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><UseWPF>true</UseWPF><OutputType>WinExe</OutputType><TargetFramework>net10.0-windows</TargetFramework></PropertyGroup></Project>','MainWindow.xaml':'<Window x:Class="App.MainWindow" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"><Button Click="Save" Content="{Binding Name}" /></Window>','MainWindow.xaml.cs':'namespace App { public partial class MainWindow { public string Name {get;set;} public void Save(){ Persist(); } public void Persist(){} } }'});
    const entry=analysis.nodes.find(node=>node.attributes.event==='Click')!;const save=analysis.nodes.find(node=>node.kind==='function'&&node.attributes.name==='Save')!;
    expect(analysis.edges.some(edge=>edge.source===entry.id&&edge.target===save.id&&edge.kind==='handles')).toBe(true);expect(analysis.edges.some(edge=>edge.kind==='template-binding')).toBe(true);
    expect(analysis.architecture?.nodes.some(node=>node.architecture?.kind==='application'&&node.label==='app')).toBe(true);
  });
  it.each([false,true])('maps Angular %s inline/external templates and typed fields',async(inline)=>{
    const template='<button (click)="save()">Save</button><input [value]="name">';const source=`import {Component, Input} from '@angular/core';\n@Component({selector:'app-test',${inline?`template: '${template}'`:`templateUrl: './app.html'`}})\nexport class App { @Input() name: string = ''; save() { this.persist(); } persist() {} }`;
    const{analysis}=await analyze({'package.json':'{"dependencies":{"@angular/core":"20"}}','app.ts':source,...(inline?{}:{'app.html':template})});
    const event=analysis.nodes.find(node=>node.attributes.event==='click')!;const save=analysis.nodes.find(node=>node.kind==='function'&&node.attributes.name==='save')!;
    expect(event).toBeDefined();expect(analysis.edges.some(edge=>edge.source===event.id&&edge.target===save.id&&edge.kind==='handles')).toBe(true);
    expect(analysis.nodes.find(node=>node.kind==='model'&&node.label==='App')?.fields?.some(field=>field.name==='name')).toBe(true);
  });
  it('connects imported MUI/Radix components to props/events and leaves lookalikes unattributed',async()=>{
    const{analysis}=await analyze({'App.tsx':`import Button from '@mui/material/Button'; import * as Dialog from '@radix-ui/react-dialog'; function save(){ return 1; } export function App(){return <Dialog.Root><Button onClick={save} disabled={false}>Save</Button></Dialog.Root>}`,'fake.tsx':'function save(){} function Button(){} export const x=<Button onClick={save}/>;'});
    expect(analysis.nodes.some(node=>node.attributes.component&&node.attributes.dictionaryStackId==='mui')).toBe(true);expect(analysis.nodes.some(node=>node.attributes.component&&node.attributes.dictionaryStackId==='radix-ui')).toBe(true);
    expect(analysis.nodes.some(node=>node.path==='fake.tsx'&&node.attributes.dictionaryStackId==='mui')).toBe(false);expect(analysis.edges.some(edge=>edge.kind==='component-prop')).toBe(true);
  });
  it('connects Express handler registration and real calls, with no product inference from get alone',async()=>{
    const{analysis}=await analyze({'api.ts':`import express from 'express'; const app=express(); function load(){return {id:1};} function users(){return load();} app.get('/users',users);`,'fake.ts':'const fake={get(path,handler){}}; function nope(){} fake.get("/fake",nope);'});
    const entry=analysis.nodes.find(node=>node.attributes.dictionaryStackId==='express'&&node.attributes.endpoint==='/users')!;const users=analysis.nodes.find(node=>node.kind==='function'&&node.attributes.name==='users')!;
    expect(analysis.edges.some(edge=>edge.source===entry.id&&edge.target===users.id&&edge.kind==='handles')).toBe(true);
    expect(analysis.nodes.some(node=>node.path==='fake.ts'&&node.attributes.dictionaryStackId==='express')).toBe(false);
    expect(projectSemanticView(analysis,'function-call-flow').edges.some(edge=>edge.kind==='calls')).toBe(true);
  });
  it('extracts Pydantic and SQLAlchemy typed fields and validation/database operations',async()=>{
    const{analysis}=await analyze({'pyproject.toml':'[project]\nname="api"\ndependencies=["fastapi","pydantic","sqlalchemy"]','app.py':`from fastapi import FastAPI\nfrom pydantic import BaseModel, Field\nfrom sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column\nclass Base(DeclarativeBase):\n pass\nclass User(Base):\n id: Mapped[int] = mapped_column(primary_key=True)\n name: Mapped[str]\nclass Input(BaseModel):\n name: str = Field(min_length=1)\napp=FastAPI()\n@app.post('/users')\ndef create(data: Input):\n value=Input.model_validate(data)\n return value\n`});
    const input=analysis.nodes.find(node=>node.kind==='model'&&node.label==='Input')!;expect(input.attributes.dictionaryStackId).toBe('pydantic');expect(input.fields?.some(field=>field.name==='name')).toBe(true);
    const user=analysis.nodes.find(node=>node.kind==='model'&&node.label==='User')!;expect(user.attributes.dictionaryStackId).toBe('sqlalchemy');expect(user.fields?.map(field=>field.name)).toEqual(expect.arrayContaining(['id','name']));
    expect(analysis.nodes.some(node=>node.kind==='operation'&&node.attributes.operation==='validation')).toBe(true);
    expect(analysis.architecture?.nodes.some(node=>node.architecture?.kind==='application'&&node.label==='api')).toBe(true);
  });
  it('keeps TSX/JSX public coverage distinct and JS strings out of JSX usage',async()=>{
    const{store,analysis}=await analyze({'A.tsx':'export function A(){ return <div/>; }','B.jsx':'export function B(){return <span/>;}','plain.js':'const sample="<Fake/>"; // <Fake/>','real.js':'export const real = <button>OK</button>;'});
    expect(analysis.coverage.find(item=>item.path==='A.tsx')?.language).toBe('tsx');expect(analysis.coverage.find(item=>item.path==='B.jsx')?.language).toBe('jsx');
    const jsx=store.facts.find(fact=>fact.kind==='technology'&&fact.dictionaryStackId==='jsx')!;const paths=store.evidence.filter(item=>jsx.evidenceIds.includes(item.id)).map(item=>item.filePath);
    expect(paths).toContain('real.js');expect(paths).not.toContain('plain.js');expect(paths).not.toContain('A.tsx');
    expect(store.facts.filter(fact=>fact.kind==='module'&&fact.path==='A.tsx')).toHaveLength(1);
  });
  it('projects CDN outside application internals and local/cloud Firebase identities separately',async()=>{
    const{analysis}=await analyze({'package.json':'{"name":"web","scripts":{"dev":"vite"},"dependencies":{"firebase":"12"}}','index.html':'<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5/dist/css/bootstrap.css">','app.ts':`import { initializeApp } from 'firebase/app';import {getAuth,connectAuthEmulator}from'firebase/auth';import{getFirestore}from'firebase/firestore';const app=initializeApp({projectId:'demo'});const auth=getAuth(app);const db=getFirestore(app);connectAuthEmulator(auth,'http://localhost:9099');`});
    const architecture=analysis.architecture!;const cdn=architecture.nodes.find(node=>node.attributes.dictionaryStackId==='jsdelivr')!;expect(cdn.architecture?.kind).toBe('external-service');expect(cdn.architecture?.parentId).toBeUndefined();
    expect(architecture.nodes.find(node=>node.attributes.dictionaryStackId==='firebase-authentication')?.architecture?.environments).toEqual(['local']);
    expect(architecture.nodes.find(node=>node.attributes.dictionaryStackId==='cloud-firestore')?.architecture?.environments).toEqual(['cloud']);
    expect(architecture.edges.every(edge=>architecture.nodes.some(node=>node.id===edge.source)&&architecture.nodes.some(node=>node.id===edge.target))).toBe(true);
  });
  it('reconciles configured local emulators and Compose build/image declarations with their actual units',async()=>{
    const{analysis}=await analyze({'package.json':'{"name":"root"}','apps/web/package.json':'{"name":"web"}','apps/web/firebase.json':'{"emulators":{"auth":{"host":"127.0.0.1","port":9099}}}','apps/web/.firebaserc':'{"projects":{"default":"demo"}}','services/api/pyproject.toml':'[project]\nname="api"\ndependencies=["fastapi"]','services/api/main.py':"from fastapi import FastAPI\napp=FastAPI()\n@app.get('/users')\ndef users(): return []",'compose.yaml':'services:\n  api:\n    build: ./services/api\n    depends_on: [db]\n  db:\n    image: postgres:17\n'});
    const model=analysis.architecture!;const suite=model.nodes.find(node=>node.attributes.dictionaryStackId==='firebase-emulator-suite')!;const auth=model.nodes.filter(node=>node.architecture?.kind==='external-service'&&node.architecture.technologyNames.includes('firebase-authentication'));
    expect(suite.architecture?.auxiliary).toBe(false);expect(auth).toHaveLength(1);expect(auth[0]!.architecture).toMatchObject({parentId:suite.id,environments:['local']});
    const api=model.nodes.find(node=>node.label==='api'&&node.architecture?.kind==='application')!;const db=model.nodes.find(node=>node.attributes.dictionaryStackId==='postgresql')!;
    expect(model.nodes.some(node=>node.label==='Compose · api'||node.label==='Compose · db')).toBe(false);
    expect(model.edges.some(edge=>edge.source===api.id&&edge.target===db.id&&edge.label.includes('depends_on'))).toBe(true);
    expect(db.architecture?.technologies?.map(item=>item.name)).toEqual(expect.arrayContaining(['postgresql','docker-compose']));
  });
});

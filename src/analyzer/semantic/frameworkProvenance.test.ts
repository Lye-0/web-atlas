// @vitest-environment node
import{beforeAll,describe,expect,it}from'vitest';
import{frameworkCoverageFixtures}from'../fixtures/stack-coverage/frameworks';
import{scanProjectFiles}from'../scan';
import{semanticInput}from'./client';
import{analyzeSemanticSources}from'./analyze';
import{initializeTestParser,testLanguage,testParser}from'./testRuntime';
beforeAll(initializeTestParser);
const cases:[string,Record<string,string>][]=[
  ['fastapi',{'api.py':'from fastapi import FastAPI\napp=FastAPI()\ndef configure(app):\n @app.get("/ghost")\n def users(): return 1\n return users'}],
  ['flask',{'api.py':'from flask import Flask\napp=Flask(__name__)\ndef configure(app):\n @app.get("/ghost")\n def users(): return 1\n return users'}],
  ['django',{'urls.py':'from django.urls import path\ndef path(route,handler): return None\ndef users(request):return 1\nurlpatterns=[path("ghost",users)]'}],
  ['spring-framework',{'Api.java':'import org.springframework.web.bind.annotation.RestController;\nimport custom.GetMapping;\n@RestController class Api{@GetMapping("/ghost")String users(){return "ok";}}','GetMapping.java':'package custom;public @interface GetMapping{String value();}'}],
  ['gin',{'main.go':'package main\nimport "github.com/gin-gonic/gin"\ntype Fake struct{}\nfunc(Fake)GET(path string,handler func()){}\ntype Factory struct{}\nfunc(Factory)Default()Fake{return Fake{}}\nvar factory Factory\nfunc main(){_=gin.Default();router:=factory.Default();router.GET("/ghost",users)}\nfunc users(){}'}],
  ['aspnet-core',{'Program.cs':'using System;using Microsoft.AspNetCore.Builder;var app=WebApplication.CreateBuilder(args).Build();var fake=new Fake();fake.MapGet("/ghost",Users);static string Users(){return "ok";}class Fake{public void MapGet(string path,Func<string> handler){}}'}],
  ['axum',{'src/main.rs':'use axum::Router;fn real()->Router{Router::new()}struct Fake;impl Fake{fn route(self,path:&str,handler:fn()->i32)->Self{self}}fn routes()->Fake{Fake.route("/ghost",users)}fn users()->i32{1}'}],
  ['actix-web',{'src/main.rs':'use actix_web::App;use other_macros::get;#[get("/ghost")]async fn users()->i32{1}fn app(){App::new();}'}],
  ['laravel',{'routes/web.php':'<?php use Custom\\Route as Route;use Illuminate\\Database\\Eloquent\\Model;class User extends Model{public string $name;}class UserController{public function users(){return 1;}}Route::get("/ghost",[UserController::class,"users"]);'}],
];
describe('framework local binding and exact route provenance',()=>{
  it.each(cases)('%s lookalikes do not become public endpoints or HTTP targets',async(stackId,sourceFiles)=>{
    const manifest=Object.fromEntries(Object.entries(frameworkCoverageFixtures.find(fixture=>fixture.stackId===stackId)!.sources).filter(([path])=>!/\.(?:ts|py|rb|php|java|cs|go|rs)$/.test(path)));const sources={...manifest,...sourceFiles,'web.ts':'export function request(){return fetch("/ghost");}'};
    const store=await scanProjectFiles(Object.entries(sources).map(([relativePath,source])=>({relativePath,name:relativePath.split('/').at(-1)!,extension:'.'+relativePath.split('.').at(-1),size:source.length,readText:async()=>source})));const analysis=await analyzeSemanticSources(semanticInput(store),testLanguage,undefined,testParser);
    expect(analysis.nodes.some(node=>node.kind==='entry'&&node.attributes.endpoint==='/ghost')).toBe(false);expect(analysis.edges.some(edge=>edge.kind==='http')).toBe(false);
  });
  it('does not turn a commented Spring Boot annotation into runtime configuration',async()=>{
    const source='// @SpringBootApplication\nclass Application{public static void main(String[]args){System.out.println("plain Java");}}';const manifest=frameworkCoverageFixtures.find(fixture=>fixture.stackId==='spring-boot')!.sources['pom.xml']!;const sources={'pom.xml':manifest,'Application.java':source};const store=await scanProjectFiles(Object.entries(sources).map(([relativePath,source])=>({relativePath,name:relativePath.split('/').at(-1)!,extension:'.'+relativePath.split('.').at(-1),size:source.length,readText:async()=>source})));const analysis=await analyzeSemanticSources(semanticInput(store),testLanguage,undefined,testParser);expect(analysis.nodes.some(node=>node.attributes.dictionaryStackId==='spring-boot'&&node.attributes.runtimeEntry)).toBe(false);
  });
});

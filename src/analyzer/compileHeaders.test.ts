import{describe,expect,it}from'vitest';
import{compileHeaderLanguages}from'./compileHeaders';
import{scanProjectFiles}from'./scan';
describe('compilation context for headers',()=>{
  it.each([['clang -x c -x c++ types.h','cpp'],['clang main.c -x c++','c']])('applies -x in argv order only before its input: %s',(command,expected)=>{
    const target=command.includes('types.h')?'types.h':'main.c';const sources=new Map(Object.entries({'compile_commands.json':JSON.stringify([{directory:'.',file:target,command}]),'types.h':'struct User{int id;};','main.c':'#include "types.h"'}));expect(compileHeaderLanguages(sources).get('types.h')).toBe(expected);
  });
  it('loads only the compilation database exception from an excluded build directory',async()=>{
    const sources={'build/compile_commands.json':JSON.stringify([{directory:'..',file:'main.cpp',arguments:['clang++','main.cpp']}]),'main.cpp':'#include "types.h"','types.h':'class User{public:int id;};','build/generated.cpp':'class Excluded{};'};
    const store=await scanProjectFiles(Object.entries(sources).map(([relativePath,source])=>({relativePath,name:relativePath.split('/').at(-1)!,extension:'.'+relativePath.split('.').at(-1),size:source.length,readText:async()=>source})));expect(store.sources).toHaveProperty('build/compile_commands.json');expect(store.sources).not.toHaveProperty('build/generated.cpp');expect(store.facts.find(fact=>fact.kind==='module'&&fact.path==='types.h')).toMatchObject({language:'cpp'});
  });
  it('uses arguments, explicit -x and local include chains without guessing from .h',()=>{
    const sources=new Map(Object.entries({'compile_commands.json':JSON.stringify([{directory:'.',file:'main.c',arguments:['clang','-x','c++','-Iinclude','main.c']}]),'main.c':'#include "types.h"','include/types.h':'#include "detail.h"\nstruct User { int id; };','include/detail.h':'int save(int value);','unknown.h':'int unknown();'}));
    expect([...compileHeaderLanguages(sources)]).toEqual([['include/types.h','cpp'],['include/detail.h','cpp']]);
  });
  it('keeps conflicting units and unknown absolute directories unresolved',()=>{
    const sources=new Map(Object.entries({'compile_commands.json':JSON.stringify([{directory:'.',file:'a.c',arguments:['cc','a.c']},{directory:'.',file:'b.cpp',arguments:['c++','b.cpp']},{directory:'/external/root',file:'a.c',arguments:['cc','a.c']}]),'a.c':'#include "shared.h"','b.cpp':'#include "shared.h"','shared.h':'struct User { int id; };'}));expect(compileHeaderLanguages(sources).has('shared.h')).toBe(false);
  });
});

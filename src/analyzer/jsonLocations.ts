export interface JsonLocation { key: {start:number;end:number}; value: {start:number;end:number} }
/** JSONC token locations follow decoded object paths, never substring occurrence guesses. */
export function jsonLocations(source:string):Map<string,JsonLocation> {
  let offset=0;const result=new Map<string,JsonLocation>();
  const trivia=()=>{for(;;){while(/\s/.test(source[offset]??'')&&offset<source.length)offset++;if(source.slice(offset,offset+2)==='//'){const end=source.indexOf('\n',offset);offset=end<0?source.length:end;continue;}if(source.slice(offset,offset+2)==='/*'){const end=source.indexOf('*/',offset+2);if(end<0)throw new Error('Unterminated JSON comment');offset=end+2;continue;}break;}};
  const string=()=>{const start=offset++;let escaped=false;while(offset<source.length){const char=source[offset++]!;if(escaped){escaped=false;continue;}if(char==='\\'){escaped=true;continue;}if(char==='"')break;}const raw=source.slice(start,offset);const value=JSON.parse(raw)as string;return{value,start:raw.slice(1,-1)===value?start+1:start,end:raw.slice(1,-1)===value?offset-1:offset};};
  const value=(path:string[],depth:number):{start:number;end:number}=>{
    if(depth>100)throw new Error('JSON nesting limit');trivia();const start=offset;
    if(source[offset]==='"'){string();return{start:start+1,end:offset-1};}
    if(source[offset]==='{'){offset++;trivia();while(source[offset]!=='}'&&offset<source.length){const key=string();trivia();if(source[offset++]!==':')throw new Error('Invalid JSON property');const child=value([...path,key.value],depth+1);result.set(JSON.stringify([...path,key.value]),{key:{start:key.start,end:key.end},value:child});trivia();if(source[offset]===','){offset++;trivia();}else break;}if(source[offset++]!=='}')throw new Error('Invalid JSON object');return{start,end:offset};}
    if(source[offset]==='['){offset++;let index=0;trivia();while(source[offset]!==']'&&offset<source.length){const childPath=[...path,String(index++)];const child=value(childPath,depth+1);result.set(JSON.stringify(childPath),{key:child,value:child});trivia();if(source[offset]===','){offset++;trivia();}else break;}if(source[offset++]!==']')throw new Error('Invalid JSON array');return{start,end:offset};}
    while(offset<source.length&&!/[\s,\]}]/.test(source[offset]!))offset++;if(offset===start)throw new Error('Invalid JSON scalar');return{start,end:offset};
  };value([],0);return result;
}

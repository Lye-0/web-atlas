import { isScalar, isSeq, parseDocument } from 'yaml';

/** Preserve each decoded CI command's source boundaries, including YAML list/quote syntax. */
export function yamlCommandOffsets(source:string,job:string):number[]|undefined {
  const script=parseDocument(source).getIn([job,'script'],true);
  const values=isSeq(script)?script.items:[script];const result:number[]=[];
  for(const value of values){
    if(!isScalar(value)||typeof value.value!=='string'||!value.range)return;
    const decoded=value.value,raw=source.slice(value.range[0],value.range[1]);
    let cursor=raw[0]==='"'||raw[0]==="'"?1:/^[|>]/.test(raw)?raw.indexOf('\n')+1:0;
    const boundaries:number[]=[];
    for(let index=0;index<decoded.length;index++){
      const character=decoded[index]!;
      if(raw[cursor]==='\\'&&raw[0]==='"'){
        const escape=raw.slice(cursor).match(/^\\(?:u[\da-fA-F]{4}|U[\da-fA-F]{8}|x[\da-fA-F]{2}|.)/);
        if(escape){boundaries.push(value.range[0]+cursor);cursor+=escape[0].length;continue;}
      }
      const position=raw.indexOf(character,cursor);
      if(position<0){if(character===' '||character==='\n'){boundaries.push(value.range[0]+cursor);continue;}return;}
      boundaries.push(value.range[0]+position);cursor=position+1;
      if(raw[0]==="'"&&character==="'"&&raw[cursor]==="'")cursor++;
    }
    boundaries.push(value.range[0]+cursor);
    if(result.length){const end=result.pop()!;result.push(end,end,end,end);}
    result.push(...boundaries);
  }
  return result;
}

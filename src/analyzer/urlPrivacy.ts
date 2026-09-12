const urlPattern=/(?:https?|postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis|rediss|mssql):\/\/[^\s"'<>`]+/gi;
const secretParameter=/(?:token|password|passwd|secret|credential|api.?key|access.?key|auth|signature|^sig$|cookie|session|policy)/i;
/** Display/identity URLs never contain userinfo or secret query values. No request is made. */
export function publicUrlText(value:string):string {
  return value.replace(urlPattern,raw=>{try{const url=new URL(raw);const secretKeys=[...url.searchParams.keys()].filter(key=>secretParameter.test(key));if(!url.username&&!url.password&&!secretKeys.length)return raw;url.username='';url.password='';for(const key of secretKeys)url.searchParams.set(key,'[redacted]');return url.href;}catch{return raw.replace(/(:\/\/)[^/@]+@/,'$1').replace(/([?&][^=&]*(?:token|secret|password|key|signature)[^=&]*=)[^&#]*/gi,'$1[redacted]');}});
}
/** Source masking keeps every UTF-16 offset, line and quote intact. */
export function maskUrlSecrets(source:string):string {
  const hide=(value:string)=>value.replace(/[^\r\n]/g,'•');
  return source.replace(urlPattern,raw=>raw.replace(/(:\/\/)([^/@]+)@/,(match,prefix:string,credentials:string)=>prefix+hide(credentials)+'@').replace(/([?&])([^=&]+)=([^&#]*)/g,(match,separator:string,key:string,value:string)=>secretParameter.test(key)?`${separator}${key}=${hide(value)}`:match));
}

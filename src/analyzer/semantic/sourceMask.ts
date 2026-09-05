const sensitiveKey = /(?:password|passwd|secret|token|credential|private[_-]?key|api[_-]?key|service[_-]?account|authorization|cookie)/i;
const hide = (value: string) => value.replace(/[^\r\n]/g, '•');

/** Keep quotes, escapes, line numbers and UTF-16 offsets valid for syntax parsing. */
export function maskSemanticSource(source: string): string {
  const tokens = /\/\*[\s\S]*?\*\/|\/\/[^\r\n]*|"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|`(?:\\[\s\S]|[^`\\])*`/g;
  return source.replace(tokens, (token: string, offset: number) => {
    if (/^(?:\/\/|\/\*)/.test(token)) return token;
    const before = source.slice(Math.max(0, offset - 160), offset);
    const key = before.match(/([\w$.-]+)["']?\s*(?::|=)\s*[$rbu@]*\s*$/i)?.[1];
    const quoteLength = /^(?:"""|''')/.test(token) ? 3 : 1;
    const quoted = token.slice(0, quoteLength); const body = token.slice(quoteLength, -quoteLength);
    if (key && sensitiveKey.test(key)) {
      return quoted + body.replace(/\\(?:u[\da-fA-F]{4}|x[\da-fA-F]{2}|[\s\S])|[^\\]+/g, part => part.startsWith('\\') ? part : hide(part)) + quoted;
    }
    return quoted + body.replace(/(Bearer\s+)[A-Za-z0-9_.~-]{12,}/g, (value, prefix: string) => prefix + hide(value.slice(prefix.length))) + quoted;
  });
}

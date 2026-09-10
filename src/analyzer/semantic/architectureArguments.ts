/** Bounded lexical extraction only. Never evaluate a source expression. */
export function architectureFirstArgument(source: string, open: number): string {
  let depth = 0, quote = '', escaped = false;
  for (let at = open + 1; at < source.length; at++) {
    const char = source[at]!;
    if (quote) {
      if (escaped) escaped = false; else if (char === '\\') escaped = true; else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
    if ('([{'.includes(char)) depth++;
    else if (')]}'.includes(char)) { if (depth === 0) return source.slice(open + 1, at).trim(); depth--; }
    else if (char === ',' && depth === 0) return source.slice(open + 1, at).trim();
  }
  return source.slice(open + 1).trim();
}

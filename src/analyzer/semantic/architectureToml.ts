/** A deliberately bounded TOML reader for literal deployment settings. Unsupported
 * expressions are reported and omitted, never evaluated or silently guessed. */
export function architectureToml(source: string): { config: Record<string, unknown>; unsupported: boolean } {
  const config: Record<string, unknown> = Object.create(null);
  let target = config, unsupported = false;
  const value = (text: string): unknown => {
    if (/^"(?:[^"\\]|\\.)*"$/.test(text)) { try { return JSON.parse(text); } catch { return undefined; } }
    if (/^'[^']*'$/.test(text)) return text.slice(1, -1);
    if (/^(true|false)$/.test(text)) return text === 'true';
    if (/^-?\d+(?:\.\d+)?$/.test(text)) return Number(text);
    if (text.startsWith('[') && text.endsWith(']')) {
      const parts = text.slice(1, -1).match(/"(?:[^"\\]|\\.)*"|'[^']*'|[^,]+/g) ?? [];
      const values = parts.map(part => value(part.trim()));
      return values.every(item => item !== undefined) ? values : undefined;
    }
    return undefined;
  };
  for (const raw of source.split('\n')) {
    const line = (raw.match(/^(?:(?:"(?:[^"\\]|\\.)*"|'[^']*')|[^#"'])*/)?.[0] ?? '').trim();
    if (!line) continue;
    const header = line.match(/^(\[\[?)([\w.-]+)\]\]?$/);
    if (header) {
      const parts = header[2]!.split('.'); target = config;
      for (let index = 0; index < parts.length; index++) {
        const key = parts[index]!;
        if (['__proto__', 'constructor', 'prototype'].includes(key)) { unsupported = true; target = Object.create(null); break; }
        if (index === parts.length - 1 && header[1] === '[[') {
          const list = Array.isArray(target[key]) ? target[key] as unknown[] : [];
          target[key] = list; const entry: Record<string, unknown> = Object.create(null); list.push(entry); target = entry;
        } else {
          if (!target[key]) target[key] = Object.create(null);
          if (typeof target[key] !== 'object' || Array.isArray(target[key])) { unsupported = true; target = Object.create(null); break; }
          target = target[key] as Record<string, unknown>;
        }
      }
      continue;
    }
    const pair = line.match(/^([\w-]+)\s*=\s*(.*)$/);
    if (!pair || ['__proto__', 'constructor', 'prototype'].includes(pair[1]!)) { unsupported = true; continue; }
    const parsed = value(pair[2]!);
    if (parsed === undefined) unsupported = true; else target[pair[1]!] = parsed;
  }
  return { config, unsupported };
}

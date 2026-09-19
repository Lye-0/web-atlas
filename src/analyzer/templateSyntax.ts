import { parseFragment, type DefaultTreeAdapterMap } from 'parse5';

export interface TemplateAttribute { name: string; value: string; start: number; end: number }
export interface TemplateElement { name: string; start: number; end: number; attributes: TemplateAttribute[] }
/** HTML parser locations stay in the original SFC/document, including embedded scripts. */
export function templateElements(source: string): TemplateElement[] {
  const root = parseFragment(source, { sourceCodeLocationInfo: true }); const elements: TemplateElement[] = [];
  const visit = (node: DefaultTreeAdapterMap['node']) => {
    if ('tagName' in node && node.sourceCodeLocation) {
      const location = node.sourceCodeLocation;
      elements.push({ name: node.tagName, start: location.startOffset, end: location.endOffset, attributes: node.attrs.flatMap(attribute => {
        const at = location.attrs?.[attribute.name]; return at ? [{ name: attribute.name, value: attribute.value, start: at.startOffset, end: at.endOffset }] : [];
      }) });
      if (node.tagName === 'template' && 'content' in node) visit(node.content);
    }
    if ('childNodes' in node) node.childNodes.forEach(visit);
  }; visit(root); return elements;
}

import { expect, it } from 'vitest';
import { parseCommandExpression } from './commandParser';
it.each([
  'concurrently --names "web,api" --prefix "[{name}]" "vite" "node server.js"',
  'concurrently -n "web,api" -c "red,blue" --prefix-length 10 "vite" "node server.js"',
  'concurrently --names="web,api" --prefix="[{name}]" --raw "vite" "node server.js"',
])('excludes option values and keeps command ranges: %s', source => {
  const command = parseCommandExpression(source)[0]!;
  expect(command.children.map(c => c.text)).toEqual(['vite','node server.js']);
  for (const child of command.children) expect(source.slice(child.start, child.end)).toBe(child.text);
});
it('keeps the inner quote structure of nested commands', () => {
  const source = `concurrently --names 'web,api' "node server.js --label 'two words'" 'vite'`;
  expect(parseCommandExpression(source)[0]!.children.map(c => c.text)).toEqual(["node server.js --label 'two words'",'vite']);
});

it('keeps bare commands and does not treat replacement arguments as more commands', () => {
  expect(parseCommandExpression('concurrently --raw vite tsc -- extra')[0]!.children.map(c => c.text)).toEqual(['vite','tsc']);
});
it('reports unknown option syntax conservatively instead of launching its quoted value in the model', () => {
  const command = parseCommandExpression('concurrently --unknown "vite" "node server.js"')[0]!;
  expect(command.children).toEqual([]); expect(command.parseWarning).toContain('未対応');
});

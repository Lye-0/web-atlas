import type { SemanticGraph, SemanticNode } from './types';
import type { SemanticPosition } from './presentation';
import { semanticRegionIdentity } from './flowRegions';
import { explorerRegionIdentity, type SemanticExplorerModel } from './semanticExplorer';

type Vector = [number, number, number];
interface Cloud { size: Vector; points: SemanticPosition[] }

/** Compact, deterministic packing. File and directory membership, never edges,
 * controls position, so selection and call traversal cannot rearrange the map. */
function pack(clouds: Cloud[], gap: number, depth = 0, aspect: Vector = [1, 1, 1]): Cloud {
  if (!clouds.length) return { size: [0, 0, 0], points: [] };
  if (clouds.length === 1) return clouds[0]!;
  const weights = clouds.map(cloud => cloud.size.reduce((volume, side) => volume * Math.max(1, side), 1));
  const half = weights.reduce((sum, weight) => sum + weight, 0) / 2;
  let split = 1, sum = weights[0]!;
  while (split < clouds.length - 1 && sum < half) sum += weights[split++]!;
  const a = pack(clouds.slice(0, split), gap, depth + 1, aspect), b = pack(clouds.slice(split), gap, depth + 1, aspect);
  const candidates = [0, 1, 2].map(index => {
    const axis = (index + depth) % 3;
    const size = a.size.map((side, dimension) => dimension === axis ? side + b.size[dimension]! + gap : Math.max(side, b.size[dimension]!)) as Vector;
    const scaled = size.map((side, dimension) => side / aspect[dimension]!);
    return { axis, size, score: Math.max(...scaled) + scaled.reduce((total, side) => total + side ** 2, 0) ** .5 * .1 };
  }).sort((first, second) => first.score - second.score);
  const { axis, size } = candidates[0]!;
  const translate = (cloud: Cloud, offset: number) => cloud.points.map(point => ({ ...point,
    x: point.x + (axis === 0 ? offset : 0), y: point.y + (axis === 1 ? offset : 0), z: point.z + (axis === 2 ? offset : 0) }));
  return { size, points: [...translate(a, -(b.size[axis]! + gap) / 2), ...translate(b, (a.size[axis]! + gap) / 2)] };
}

/** A rotated close-packed volume gives files small coherent clouds, including
 * files with hundreds of callbacks, without placing their nodes on a plane. */
function fileCloud(nodes: SemanticNode[], identity: string): Cloud {
  nodes.sort((a, b) => (a.line ?? 0) - (b.line ?? 0) || a.id.localeCompare(b.id));
  const limit = Math.max(1, Math.ceil(Math.cbrt(nodes.length)));
  const slots: Vector[] = [];
  for (let x = -limit; x <= limit; x++) for (let y = -limit; y <= limit; y++) for (let z = -limit; z <= limit; z++) {
    if ((x + y + z) % 2 === 0) slots.push([x, y, z]);
  }
  slots.sort((a, b) => a.reduce((s, v) => s + v * v, 0) - b.reduce((s, v) => s + v * v, 0) || a[2] - b[2] || a[1] - b[1] || a[0] - b[0]);
  let hash = 0;
  for (const char of identity) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  const angle = (Math.abs(hash) % 180 + 17) * Math.PI / 180, tilt = .48;
  const points = nodes.map((node, index) => {
    const slot = slots[index]!, x = slot[0] * 26, y = slot[1] * 26, z = slot[2] * 26;
    const rx = x * Math.cos(angle) - z * Math.sin(angle), rz = x * Math.sin(angle) + z * Math.cos(angle);
    return { node, x: rx, y: y * Math.cos(tilt) - rz * Math.sin(tilt), z: y * Math.sin(tilt) + rz * Math.cos(tilt) };
  });
  const radius = Math.max(12, ...points.map(point => Math.hypot(point.x, point.y, point.z))) + 14;
  return { points, size: [radius * 2, radius * 2, radius * 2] };
}

export function layoutSemanticCloud(graph: SemanticGraph, explorer?: SemanticExplorerModel): SemanticPosition[] {
  const groups = new Map<string, Map<string, SemanticNode[]>>();
  for (const node of graph.nodes) {
    const groupId = explorer ? explorerRegionIdentity(explorer, node.id).id : semanticRegionIdentity(node).id;
    const files = groups.get(groupId) ?? new Map<string, SemanticNode[]>();
    const sourcePath = explorer ? explorer.owners.get(node.id)?.filePath : node.kind !== 'external' ? node.path : undefined;
    const file = sourcePath?.replaceAll('\\', '/').replace(/^\.\//, '') ?? `object:${node.id}`;
    const members = files.get(file) ?? [];
    members.push(node); files.set(file, members); groups.set(groupId, files);
  }
  const clouds = [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([, files]) =>
    pack([...files].sort(([a], [b]) => a.localeCompare(b)).map(([file, nodes]) => fileCloud(nodes, file)), 30));
  // A landscape map leaves space around the major groups at normal desktop
  // sizes. Each file/group retains its own full volume and can be orbited.
  return pack(clouds, 160, 0, [2.5, 1, 1]).points;
}

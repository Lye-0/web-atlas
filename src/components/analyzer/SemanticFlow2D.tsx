import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { AnalyzerViewSession } from '../../analyzer/session';
import { layoutSemanticFlow, semanticFlowEdgePaths, semanticMemberIds } from '../../analyzer/semantic/flowPresentation';
import { spatialFlowPhase, SPATIAL_FLOW_PARTICLE_SPACING, SPATIAL_FLOW_SPEED } from '../../analyzer/spatialFlow';
import type { SemanticGraph } from '../../analyzer/semantic/types';

export type FlowCamera2D = NonNullable<NonNullable<AnalyzerViewSession['flowCameras']>['2d']>;
export interface FlowCameraCommand { kind: 'fit' | 'reset' | 'focus' | 'zoom-in' | 'zoom-out'; nonce: number; ids?: string[] }
export interface SemanticFlowRenderProps {
  graph: SemanticGraph; selectedIds: ReadonlySet<string>; selectedEdgeId?: string; matchIds: ReadonlySet<string>;
  command?: FlowCameraCommand; motion: { enabled: boolean; reduced: boolean; visible: boolean };
  onSelect: (id: string) => void; onSelectEdge: (id: string) => void; onClear: () => void;
}

export function SemanticFlow2D({ graph, selectedIds, selectedEdgeId, matchIds, command, motion, camera: savedCamera, onCamera, onSelect, onSelectEdge, onClear }: SemanticFlowRenderProps & {
  camera?: FlowCamera2D; onCamera: (camera: FlowCamera2D) => void;
}) {
  const root = useRef<SVGSVGElement>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [camera, setCamera] = useState<FlowCamera2D>(savedCamera ?? { x: 100, y: 100, scale: 1 });
  const initialized = useRef(Boolean(savedCamera));
  const previousSize = useRef(viewport);
  const lastCommand = useRef(command?.nonce);
  const positions = useMemo(() => layoutSemanticFlow(graph, '2d'), [graph]);
  const paths = useMemo(() => semanticFlowEdgePaths(graph, positions, selectedIds, selectedEdgeId, '2d', graph.edges.length > 140), [graph, positions, selectedIds, selectedEdgeId]);
  const active = useMemo(() => paths.filter(path => path.selected), [paths]);
  const particleSpacing = SPATIAL_FLOW_PARTICLE_SPACING * (motion.reduced ? 2 : 1);
  const shownPaths = graph.edges.length <= 140 ? paths : active;
  const selectedNodes = useMemo(() => new Set(active.flatMap(path => [path.edge.source, path.edge.target])), [active]);
  const callbacks = useRef({ onCamera });
  useEffect(() => { callbacks.current = { onCamera }; }, [onCamera]);
  const commit = useCallback((update: FlowCamera2D | ((current: FlowCamera2D) => FlowCamera2D)) => {
    setCamera(current => typeof update === 'function' ? update(current) : update);
  }, []);
  useEffect(() => { if (initialized.current) callbacks.current.onCamera(camera); }, [camera]);
  useLayoutEffect(() => {
    const element = root.current; if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry && entry.contentRect.width > 0 && entry.contentRect.height > 0) setViewport({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element); return () => observer.disconnect();
  }, []);
  const fit = useCallback((ids?: string[]) => {
    const targets = ids?.length ? positions.filter(position => ids.includes(position.node.id) || semanticMemberIds(position.node).some(id => ids.includes(id))) : positions;
    if (!targets.length || viewport.width <= 0 || viewport.height <= 0) return;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const point of targets) { minX = Math.min(minX, point.x - 124); maxX = Math.max(maxX, point.x + 124); minY = Math.min(minY, point.y - 54); maxY = Math.max(maxY, point.y + 54); }
    const targetIds = new Set(targets.map(point => point.node.id));
    if (!ids || ids.length > 1) for (const path of paths) if ((!ids || targetIds.has(path.edge.source) && targetIds.has(path.edge.target))) for (const point of path.points) {
      minX = Math.min(minX, point.x - 18); maxX = Math.max(maxX, point.x + 18); minY = Math.min(minY, point.y - 18); maxY = Math.max(maxY, point.y + 18);
    }
    const scale = Math.min((viewport.width - 40) / (maxX - minX), (viewport.height - 130) / (maxY - minY), ids?.length === 1 ? 1.45 : 1.15);
    commit({ x: viewport.width / 2 - (minX + maxX) / 2 * scale, y: (viewport.height + 50) / 2 - (minY + maxY) / 2 * scale, scale });
  }, [positions, paths, viewport, commit]);
  useLayoutEffect(() => {
    if (viewport.width <= 0 || viewport.height <= 0) return;
    if (!initialized.current && positions.length) { initialized.current = true; fit(); }
    else if (previousSize.current.width > 0 && (viewport.width !== previousSize.current.width || viewport.height !== previousSize.current.height)) {
      const previous = previousSize.current;
      commit(current => ({ ...current, x: current.x + (viewport.width - previous.width) / 2, y: current.y + (viewport.height - previous.height) / 2 }));
    }
    previousSize.current = viewport;
  }, [positions, viewport, fit, commit]);
  const zoom = useCallback((factor: number, x = viewport.width / 2, y = viewport.height / 2) => commit(current => {
    const scale = Math.max(.000001, Math.min(5, current.scale * factor));
    return { scale, x: x - (x - current.x) * scale / current.scale, y: y - (y - current.y) * scale / current.scale };
  }), [commit, viewport]);
  useEffect(() => {
    if (!command || command.nonce === lastCommand.current) return;
    lastCommand.current = command.nonce;
    if (command.kind === 'fit' || command.kind === 'reset') fit();
    else if (command.kind === 'focus') fit(command.ids);
    else zoom(command.kind === 'zoom-in' ? 1.2 : 1 / 1.2);
  }, [command, fit, zoom]);
  useEffect(() => {
    const element = root.current; if (!element) return;
    const wheel = (event: WheelEvent) => { event.preventDefault(); const rect = element.getBoundingClientRect(); zoom(Math.exp(-event.deltaY * .0015), event.clientX - rect.left, event.clientY - rect.top); };
    element.addEventListener('wheel', wheel, { passive: false }); return () => element.removeEventListener('wheel', wheel);
  }, [zoom]);
  useEffect(() => {
    if (!motion.enabled || !motion.visible || !active.length) return;
    let frame = 0, last = 0, distance = 0;
    const particles = root.current?.querySelectorAll<SVGPathElement>('[data-flow-particle]');
    const animate = (time: number) => {
      if (last) distance += Math.min(time - last, 100) / 1000 * SPATIAL_FLOW_SPEED; last = time;
      particles?.forEach(path => {
        path.setAttribute('stroke-dashoffset', String(-distance - Number(path.dataset.phase) * particleSpacing));
      });
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate); return () => cancelAnimationFrame(frame);
  }, [active, motion.enabled, motion.visible, particleSpacing]);
  const drag = useRef<{ x: number; y: number; startX: number; startY: number; moved: boolean } | undefined>(undefined);
  const visibleNodes = positions.filter(point => point.x * camera.scale + camera.x > -220 && point.x * camera.scale + camera.x < viewport.width + 220 && point.y * camera.scale + camera.y > -100 && point.y * camera.scale + camera.y < viewport.height + 100);
  return <svg ref={root} className="semantic-flow-2d" role="application" tabIndex={0} aria-label="分類2D。矢印キーで移動、HomeでFit。検索結果からも選択できます。"
    data-camera-x={camera.x} data-camera-y={camera.y} data-camera-scale={camera.scale} data-node-count={graph.nodes.length} data-edge-count={graph.edges.length}
    onPointerDown={event => {
      if (event.button !== 0) return;
      drag.current = { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, moved: false };
      // Capturing an ordinary node click would retarget it to the SVG and erase the selection.
      if (!(event.target as Element).closest('[data-node-id], .semantic-flow-edge-hit')) root.current?.setPointerCapture?.(event.pointerId);
    }}
    onPointerMove={event => {
      if (!drag.current || !(event.buttons & 1)) return;
      const dx = event.clientX - drag.current.x, dy = event.clientY - drag.current.y;
      if (!drag.current.moved && Math.hypot(event.clientX - drag.current.startX, event.clientY - drag.current.startY) > 5) { drag.current.moved = true; root.current?.setPointerCapture?.(event.pointerId); }
      if (drag.current.moved) { drag.current.x = event.clientX; drag.current.y = event.clientY; commit(current => ({ ...current, x: current.x + dx, y: current.y + dy })); }
    }}
    onPointerUp={event => { if (root.current?.hasPointerCapture?.(event.pointerId)) root.current.releasePointerCapture(event.pointerId); }}
    onPointerCancel={() => { drag.current = undefined; }}
    onClick={() => { if (!drag.current?.moved) onClear(); drag.current = undefined; }}
    onKeyDown={event => {
      if (event.target !== event.currentTarget) return;
      if (event.key === 'Home') { event.preventDefault(); fit(); }
      else if (event.key === '+' || event.key === '=') { event.preventDefault(); zoom(1.2); }
      else if (event.key === '-') { event.preventDefault(); zoom(1 / 1.2); }
      else if (event.key.startsWith('Arrow')) { event.preventDefault(); commit(current => ({ ...current, x: current.x + (event.key === 'ArrowLeft' ? 60 : event.key === 'ArrowRight' ? -60 : 0), y: current.y + (event.key === 'ArrowUp' ? 60 : event.key === 'ArrowDown' ? -60 : 0) })); }
      else if (event.key === 'Escape') { event.preventDefault(); onClear(); }
    }}>
    <defs>{['#82c6e2', '#dfb785', '#afcbbd', '#496660'].map(color => <marker key={color} id={`flow-arrow-${color.slice(1)}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse" markerUnits="strokeWidth"><path d="M 0 0 L 10 5 L 0 10 z" fill={color} /></marker>)}</defs>
    <g transform={`translate(${camera.x} ${camera.y}) scale(${camera.scale})`}>
      <g data-flow-layer="edge-targets">{shownPaths.map(path => <path key={path.edge.id} data-edge-hit-id={path.edge.id} d={path.svgPath} className="semantic-flow-edge-hit" role="button" tabIndex={path.selected ? 0 : -1} aria-label={`${path.edge.label}の根拠を表示`}
          onClick={event => { event.stopPropagation(); if (!drag.current?.moved) onSelectEdge(path.edge.id); drag.current = undefined; }}
          onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelectEdge(path.edge.id); } }} />
      )}</g>
      <g data-flow-layer="nodes">{visibleNodes.map(point => {
        const members = semanticMemberIds(point.node), selected = members.some(id => selectedIds.has(id));
        const matching = members.filter(id => matchIds.has(id)).length;
        const detail = camera.scale > .4 || selected || (matching > 0 && visibleNodes.length < 100);
        return <g key={point.node.id} transform={`translate(${point.x} ${point.y})`} role="button" tabIndex={0}
          aria-label={`${point.node.label}, ${point.node.path ?? point.node.group}${point.node.line ? `:${point.node.line}` : ''}${point.node.attributes.overview ? `、${members.length}件を展開` : ''}`} aria-pressed={selected}
          className={`semantic-flow-node${selected ? ' is-selected' : ''}${matching ? ' is-match' : ''}${selectedNodes.has(point.node.id) ? ' is-connected' : ''}`}
          data-node-id={point.node.id} data-member-count={members.length} onClick={event => { event.stopPropagation(); if (!drag.current?.moved) onSelect(point.node.id); drag.current = undefined; }}
          onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); onSelect(point.node.id); } }}>
          <title>{point.node.label}{'\n'}{point.node.path ?? point.node.group}{point.node.line ? `:${point.node.line}` : ''}</title>
          <rect x={-106} y={-30} width={212} height={60} rx={7} />
          {selected && <rect className="semantic-flow-selection-ring" x={-111} y={-35} width={222} height={70} rx={10} />}
          {detail ? <><text x={-94} y={-7} className="semantic-flow-node-name">{point.node.label.length > 25 ? `${point.node.label.slice(0, 24)}…` : point.node.label}</text>
            <text x={-94} y={14} className="semantic-flow-node-path">{point.node.attributes.overview ? `${members.length}対象${matching ? ` · ${matching}件一致` : ''} · 展開` : `${(point.node.path?.split('/').at(-1) ?? point.node.group).slice(0, 26)}${point.node.line ? `:${point.node.line}` : ''}`}</text></>
            : <circle r={8} className="semantic-flow-node-dot" />}
        </g>;
      })}</g>
      <g data-flow-layer="edges" pointerEvents="none">{shownPaths.map(path => <g key={path.edge.id} data-edge-id={path.edge.id} data-source={path.edge.source} data-target={path.edge.target} data-direction={path.direction ?? ''}>
        <path d={path.svgPath} fill="none" stroke={path.color} strokeWidth={path.selected ? 2.6 : 1.2} opacity={path.selected ? 1 : .4} markerEnd={`url(#flow-arrow-${path.color.slice(1)})`} />
      </g>)}</g>
      {/* Round zero-length dashes keep exact arc spacing without a DOM node per dot. */}
      <g data-flow-layer="particles" pointerEvents="none">{motion.enabled && motion.visible && active.map(path => <path key={path.edge.id} data-flow-particle data-particle-edge-id={path.edge.id} data-phase={spatialFlowPhase(path.edge.id)}
        d={path.svgPath} fill="none" stroke={path.color} strokeWidth={motion.reduced ? 5 : 7} strokeLinecap="round"
        strokeDasharray={`0 ${particleSpacing}`} strokeDashoffset={-spatialFlowPhase(path.edge.id) * particleSpacing} />)}</g>
    </g>
  </svg>;
}

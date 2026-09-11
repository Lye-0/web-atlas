import { Component, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { compatibleGraph3DCamera, layoutAnalyzerGraph3D, type AnalyzerGraph3D, type Graph3DCamera, type Graph3DPoint } from '../../analyzer/graph3D';
import { presentAnalyzerView } from '../../analyzer/presentation';
import { analyzerEntitySearchDocument, matchAnalyzerSearch } from '../../analyzer/search';
import { prepareAutoAggregation, projectAutoAggregation, projectAggregationRelations, stableAggregationRepresentation, type AggregationProjection, type AutoAggregationResult } from '../../analyzer/autoAggregation';
import type { AnalyzerViewModel, AnalyzerViewSession, AnalyzerViewCounts } from '../../analyzer';
import { SpatialFlowParticles } from './SpatialFlowParticles';
import { AnalyzerGraphControls } from './AnalyzerGraphControls';
import { SpatialRelationLines, type SpatialRelationPath } from './SpatialRelationLines';
import { spatialRelationCurve } from '../../analyzer/spatialRelationPath';
import { graph3DSelectionContext, graph3DRelationColor } from '../../analyzer/graph3DSelection';
import './spatial-label-direction.css';
import { SemanticFlowLegend } from './SemanticFlowLegend';
import { useAnalyzerControlInset } from './useAnalyzerControlInset';
import { SPATIAL_FLOW_SPEED, SPATIAL_FLOW_MAX_FRAME_SECONDS, type SpatialFlowState } from '../../analyzer/spatialFlow';
import { useSpatialFlowMotion } from './useSpatialFlowMotion';
import { useDisposableFrame } from './useDisposableFrame';
import { initializeSemanticCanvas } from './semanticCanvasLifecycle';
import { recoverableWebGLRenderer } from './recoverableWebGLRenderer';
import { registerCanvasDisposal, useCanvasDisposals } from './canvasDisposals';
import { AutoAggregationPanel, type AggregationInspection, type AggregationGroupMode } from './AutoAggregationPanel';
import './analyzer-graph-3d.css';

interface Props {
  model: AnalyzerViewModel; state: AnalyzerViewSession; input: string; onMode: (mode: '2d' | '3d') => void;
  onCamera: (camera: Graph3DCamera) => void; onUnavailable: () => void;
  onSelectNode: (id: string) => void; onSelectRegion: (id: string) => void; onSelectEdge: (id: string) => void; onClear: () => void;
  onTogglePresentation: (id: string) => void;
  focusRequest?: { entityId: string; entityIds?: string[]; nonce: number };
  autoAggregation: boolean; onAutoAggregation: (value: boolean) => void;
  showGroupBounds: boolean; onGroupBounds: (value: boolean) => void;
  onAggregation: (state: NonNullable<AnalyzerViewSession['graph3DAggregation']>) => void;
  onCounts: (counts: AnalyzerViewCounts) => void;
  isFullscreen: boolean; onFullscreen: () => void;
}
interface DisplayPoint { id: string; x: number; y: number; z: number; label: string; subtitle?: string; panel: boolean; original?: Graph3DPoint; groupId?: string }
interface DisplayEdge { id: string; source: string; target: string; label: string; color: string; active: boolean; animate: boolean; aggregated: boolean; intensity: number }
interface ScreenPoint { id: string; x: number; y: number; depth: number; width: number; height: number; labelX: number; labelY: number; visible: boolean; labelled: boolean; panel: boolean }
interface ScreenEdge { path: string; source: string; target: string; id: string; a: [number, number]; b: [number, number]; color: string; label: string; active: boolean; aggregated: boolean }
interface ScreenRegion { id: string; x: number; y: number; label: string; group?: boolean }
interface Projection { points: ScreenPoint[]; edges: ScreenEdge[]; regions: ScreenRegion[] }
interface CameraCommand { nonce: number; ids?: string[]; action?: 'fit' | 'reset' | 'in' | 'out' }
const emptyProjection: Projection = { points: [], edges: [], regions: [] };

/** All endpoint clipping is camera dependent; canonical XYZ positions never move. */
function panelPort(a: ScreenPoint, b: ScreenPoint): [number, number] {
  if (!a.panel) return [a.x, a.y];
  const dx = b.x - a.x, dy = b.y - a.y;
  if (Math.hypot(dx, dy) < .001) return [a.x, a.y];
  const factor = Math.min((a.width / 2 + 2) / Math.max(.001, Math.abs(dx)), (a.height / 2 + 2) / Math.max(.001, Math.abs(dy)), .48);
  return [a.x + dx * factor, a.y + dy * factor];
}

function Scene({ graph, points, edges, selected, priority, hovered, showGroupBounds, selectedRegionId, command, savedCamera, input, motion, onCamera, onProjection, onDensity, onUnavailable, onBlank, onPoint, onHover, disposals, overlayTop }: {
  graph: AnalyzerGraph3D; points: DisplayPoint[]; edges: DisplayEdge[]; selected: ReadonlySet<string>; priority: ReadonlySet<string>; hovered?: string;
  selectedRegionId?: string; showGroupBounds: boolean; command: CameraCommand; savedCamera?: Graph3DCamera; input: string;
  motion: ReturnType<typeof useSpatialFlowMotion>; onCamera: Props['onCamera']; onProjection: (projection: Projection) => void;
  onDensity: (projection: AggregationProjection) => void; onUnavailable: () => void; onBlank: () => void; onPoint: (id: string) => void; onHover: (id?: string) => void; disposals: Set<() => void>; overlayTop: number;
}) {
  const { camera, gl, size, invalidate } = useThree();
  const controls = useRef<OrbitControls | null>(null), dirty = useRef(true), initialized = useRef(false), initialCamera = useRef(savedCamera);
  const callbacks = useRef({ onCamera, onProjection, onDensity, onUnavailable, onBlank, onPoint, onHover });
  useLayoutEffect(() => { callbacks.current = { onCamera, onProjection, onDensity, onUnavailable, onBlank, onPoint, onHover }; });
  const hitPoints = useRef<ScreenPoint[]>([]);
  const [renderPaths, setRenderPaths] = useState<(SpatialRelationPath & { animate: boolean })[]>([]);
  const particlePaths = useMemo(() => renderPaths.filter(path => path.animate), [renderPaths]);
  const stateRef = useRef<SpatialFlowState>({ active: false, reduced: false, distance: 0 });
  const cameraRef = useRef({ scale: 1, viewportWidth: size.width, viewportHeight: size.height });
  const publishDensity = useCallback(() => {
    camera.updateMatrixWorld();
    callbacks.current.onDensity({ matrix: new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).toArray(), width: size.width, height: size.height, zoom: (camera as THREE.OrthographicCamera).zoom });
  }, [camera, size.width, size.height]);
  const save = useRef(() => {});
  useLayoutEffect(() => { save.current = () => {
    if (!controls.current) return;
    callbacks.current.onCamera({ schema: 1, view: graph.source.view, input, position: camera.position.toArray(), target: controls.current.target.toArray(), zoom: (camera as THREE.OrthographicCamera).zoom });
    publishDensity();
  }; }, [camera, graph.source.view, input, publishDensity]);
  useEffect(() => {
    const control = new OrbitControls(camera, gl.domElement); controls.current = control;
    control.enableDamping = false; control.screenSpacePanning = true; control.minZoom = .00001; control.maxZoom = 8;
    control.mouseButtons.LEFT = THREE.MOUSE.ROTATE; control.mouseButtons.RIGHT = THREE.MOUSE.PAN;
    gl.domElement.tabIndex = 0; gl.domElement.setAttribute('aria-label', '3Dグラフ。ドラッグで回転、右ドラッグで移動、ホイールでズーム');
    control.listenToKeyEvents(gl.domElement);
    const change = () => { dirty.current = true; invalidate(); }, end = () => save.current();
    const lost = (event: Event) => { event.preventDefault(); callbacks.current.onUnavailable(); };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') callbacks.current.onBlank(); if (event.key.startsWith('Arrow')) save.current(); };
    let down = { x: 0, y: 0, time: 0 };
    const pointerDown = (event: PointerEvent) => { down = { x: event.clientX, y: event.clientY, time: performance.now() }; };
    const hit = (event: PointerEvent) => {
      const rect = gl.domElement.getBoundingClientRect(), x = event.clientX - rect.left, y = event.clientY - rect.top;
      let best: ScreenPoint | undefined, distance = 13;
      for (const point of hitPoints.current) { const d = Math.hypot(point.x - x, point.y - y); if (point.visible && d < distance) { best = point; distance = d; } }
      return best?.id;
    };
    const pointerUp = (event: PointerEvent) => { if (event.button === 0 && Math.hypot(event.clientX - down.x, event.clientY - down.y) < 4 && performance.now() - down.time < 500) { const id = hit(event); if (id) callbacks.current.onPoint(id); else callbacks.current.onBlank(); } };
    const pointerMove = (event: PointerEvent) => { if (!event.buttons) callbacks.current.onHover(hit(event)); };
    control.addEventListener('change', change); control.addEventListener('end', end);
    gl.domElement.addEventListener('webglcontextlost', lost); gl.domElement.addEventListener('keydown', key);
    gl.domElement.addEventListener('pointerdown', pointerDown); gl.domElement.addEventListener('pointerup', pointerUp);
    gl.domElement.addEventListener('pointermove', pointerMove);
    return registerCanvasDisposal(disposals, () => {
      control.removeEventListener('change', change); control.removeEventListener('end', end); control.dispose(); controls.current = null;
      gl.domElement.removeEventListener('webglcontextlost', lost); gl.domElement.removeEventListener('keydown', key);
      gl.domElement.removeEventListener('pointerdown', pointerDown); gl.domElement.removeEventListener('pointerup', pointerUp);
      gl.domElement.removeEventListener('pointermove', pointerMove); hitPoints.current = [];
    });
  }, [camera, gl, invalidate, disposals]);
  useLayoutEffect(() => {
    const ortho = camera as THREE.OrthographicCamera;
    ortho.left = -size.width / 2; ortho.right = size.width / 2; ortho.top = size.height / 2; ortho.bottom = -size.height / 2;
    ortho.near = .1; ortho.far = 1000000; ortho.updateProjectionMatrix(); dirty.current = true; invalidate();
    if (initialized.current) publishDensity();
  }, [camera, size.width, size.height, invalidate, publishDensity]);
  const fit = useCallback((ids?: string[], reset = false) => {
    const control = controls.current; if (!control) return;
    const wanted = new Set(ids), currentIds = new Set(points.map(point => point.id));
    const targets = ids?.length ? graph.points.filter(point => wanted.has(point.id) || graph.regions.some(region => wanted.has(region.original.id) && region.memberIds.includes(point.id)))
      : graph.source.view === 'command' ? graph.points.filter(point => currentIds.has(point.id)) : graph.points;
    if (!targets.length) return;
    const box = new THREE.Box3().setFromPoints(targets.map(point => new THREE.Vector3(point.x, point.y, point.z)));
    if (!ids) for (const region of graph.regions) {
      box.expandByPoint(new THREE.Vector3(...region.center).add(new THREE.Vector3(...region.size).multiplyScalar(.5)));
      box.expandByPoint(new THREE.Vector3(...region.center).sub(new THREE.Vector3(...region.size).multiplyScalar(.5)));
    }
    const center = box.getCenter(new THREE.Vector3()), extent = box.getSize(new THREE.Vector3());
    const direction = reset ? new THREE.Vector3(.38, .24, 1).normalize() : camera.position.clone().sub(control.target).normalize();
    control.target.copy(center); camera.position.copy(center).addScaledVector(direction, Math.max(10000, extent.length() * 3));
    camera.lookAt(center); camera.updateMatrixWorld();
    const inverse = camera.matrixWorldInverse, corners: THREE.Vector3[] = [];
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) corners.push(new THREE.Vector3(x, y, z).applyMatrix4(inverse));
    const projected = new THREE.Box3().setFromPoints(corners).getSize(new THREE.Vector3());
    (camera as THREE.OrthographicCamera).zoom = Math.min(2, Math.max(.00001, Math.min(Math.max(100, size.width - 140) / Math.max(160, projected.x), Math.max(100, size.height - 190) / Math.max(100, projected.y)) * .9));
    camera.updateProjectionMatrix(); control.update(); dirty.current = true; invalidate(); save.current();
  }, [camera, graph, points, size.width, size.height, invalidate]);
  useEffect(() => {
    if (initialized.current || !controls.current) return;
    initialized.current = true;
    const saved = initialCamera.current;
    if (compatibleGraph3DCamera(saved, graph.source, input)) {
      camera.position.fromArray(saved.position); controls.current.target.fromArray(saved.target); (camera as THREE.OrthographicCamera).zoom = saved.zoom;
      camera.updateProjectionMatrix(); controls.current.update(); dirty.current = true; invalidate(); publishDensity();
    } else fit(undefined, true);
  }, [camera, graph.source, input, fit, invalidate, publishDensity]);
  const lastCommand = useRef(command.nonce);
  useEffect(() => { if (lastCommand.current !== command.nonce) {
    lastCommand.current = command.nonce;
    if (command.action === 'in' || command.action === 'out') {
      const ortho = camera as THREE.OrthographicCamera; ortho.zoom = THREE.MathUtils.clamp(ortho.zoom * (command.action === 'in' ? 1.25 : .8), .00001, 8);
      ortho.updateProjectionMatrix(); dirty.current = true; invalidate(); save.current();
    } else fit(command.ids, command.action === 'reset');
  } }, [command, fit, camera, invalidate]);
  useEffect(() => { dirty.current = true; invalidate(); }, [points, edges, selected, priority, hovered, showGroupBounds, selectedRegionId, invalidate, overlayTop]);
  useEffect(() => { stateRef.current.active = motion.enabled && motion.visible && particlePaths.length > 0; stateRef.current.reduced = motion.reduced; invalidate(); }, [motion.enabled, motion.visible, motion.reduced, particlePaths.length, invalidate]);
  const assets = useMemo(() => {
    const vertices: number[] = [], colors: number[] = [], sizes: number[] = [], hollow: number[] = [];
    for (const point of points) if (!point.panel) {
      const inHoveredRegion = graph.regions.some(region => region.original.id === hovered && region.memberIds.includes(point.id)) || graph.groups.some(group => group.id === hovered && (group.memberIds.includes(point.id) || point.groupId === group.id));
      vertices.push(point.x, point.y, point.z); colors.push(...new THREE.Color(selected.has(point.id) || inHoveredRegion ? '#cefff1' : point.groupId ? '#edcc94' : priority.has(point.id) ? '#9bccd2' : '#7caa9a').toArray());
      sizes.push(point.groupId ? 13 : selected.has(point.id) ? 11 : point.original?.original.type === 'workspace-package' ? 10 : point.original?.original.type === 'external-package' ? 6 : 8);
      hollow.push(point.groupId ? 1 : 0);
    }
    for (const region of graph.regions) if (edges.some(edge => edge.source === region.original.id || edge.target === region.original.id)) {
      vertices.push(...region.center); colors.push(...new THREE.Color(selectedRegionId === region.original.id || hovered === region.original.id ? '#cefff1' : '#7caa9a').toArray());
      sizes.push(selectedRegionId === region.original.id ? 11 : 8); hollow.push(0);
    }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('pointSize', new THREE.Float32BufferAttribute(sizes, 1)); geometry.setAttribute('hollowPoint', new THREE.Float32BufferAttribute(hollow, 1));
    const material = new THREE.ShaderMaterial({ vertexColors: true, transparent: true, depthWrite: false,
      uniforms: { pixelRatio: { value: gl.getPixelRatio() } },
      vertexShader: 'uniform float pixelRatio; attribute float pointSize; attribute float hollowPoint; varying vec3 tint; varying float hollow; void main(){tint=color;hollow=hollowPoint;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_PointSize=pointSize*pixelRatio;}',
      fragmentShader: 'varying vec3 tint;varying float hollow;void main(){float d=length(gl_PointCoord-.5)*2.;if(d>1.)discard;gl_FragColor=vec4(tint,(1.-smoothstep(.6,1.,d))*mix(1.,smoothstep(.28,.48,d),hollow));\n#include <colorspace_fragment>\n}' });
    const object = new THREE.Points(geometry, material); object.frustumCulled = false; object.renderOrder = 3;
    return { geometry, material, object };
  }, [points, selected, priority, hovered, graph.regions, graph.groups, edges, selectedRegionId, gl]);
  useEffect(() => () => { assets.geometry.dispose(); assets.material.dispose(); }, [assets]);
  const shownRegions = useMemo(() => graph.regions.filter(region => {
    if (!showGroupBounds) return false;
    const focus = graph.regions.find(item => item.original.id === (hovered ?? selectedRegionId));
    return !region.original.parentRegionId || (region.original.depth ?? 0) < 2 || region.original.id === hovered || region.original.id === selectedRegionId
      || region.memberIds.some(id => selected.has(id)) || Boolean(focus && focus.memberIds.some(id => region.memberIds.includes(id)));
  }), [graph.regions, showGroupBounds, hovered, selectedRegionId, selected]);
  const shownBoundaries = useMemo(() => {
    const regions = shownRegions.map(region => ({ id: region.original.id, label: region.original.label, center: region.center, size: region.size, depth: region.original.depth ?? 0, group: false }));
    if (graph.source.view !== 'dependencies' || !showGroupBounds) return regions;
    return [...regions, ...graph.groups.map(group => {
      const members = new Set(group.memberIds), points = graph.points.filter(point => members.has(point.id));
      const box = new THREE.Box3().setFromPoints(points.map(point => new THREE.Vector3(point.x, point.y, point.z)));
      return { id: group.id, label: group.label, center: box.getCenter(new THREE.Vector3()).toArray(), size: box.getSize(new THREE.Vector3()).addScalar(60).toArray(), depth: 0, group: true };
    })];
  }, [graph, shownRegions, showGroupBounds]);
  const bounds = useMemo(() => {
    const vertices: number[] = [], colors: number[] = [];
    for (const region of shownBoundaries) {
      const corners = Array.from({ length: 8 }, (_, index) => region.center.map((v, axis) => v + (index & (1 << axis) ? 1 : -1) * region.size[axis]! / 2));
      const active = region.id === hovered || region.id === selectedRegionId;
      const color = new THREE.Color(active ? '#ade1ca' : '#65897c').multiplyScalar(active ? .85 : Math.pow(.78, region.depth) * .4).toArray();
      for (let index = 0; index < 8; index++) for (let axis = 0; axis < 3; axis++) if (!(index & (1 << axis))) { vertices.push(...corners[index]!, ...corners[index | (1 << axis)]!); colors.push(...color, ...color); }
    }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const material = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: .8, depthWrite: false });
    const object = new THREE.LineSegments(geometry, material); object.frustumCulled = false; return { geometry, material, object };
  }, [shownBoundaries, hovered, selectedRegionId]);
  useEffect(() => () => { bounds.geometry.dispose(); bounds.material.dispose(); }, [bounds]);
  useDisposableFrame((_, delta) => {
    const ortho = camera as THREE.OrthographicCamera;
    cameraRef.current = { scale: ortho.zoom, viewportWidth: size.width, viewportHeight: size.height };
    if (dirty.current) {
      dirty.current = false; camera.updateMatrixWorld();
      const screen = (x: number, y: number, z: number) => { const p = new THREE.Vector3(x, y, z).project(camera); return { x: (p.x + 1) * size.width / 2, y: (1 - p.y) * size.height / 2, depth: p.z }; };
      const projected: ScreenPoint[] = points.map(point => {
        const p = screen(point.x, point.y, point.z), panelScale = Math.min(1.25, ortho.zoom), width = point.panel ? 166 * panelScale : 10, height = point.panel ? 54 * panelScale : 10;
        return { ...p, id: point.id, width, height, panel: point.panel, labelX: p.x + (point.panel ? -width / 2 : 12), labelY: p.y + (point.panel ? -height / 2 : -12), visible: p.depth >= -1 && p.depth <= 1 && p.x > -width && p.x < size.width + width && p.y > -height && p.y < size.height + height, labelled: point.panel };
      });
      const byId = new Map(projected.map(point => [point.id, point]));
      const previousHovered = hitPoints.current.find(point => point.id === hovered && point.labelled && !point.panel);
      hitPoints.current = projected;
      for (const region of graph.regions) { const p = screen(...region.center); byId.set(region.original.id, { ...p, id: region.original.id, width: 8, height: 8, panel: false, labelX: p.x, labelY: p.y, visible: true, labelled: false }); }
      hitPoints.current = [...projected, ...graph.regions.filter(region => edges.some(edge => edge.source === region.original.id || edge.target === region.original.id)).map(region => byId.get(region.original.id)!)];
      const occupied: { x: number; y: number; w: number; h: number }[] = projected.filter(p => p.visible && p.labelled).map(p => ({ x: p.labelX, y: p.labelY, w: p.width, h: p.height }));
      // Hover must not move its own hit target: reprioritizing a label under a
      // stationary pointer otherwise alternates enter/leave and rebuilds the
      // particle material every frame. Camera movement still reprojects it.
      const hoveredPoint = previousHovered && byId.get(previousHovered.id);
      if (hoveredPoint?.visible && hoveredPoint.x === previousHovered!.x && hoveredPoint.y === previousHovered!.y
        && previousHovered!.labelY >= overlayTop && previousHovered!.labelX >= 4
        && previousHovered!.labelX + 146 <= size.width - 4 && previousHovered!.labelY + (selected.has(previousHovered!.id) ? 40 : 24) <= size.height - 30) {
        hoveredPoint.labelX = previousHovered!.labelX; hoveredPoint.labelY = previousHovered!.labelY; hoveredPoint.labelled = true;
        occupied.push({ x: hoveredPoint.labelX, y: hoveredPoint.labelY, w: 146, h: selected.has(hoveredPoint.id) ? 40 : 24 });
      }
      const criticalCells = new Map<string, ScreenPoint[]>();
      for (const point of projected) if (priority.has(point.id) || selected.has(point.id)) {
        const key = `${Math.floor(point.x / 40)}:${Math.floor(point.y / 40)}`, cell = criticalCells.get(key) ?? [];
        cell.push(point); criticalCells.set(key, cell);
      }
      const coversEndpoint = (id: string, x: number, y: number, w: number, h: number) => {
        for (let cx = Math.floor((x - 12) / 40); cx <= Math.floor((x + w + 12) / 40); cx++) for (let cy = Math.floor((y - 12) / 40); cy <= Math.floor((y + h + 12) / 40); cy++) {
          if (criticalCells.get(`${cx}:${cy}`)?.some(other => other.id !== id && other.x > x - 12 && other.x < x + w + 12 && other.y > y - 12 && other.y < y + h + 12)) return true;
        }
        return false;
      };
      const order = [...projected].filter(p => p.visible && !p.labelled).sort((a, b) => Number(selected.has(b.id) || hovered === b.id) - Number(selected.has(a.id) || hovered === a.id) || Number(priority.has(b.id)) - Number(priority.has(a.id)) || a.id.localeCompare(b.id));
      for (const p of order) {
        if (occupied.length >= 120 && !selected.has(p.id) && p.id !== hovered) continue;
        const candidates = [[12, -12], [12, 12], [-158, -12], [-70, -36], [-70, 20]];
        for (const [dx, dy] of candidates) {
          const x = p.x + dx!, y = p.y + dy!, w = 146, h = selected.has(p.id) ? 40 : 24;
          if (x < 4 || x + w > size.width - 4 || y < overlayTop || y + h > size.height - 30) continue;
          if (occupied.some(r => x < r.x + r.w + 4 && x + w + 4 > r.x && y < r.y + r.h + 4 && y + h + 4 > r.y)) continue;
          if (coversEndpoint(p.id, x, y, w, h)) continue;
          p.labelX = x; p.labelY = y; p.labelled = true; occupied.push({ x, y, w, h }); break;
        }
      }
      const paths: (SpatialRelationPath & { animate: boolean })[] = [], screenEdges: ScreenEdge[] = [];
      const pairs = new Map<string, DisplayEdge[]>();
      for (const edge of edges) { const key = JSON.stringify([edge.source, edge.target].sort()), pair = pairs.get(key) ?? []; pair.push(edge); pairs.set(key, pair); }
      for (const edge of edges) {
        const source = byId.get(edge.source), target = byId.get(edge.target); if (!source || !target || source.depth < -1 || source.depth > 1 || target.depth < -1 || target.depth > 1) continue;
        const a = panelPort(source, target), b = panelPort(target, source);
        const world = (p: [number, number], z: number) => new THREE.Vector3(p[0] / size.width * 2 - 1, 1 - p[1] / size.height * 2, z).unproject(camera);
        const pair = pairs.get(JSON.stringify([edge.source, edge.target].sort()))!, index = pair.indexOf(edge);
        const spacing = Math.min(32, 80 / Math.max(1, pair.length - 1));
        const bend = pair.length > 1 ? (index - (pair.length - 1) / 2 + (pair.length % 2 ? .25 : 0)) * spacing * (edge.source.localeCompare(edge.target) > 0 ? -1 : 1) : undefined;
        const curve = spatialRelationCurve(world(a, source.depth), world(b, target.depth), bend, '3d');
        const screenPoints = curve.points.map(point => screen(point.x, point.y, point.z));
        screenEdges.push({ id: edge.id, source: edge.source, target: edge.target, a, b, path: screenPoints.map((point, i) => (i ? 'L' : 'M') + point.x + ',' + point.y).join(' '), color: edge.color, label: edge.label, active: edge.active, aggregated: edge.aggregated });
        paths.push({ id: edge.id, color: edge.color, points: curve.points, intensity: edge.intensity, animate: edge.animate });
      }
      const regionLabels = shownBoundaries.map(region => { const p = screen(region.center[0], region.center[1] + region.size[1] / 2, region.center[2]); return { id: region.id, x: p.x, y: p.y, label: region.label, depth: p.depth, group: region.group }; }).filter(p => p.depth >= -1 && p.depth <= 1 && p.x >= 0 && p.x <= size.width && p.y > overlayTop && p.y < size.height - 25);
      callbacks.current.onProjection({ points: projected, edges: screenEdges, regions: regionLabels }); setRenderPaths(paths);
    }
    if (stateRef.current.active) { stateRef.current.distance += Math.min(delta, SPATIAL_FLOW_MAX_FRAME_SECONDS) * SPATIAL_FLOW_SPEED; invalidate(); }
  });
  return <><color attach="background" args={['#050c09']} /><SpatialRelationLines paths={renderPaths} /><primitive object={assets.object} /><primitive object={bounds.object} /><SpatialFlowParticles paths={particlePaths} stateRef={stateRef} cameraRef={cameraRef} active={motion.enabled && motion.visible} /></>;
}

class CanvasBoundary extends Component<{ children: ReactNode; onUnavailable: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onUnavailable(); }
  render() { return this.state.failed ? null : this.props.children; }
}

export function AnalyzerGraph3DStage(props: Props) {
  const { model, state } = props, graph = useMemo(() => layoutAnalyzerGraph3D(model), [model]);
  const [stage, setStage] = useState<HTMLDivElement | null>(null), motion = useSpatialFlowMotion(stage);
  const [overlayTop, setOverlayTop] = useState(90);
  useAnalyzerControlInset(stage, setOverlayTop);
  const disposals = useCanvasDisposals();
  const [projection, setProjection] = useState<Projection>(emptyProjection), [density, setDensity] = useState<AggregationProjection>({ width: 1000, height: 600, zoom: 1 });
  const [hovered, setHovered] = useState<string>(), [inspection, setInspection] = useState<AggregationInspection>();
  const [command, setCommand] = useState<CameraCommand>({ nonce: 0 });
  const [help, setHelp] = useState(false);
  const selected = useMemo(() => new Set([state.selectedNodeId].filter((id): id is string => Boolean(id))), [state.selectedNodeId]);
  const expanded = useMemo(() => new Set(state.graph3DAggregation?.expandedGroupIds ?? []), [state.graph3DAggregation]);
  const collapsed = useMemo(() => new Set(state.graph3DAggregation?.collapsedGroupIds ?? []), [state.graph3DAggregation]);
  const { filter, expandedPresentationIds, selectedEdgeId, selectedNodeId, selectedRegionId } = state;
  const commandPresentation = useMemo(() => model.view === 'command' ? presentAnalyzerView(model, { filter, expandedPresentationIds, selectedEdgeId, selectedNodeId, selectedRegionId, search: '' }).nodes : undefined,
    [model, filter, expandedPresentationIds, selectedEdgeId, selectedNodeId, selectedRegionId]);
  const shownIds = useMemo(() => {
    const logical = commandPresentation ?? model.nodes;
    return new Set(logical.filter(node => filter === 'all' || node.type === filter).map(node => node.id));
  }, [model, filter, commandPresentation]);
  const points = useMemo(() => graph.points.filter(point => shownIds.has(point.id)), [graph, shownIds]);
  const matchIds = useMemo(() => new Set(points.filter(point => state.search.trim() && matchAnalyzerSearch(analyzerEntitySearchDocument(point.original), state.search)).map(point => point.id)), [points, state.search]);
  const regionMembers = useMemo(() => new Set(graph.regions.find(region => region.original.id === state.selectedRegionId)?.memberIds ?? []), [graph.regions, state.selectedRegionId]);
  const selectionContext = useMemo(() => graph3DSelectionContext(graph, { selectedNodeId, selectedRegionId, selectedEdgeId }), [graph, selectedNodeId, selectedRegionId, selectedEdgeId]);
  const relevantEdges = selectionContext.edges;
  const protectedIds = useMemo(() => new Set([...selected, ...relevantEdges.flatMap(edge => [edge.sourceId, edge.targetId]), ...hovered ? [hovered] : []]), [selected, relevantEdges, hovered]);
  const groups = useMemo(() => graph.groups.map(group => ({ ...group, memberIds: group.memberIds.filter(id => shownIds.has(id)) })).filter(group => group.memberIds.length), [graph.groups, shownIds]);
  const prepared = useMemo(() => prepareAutoAggregation(points, groups), [points, groups]);
  const previousAggregation = useRef<AutoAggregationResult | undefined>(undefined);
  const aggregation = useMemo(() => stableAggregationRepresentation(projectAutoAggregation({ points, groups, prepared, enabled: props.autoAggregation, protectedIds, expandedGroupIds: expanded, manualGroups: groups.filter(group => collapsed.has(group.id)), projection: density, matchIds, previousActiveGroupIds: previousAggregation.current?.activeGroupIds, retainOffscreen: true }), previousAggregation.current), [points, groups, prepared, props.autoAggregation, protectedIds, expanded, collapsed, density, matchIds]);
  useEffect(() => { previousAggregation.current = aggregation; }, [aggregation]);
  const displayPoints = useMemo<DisplayPoint[]>(() => [...points.filter(point => aggregation.individualIds.has(point.id)).map(point => ({ ...point, original: point, label: point.original.label, subtitle: point.original.subtitle, panel: false })),
    ...aggregation.aggregates.map(group => ({ ...group, label: `${group.label} · ${group.memberIds.length}`, panel: false }))], [points, aggregation]);
  const originals = useMemo(() => graph.edges.map(original => ({ id: original.id, source: original.sourceId, target: original.targetId, kind: original.kind, confidence: '', label: original.label, evidenceCount: new Set(original.evidenceIds).size, original })), [graph.edges]);
  const owners = useMemo(() => {
    const result = new Map([...aggregation.ownerById, ...graph.regions.map(region => [region.original.id, region.original.id] as const)]);
    if (model.view === 'command') {
      const byId = new Map(model.nodes.map(node => [node.id, node]));
      for (const node of model.nodes) if (!result.has(node.id)) {
        let parentId = node.presentation?.parentId; const visited = new Set<string>();
        while (parentId && !visited.has(parentId)) { visited.add(parentId); if (shownIds.has(parentId)) { result.set(node.id, parentId); break; } parentId = byId.get(parentId)?.presentation?.parentId; }
      }
    }
    return result;
  }, [aggregation.ownerById, graph.regions, model, shownIds]);
  const relations = useMemo(() => projectAggregationRelations(originals, owners), [originals, owners]);
  const relevantIds = useMemo(() => new Set(relevantEdges.map(edge => edge.id)), [relevantEdges]);
  const connectionRoles = useMemo(() => {
    const roles = new Map<string, Set<'incoming' | 'outgoing'>>();
    const add = (id: string, direction: 'incoming' | 'outgoing') => { const value = roles.get(id) ?? new Set(); value.add(direction); roles.set(id, value); };
    for (const edge of relevantEdges) {
      if (selected.has(edge.sourceId) || regionMembers.has(edge.sourceId)) add(edge.targetId, 'outgoing');
      if (selected.has(edge.targetId) || regionMembers.has(edge.targetId)) add(edge.sourceId, 'incoming');
    }
    return roles;
  }, [relevantEdges, selected, regionMembers]);
  const displayEdges = useMemo<DisplayEdge[]>(() => {
    const active = relations.filter(edge => edge.originals.some(original => relevantIds.has(original.id)));
    const emphasized = new Set(active.filter(edge => edge.id === hovered || edge.source === hovered || edge.target === hovered).map(edge => edge.id));
    return relations.filter(edge => !edge.internal && (model.view !== 'module-dependency' || edge.originals.some(original => relevantIds.has(original.id)))).map(edge => {
      const active = edge.originals.some(original => relevantIds.has(original.id));
      const representative = edge.originals.find(original => relevantIds.has(original.id)) ?? edge.originals[0]!;
      const explicitSelection = edge.originals.some(original => original.id === selectedEdgeId);
      return { id: edge.id, source: edge.source, target: edge.target, label: edge.kind + (edge.aggregated ? ' · ' + edge.originals.length : ''),
        color: active ? graph3DRelationColor(representative.source, representative.target, selectionContext.ids, explicitSelection) : '#496660', active,
        intensity: active ? emphasized.size && !emphasized.has(edge.id) ? .18 : 1 : .45,
        animate: active && (!emphasized.size || emphasized.has(edge.id)), aggregated: edge.aggregated };
    });
  }, [relations, model.view, relevantIds, selectionContext, selectedEdgeId, hovered]);
  const focusRequest = props.focusRequest, onCounts = props.onCounts;
  useEffect(() => { if (focusRequest) setCommand(current => ({ nonce: current.nonce + 1, ids: focusRequest.entityIds ?? [focusRequest.entityId] })); }, [focusRequest]);
  const totalNodes = graph.points.filter(point => point.original.presentation?.role !== 'summary').length;
  const scopeNodes = graph.points.filter(point => point.original.presentation?.role !== 'summary' && (filter === 'all' || point.original.type === filter)).length;
  const visibleNodes = points.filter(point => point.original.presentation?.role !== 'summary' && aggregation.individualIds.has(point.id)).length;
  useEffect(() => { onCounts({ visibleNodes, totalNodes, hiddenNodes: totalNodes - visibleNodes }); }, [visibleNodes, totalNodes, onCounts]);
  const groupMode = (id: string, mode: AggregationGroupMode) => {
    const nextExpanded = new Set(expanded), nextCollapsed = new Set(collapsed); nextExpanded.delete(id); nextCollapsed.delete(id);
    if (mode === 'expanded') nextExpanded.add(id); if (mode === 'collapsed') nextCollapsed.add(id);
    props.onAggregation({ expandedGroupIds: [...nextExpanded], collapsedGroupIds: [...nextCollapsed] });
  };
  const chooseNode = (id: string) => { setInspection(undefined); props.onSelectNode(id); };
  const chooseEdge = (id: string) => { setInspection(undefined); props.onSelectEdge(id); };
  const displayed = new Map(displayPoints.map(point => [point.id, point]));
  const labelledIds = new Set(projection.points.filter(point => point.visible && point.labelled).map(point => point.id));
  const unlabelledConnections = [...new Set(relevantEdges.flatMap(edge => [edge.sourceId, edge.targetId]))].filter(id => graph.points.some(point => point.id === id) && !labelledIds.has(id)).length;
  return <div ref={setStage} className="analyzer-graph-stage analyzer-spatial-graph-stage semantic-flow-stage analyzer-graph-3d" data-view={model.view} data-render-mode="3d">
    <AnalyzerGraphControls mode="3d" onMode={props.onMode}
      onFit={() => setCommand(current => ({ nonce: current.nonce + 1, action: 'fit' }))} onReset={() => setCommand(current => ({ nonce: current.nonce + 1, action: 'reset' }))}
      onZoomIn={() => setCommand(current => ({ nonce: current.nonce + 1, action: 'in' }))} onZoomOut={() => setCommand(current => ({ nonce: current.nonce + 1, action: 'out' }))}
      canFocus={Boolean(state.selectedNodeId || state.selectedRegionId || state.selectedEdgeId)} onFocus={() => setCommand(current => ({ nonce: current.nonce + 1, ids: state.selectedRegionId ? [state.selectedRegionId] : [...protectedIds] }))}
      particleMode={motion.mode} onParticleMode={motion.setMode} showGroupBounds={props.showGroupBounds} onGroupBounds={graph.regions.length || model.view === 'dependencies' ? props.onGroupBounds : undefined}
      autoAggregation={props.autoAggregation} onAutoAggregation={groups.length ? props.onAutoAggregation : undefined}
      isFullscreen={props.isFullscreen} onFullscreen={props.onFullscreen} help={help} onHelp={setHelp} />
    {help && <div className="analyzer-stage-help" role="dialog" aria-label="グラフ操作ヘルプ"><strong>3D全体図</strong><p>ドラッグで回転、右ドラッグで移動。点やラベルから対象を選択できます。ホイールと＋ / −で拡大縮小できます。</p><p>検索結果と「選択へ移動」で対象へ移動します。青は選択対象から出る関係、橙は入る関係です。所属の線は実在する包含関係を示します。</p><button type="button" onClick={() => setHelp(false)}>ヘルプを閉じる</button></div>}
    <CanvasBoundary onUnavailable={props.onUnavailable}><Canvas orthographic frameloop="demand" dpr={[1, 2]} onCreated={initializeSemanticCanvas} gl={defaults => recoverableWebGLRenderer({ ...defaults, antialias: true, alpha: true }, props.onUnavailable)} fallback={<p>3D表示を利用できません。</p>}>
      <Scene graph={graph} points={displayPoints} edges={displayEdges} selected={selected} priority={protectedIds} hovered={hovered} showGroupBounds={props.showGroupBounds} selectedRegionId={state.selectedRegionId}
        command={command} savedCamera={state.graph3DCamera} input={props.input} motion={motion} onCamera={props.onCamera} onProjection={setProjection} onDensity={setDensity} onUnavailable={props.onUnavailable} onBlank={props.onClear}
        onPoint={id => { const point = displayed.get(id); if (point?.groupId) setInspection({ kind: 'group', id: point.groupId }); else if (graph.regions.some(region => region.original.id === id)) props.onSelectRegion(id); else chooseNode(id); }} onHover={setHovered} disposals={disposals} overlayTop={overlayTop} />
    </Canvas></CanvasBoundary>
    <svg className="analyzer-3d-overlay" aria-label="3Dの関係">
      {projection.edges.map(edge => <path key={edge.id} className="analyzer-3d-edge-hit" d={edge.path} fill="none" stroke="transparent" strokeWidth="12" tabIndex={0} role="button" aria-label={edge.label}
        data-edge-id={edge.id} data-source-id={edge.source} data-target-id={edge.target} data-direction-color={edge.color} data-active={edge.active}
        onPointerEnter={() => setHovered(edge.id)} onPointerLeave={() => setHovered(undefined)}
        onClick={() => edge.aggregated ? setInspection({ kind: 'relation', id: edge.id }) : chooseEdge(edge.id)} onKeyDown={event => { if (event.key === 'Enter') { if (edge.aggregated) setInspection({ kind: 'relation', id: edge.id }); else chooseEdge(edge.id); } }}><title>{edge.label}</title></path>)}
    </svg>
    <div className="analyzer-3d-labels">
      {projection.points.filter(point => point.visible).map(point => {
        const item = displayed.get(point.id); if (!item) return null;
        return <div key={point.id}>
          {!item.panel && (point.labelled || selected.has(point.id)) && <button type="button" className={`analyzer-3d-hit${selected.has(point.id) ? ' is-selected' : ''}`} style={{ left: point.x - 10, top: point.y - 10 }} aria-label={item.label} title={item.label} onPointerEnter={() => setHovered(point.id)} onPointerLeave={() => setHovered(undefined)} onClick={() => item.groupId ? setInspection({ kind: 'group', id: item.groupId }) : chooseNode(point.id)} />}
          {point.labelled && <button type="button" className={`${item.panel ? 'analyzer-3d-panel' : 'analyzer-3d-label'}${selected.has(point.id) ? ' is-selected' : ''}${matchIds.has(point.id) ? ' is-match' : ''}`} aria-pressed={selected.has(point.id)} data-flow-role={selected.has(point.id) ? 'selected' : connectionRoles.has(point.id) ? connectionRoles.get(point.id)!.size > 1 ? 'both' : connectionRoles.get(point.id)!.has('outgoing') ? 'outgoing' : 'incoming' : undefined} data-node-id={point.id} data-entity-kind={item.original?.original.presentation?.role === 'summary' ? 'summary' : item.groupId ? 'aggregate' : 'node'} style={{ left: point.labelX, top: point.labelY, ...(item.panel ? { transform: `scale(${point.width / 166})`, transformOrigin: 'top left' } : {}) }} title={[item.label, item.subtitle].filter(Boolean).join('\n')} onPointerEnter={() => setHovered(point.id)} onPointerLeave={() => setHovered(undefined)}
            onClick={() => item.groupId ? setInspection({ kind: 'group', id: item.groupId }) : chooseNode(point.id)} onDoubleClick={() => { if (item.original?.original.presentation?.role === 'summary') props.onTogglePresentation(point.id); }}><strong style={item.panel ? { fontSize: Math.max(11, 12 * point.width / 166) / (point.width / 166), lineHeight: 1.25 } : undefined}>{item.label}</strong>{selected.has(point.id) && <span className="semantic-flow-3d-role">選択中</span>}{item.panel && point.width / 166 >= .75 && <small>{item.subtitle ?? item.original?.original.type}</small>}</button>}
        </div>;
      })}
      {projection.regions.map(region => <button type="button" key={region.id} className="analyzer-3d-region" style={{ left: region.x, top: region.y }} title={region.label} onPointerEnter={() => setHovered(region.id)} onPointerLeave={() => setHovered(undefined)} onFocus={() => setHovered(region.id)} onBlur={() => setHovered(undefined)} onClick={() => { if (region.group) setInspection({ kind: 'group', id: region.id }); else { setInspection(undefined); props.onSelectRegion(region.id); } }}>{region.label}</button>)}
    </div>
    <div className="analyzer-3d-inspection">{unlabelledConnections > 0 && <p className="analyzer-3d-connection-notice">関係の両端 {unlabelledConnections}対象のラベルを省略、または画面外です。詳細の関係一覧・検索から移動できます。</p>}<AutoAggregationPanel enabled={props.autoAggregation} counts={model.view === 'command' ? { ...aggregation.counts, scope: scopeNodes, individual: visibleNodes, manualMembers: scopeNodes - visibleNodes, manualGroups: displayPoints.filter(point => point.original?.original.presentation?.role === 'summary').length } : aggregation.counts} groups={groups} aggregates={aggregation.aggregates} expandedIds={expanded} collapsedIds={collapsed} inspection={inspection} onInspection={setInspection} onGroupMode={groupMode}
      relations={relations} originalRelations={originals} nodeLabel={id => { const node = model.nodes.find(node => node.id === id); return { title: node?.label ?? id, subtitle: node?.subtitle }; }} onSelectNode={chooseNode} onSelectRelation={chooseEdge} totalCount={totalNodes} ownerById={owners} />
      {groups.length > 0 && <details><summary>所属の開閉</summary><ul>{groups.map(group => <li key={group.id}><button type="button" onClick={() => setInspection({ kind: 'group', id: group.id })}>{group.label} · {group.memberIds.length}</button>{graph.regions.some(region => region.original.id === group.id) && <button type="button" aria-label={`${group.label}の領域詳細`} onClick={() => { setInspection(undefined); props.onSelectRegion(group.id); }}>領域詳細</button>}<button type="button" onClick={() => groupMode(group.id, collapsed.has(group.id) ? 'expanded' : 'collapsed')}>{collapsed.has(group.id) ? '展開' : '折りたたむ'}</button></li>)}</ul></details>}
    </div>
    <SemanticFlowLegend view={model.view} />

  </div>;
}

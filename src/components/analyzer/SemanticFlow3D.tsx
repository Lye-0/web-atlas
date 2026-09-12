import { recoverableWebGLRenderer } from './recoverableWebGLRenderer';
import { SpatialRelationLines } from './SpatialRelationLines';
import { Component, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { useDisposableFrame } from './useDisposableFrame';
import { initializeSemanticCanvas } from './semanticCanvasLifecycle';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { AnalyzerViewSession } from '../../analyzer/session';
import { semanticFlowEdgePaths } from '../../analyzer/semantic/flowPresentation';
import { resolveSemanticFlowHover, semanticFlowNodeRoles, semanticFlowNodeRelationKinds, type SemanticFlowHoverHandler, type SemanticFlowHoverTarget } from '../../analyzer/semantic/flowRelationInteraction';
import type { SemanticPosition } from '../../analyzer/semantic/presentation';
import { semanticFlow3DInput } from '../../analyzer/semantic/flow3DInput';
import { projectAutoAggregation, stableAggregationRepresentation, type AutoAggregationResult, type AggregationProjection, type AggregationGroup } from '../../analyzer/autoAggregation';
import { confidenceLabels, type SemanticGraph } from '../../analyzer/semantic/types';
import { AutoAggregationPanel, type AggregationInspection, type AggregationGroupMode } from './AutoAggregationPanel';
import { semanticFlowRegions, semanticRegionIdentity } from '../../analyzer/semantic/flowRegions';
import { explorerRegionIdentity, type SemanticExplorerModel } from '../../analyzer/semantic/semanticExplorer';
import { SPATIAL_FLOW_SPEED, SPATIAL_FLOW_MAX_FRAME_SECONDS, type SpatialFlowState } from '../../analyzer/spatialFlow';
import { SpatialFlowParticles } from './SpatialFlowParticles';
import type { SemanticFlowRenderProps } from './SemanticFlow2D';
import { bindSemanticFlowKeyboard } from './semanticFlowKeyboard';
import { FlowLabelLayer, hitSemanticFlowEdge, hitSemanticFlowPoint, projectSemanticFlowLabels, semanticFlowConnectionNotices, type FlowConnectionNotice, type FlowLabelContent, type FlowLabelObstacle, type FlowLabelPlacement } from './semanticFlowLabels';
import { SemanticFlowLocation } from './SemanticFlowMap';
import { configureSemanticFlowViewport, semanticFlowPlot } from './semanticFlowViewport';
import { semanticFlowRegionWire } from './semanticFlow3DGeometry';
import { semanticNodeDisplays } from './semanticFlowDisplay';
import { registerCanvasDisposal, useCanvasDisposals } from './canvasDisposals';
import './semantic-flow-disclosures.css';
import './semantic-flow-3d-polish.css';
import './spatial-label-direction.css';

type CameraState = NonNullable<AnalyzerViewSession['semanticCamera']>;
interface Props extends SemanticFlowRenderProps { explorer?: SemanticExplorerModel; direction?: 'both' | 'incoming' | 'outgoing'; camera?: CameraState; onCamera: (camera: CameraState) => void; onUnavailable: () => void; onFocusRegion?: (ids: string[]) => void }

function Scene({ graph: sourceGraph, renderGraph, explorer, nodeDisplays: displays, positions, allPositions, onProjection, labelObstacles, direction = 'both', selectedIds, selectedEdgeId, matchIds, command, motion, overlayTop, camera: savedCamera, onCamera, onSelect, onArchitectureNodeClick, onSelectEdge, onClear, onUnavailable, onLabels, onConnections, hoveredIds, onHover, hoverAt, hoverTarget, showGroupBounds = true, autoAggregation = true, explicitPathNodeIds, explicitPathEdgeIds, canvasDisposals }: Props & {
  canvasDisposals: Set<() => void>;
  nodeDisplays: ReturnType<typeof semanticNodeDisplays>;
  positions: SemanticPosition[]; labelObstacles: readonly FlowLabelObstacle[]; onConnections: (notices: FlowConnectionNotice[]) => void;
  onLabels: (labels: FlowLabelPlacement[]) => void; hoveredIds: ReadonlySet<string>; onHover: (id?: string, edgeId?: string) => void; hoverAt: (x: number, y: number) => string | undefined;
  renderGraph: SemanticGraph; allPositions: SemanticPosition[]; onProjection: (projection: AggregationProjection) => void;
}) {
  const graph = renderGraph;
  const { camera, gl, size, invalidate } = useThree();
  const controls = useRef<OrbitControls | null>(null);
  const pointerGesture = useRef({ x: 0, y: 0, moved: false });
  const callbacks = useRef({ onCamera, onSelect, onArchitectureNodeClick, onSelectEdge, onClear, onUnavailable, onLabels, onConnections, onHover, hoverAt });
  useEffect(() => { callbacks.current = { onCamera, onSelect, onArchitectureNodeClick, onSelectEdge, onClear, onUnavailable, onLabels, onConnections, onHover, hoverAt }; }, [onCamera, onSelect, onArchitectureNodeClick, onSelectEdge, onClear, onUnavailable, onLabels, onConnections, onHover, hoverAt]);
  useEffect(() => () => callbacks.current.onLabels([]), []);
  const regions = useMemo(() => semanticFlowRegions(sourceGraph.architectureView?.scopeId ? allPositions.filter(point => !point.node.attributes.architectureContext) : allPositions, '3d', explorer), [allPositions, explorer, sourceGraph.architectureView?.scopeId]);
  const priorityIds = useMemo(() => new Set([...explicitPathNodeIds ?? [], ...(graph.architectureView?.scopeId ? graph.architectureView.detailIds : []),
    ...graph.architectureView?.boundaryRelations.flatMap(edge => [edge.source, edge.target]) ?? [],
    ...graph.edges.filter(edge => edge.id === selectedEdgeId || explicitPathEdgeIds?.has(edge.id)).flatMap(edge => [edge.source, edge.target])]), [graph.edges, graph.architectureView, selectedEdgeId, explicitPathNodeIds, explicitPathEdgeIds]);
  const pathGraph = useMemo(() => ({ ...graph, edges: graph.edges.filter(edge => graph.view === 'architecture-map' ? edge.details?.architectureRelation !== 'internal' : edge.id === selectedEdgeId || selectedIds.has(edge.source) || selectedIds.has(edge.target)
    || explicitPathEdgeIds?.has(edge.id) || edge.provenance?.edges.some(original => original.id === selectedEdgeId || explicitPathEdgeIds?.has(original.id) || selectedIds.has(original.source) || selectedIds.has(original.target))) }), [graph, selectedIds, selectedEdgeId, explicitPathEdgeIds]);
  const paths = useMemo(() => semanticFlowEdgePaths(pathGraph, positions, selectedIds, selectedEdgeId, '3d')
    .filter(path => direction === 'both' || !path.direction || path.direction === 'internal' || path.direction === direction)
    .map(path => !path.selected && explicitPathEdgeIds?.has(path.edge.id) ? { ...path, color: '#83a997' } : path), [pathGraph, positions, selectedIds, selectedEdgeId, direction, explicitPathEdgeIds]);
  const shownGraph = useMemo(() => ({ ...graph, edges: paths.map(path => path.edge) }), [graph, paths]);
  const emphasis = useMemo(() => resolveSemanticFlowHover(shownGraph, selectedIds, selectedEdgeId, hoverTarget), [shownGraph, selectedIds, selectedEdgeId, hoverTarget]);
  const scopeActiveIds = useMemo(() => graph.architectureView?.scopeId ? new Set([...selectedIds, ...hoveredIds, ...explicitPathNodeIds ?? [], ...emphasis.nodeIds,
    ...shownGraph.edges.filter(edge => selectedIds.has(edge.source) || selectedIds.has(edge.target) || edge.id === selectedEdgeId || explicitPathEdgeIds?.has(edge.id)).flatMap(edge => [edge.source, edge.target])]) : undefined,
  [graph.architectureView?.scopeId, selectedIds, hoveredIds, explicitPathNodeIds, emphasis.nodeIds, shownGraph.edges, selectedEdgeId, explicitPathEdgeIds]);
  const roles = useMemo(() => semanticFlowNodeRoles(shownGraph, selectedIds, selectedEdgeId), [shownGraph, selectedIds, selectedEdgeId]);
  const relationKinds = useMemo(() => semanticFlowNodeRelationKinds(shownGraph, selectedIds, selectedEdgeId), [shownGraph, selectedIds, selectedEdgeId]);
  const flowPaths = useMemo(() => paths.filter(path => (graph.view !== 'architecture-map' || path.selected || emphasis.edgeIds.has(path.edge.id)) && (!emphasis.edgeIds.size || emphasis.edgeIds.has(path.edge.id))).map(path => ({ id: path.edge.id, color: path.color, points: path.points })), [paths, emphasis, graph.view]);
  const stateRef = useRef<SpatialFlowState>({ active: false, distance: 0, reduced: false });
  const cameraRef = useRef({ scale: 1, viewportWidth: size.width, viewportHeight: size.height });
  const lastCommand = useRef<number | undefined>(undefined);
  const initialized = useRef(false);
  const initialCamera = useRef(savedCamera);
  const viewportAnchor = useRef(savedCamera?.viewportAnchor);
  const labelDirty = useRef(true);
  const previousLabels = useRef<FlowLabelPlacement[]>([]);
  const plotHeight = semanticFlowPlot(size.width, size.height, overlayTop).height;
  useLayoutEffect(() => {
    // Keep a point under the pointer when selection opens the detail panel.
    // Explicit Fit establishes a new anchor; normal selection never reframes.
    if (sourceGraph.view === 'architecture-map' && !viewportAnchor.current && size.width > 0) viewportAnchor.current = { width: size.width, centerY: semanticFlowPlot(size.width, size.height, overlayTop).centerY };
    configureSemanticFlowViewport(camera as THREE.OrthographicCamera, size.width, size.height, overlayTop, sourceGraph.view === 'architecture-map' ? viewportAnchor.current : undefined);
    labelDirty.current = true; invalidate();
  }, [camera, size.width, size.height, overlayTop, invalidate, sourceGraph.view]);
  useEffect(() => { labelDirty.current = true; invalidate(); }, [positions, selectedIds, matchIds, selectedEdgeId, hoveredIds, emphasis, roles, displays, size, overlayTop, labelObstacles, autoAggregation, scopeActiveIds, invalidate]);
  useEffect(() => {
    stateRef.current.active = motion.enabled && motion.visible && flowPaths.length > 0;
    stateRef.current.reduced = motion.reduced; invalidate();
  }, [motion.enabled, motion.visible, motion.reduced, flowPaths, invalidate]);
  const connected = useMemo(() => new Set(paths.flatMap(path => [path.edge.source, path.edge.target])), [paths]);
  const nodeAsset = useMemo(() => {
    const vertices: number[] = [], colors: number[] = [], sizes: number[] = [], aggregatePoints: number[] = [];
    positions.forEach(point => {
      vertices.push(point.x, point.y, point.z);
      const selected = selectedIds.has(point.node.id), matching = matchIds.has(point.node.id);
      const aggregate = point.node.attributes.displayAggregate === true || point.node.attributes.architectureRequestGroup === true;
      const color = new THREE.Color(aggregate ? '#edcc94' : selected ? '#c0e9dc' : matching ? '#edcc94' : emphasis.nodeIds.has(point.node.id) ? '#d3e9e0' : connected.has(point.node.id) ? '#8db7b4' : '#698d81');
      if (emphasis.edgeIds.size && !emphasis.nodeIds.has(point.node.id)) color.multiplyScalar(.38);
      if (autoAggregation && (selectedIds.size || selectedEdgeId || explicitPathNodeIds?.size) && !selected && !matching && !connected.has(point.node.id) && !hoveredIds.has(point.node.id)) color.multiplyScalar(.68);
      colors.push(...color.toArray());
      sizes.push(aggregate ? 12 : selected ? 13 : matching ? 8 : connected.has(point.node.id) ? 7 : 5);
      aggregatePoints.push(aggregate ? 1 : 0);
    });
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geometry.setAttribute('nodeSize', new THREE.Float32BufferAttribute(sizes, 1)); geometry.setAttribute('aggregatePoint', new THREE.Float32BufferAttribute(aggregatePoints, 1));
    const material = new THREE.ShaderMaterial({ vertexColors: true, transparent: true, depthWrite: false,
      uniforms: { zoom: { value: 1 }, pixelRatio: { value: gl.getPixelRatio() } },
      vertexShader: 'attribute float nodeSize; attribute float aggregatePoint; uniform float zoom; uniform float pixelRatio; varying vec3 tint; varying float hollow; void main(){ tint=color; hollow=aggregatePoint; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); gl_PointSize=nodeSize*pixelRatio*clamp(sqrt(zoom),.85,2.); }',
      fragmentShader: 'varying vec3 tint; varying float hollow; void main(){float d=length(gl_PointCoord-.5)*2.; if(d>1.)discard; gl_FragColor=vec4(tint,(1.-smoothstep(.65,1.,d))*mix(1.,smoothstep(.28,.48,d),hollow));\n#include <colorspace_fragment>\n}' });
    const object = new THREE.Points(geometry, material); object.frustumCulled = false; object.renderOrder = 3;
    return { object, geometry, material };
  }, [positions, selectedIds, selectedEdgeId, matchIds, connected, emphasis, gl, autoAggregation, explicitPathNodeIds, hoveredIds]);
  useEffect(() => () => { nodeAsset.geometry.dispose(); nodeAsset.material.dispose(); }, [nodeAsset]);
  const linePaths = useMemo(() => paths.map(path => ({ id: path.edge.id, points: path.points, color: path.color, intensity: emphasis.edgeIds.size && !emphasis.edgeIds.has(path.edge.id) ? explicitPathEdgeIds?.has(path.edge.id) ? .7 : .18 : 1 })), [paths, emphasis, explicitPathEdgeIds]);
  const boundaryAsset = useMemo(() => {
    const vertices = regions.flatMap(region => semanticFlowRegionWire(region).flatMap(point => [point.x, point.y, point.z]));
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    const material = new THREE.LineBasicMaterial({ color: '#82958b', transparent: true, opacity: .17, depthWrite: false });
    const object = new THREE.LineSegments(geometry, material); object.frustumCulled = false; object.renderOrder = -1;
    return { object, geometry, material };
  }, [regions]);
  useEffect(() => () => { boundaryAsset.geometry.dispose(); boundaryAsset.material.dispose(); }, [boundaryAsset]);
  const publishProjection = useCallback(() => {
    camera.updateMatrixWorld();
    onProjection({ matrix: new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).toArray(), width: size.width, height: size.height, zoom: (camera as THREE.OrthographicCamera).zoom });
  }, [camera, onProjection, size.width, size.height]);
  useLayoutEffect(() => { if (initialized.current) publishProjection(); }, [publishProjection, overlayTop]);
  const save = useCallback(() => {
    const control = controls.current; if (!control) return;
    callbacks.current.onCamera({ position: camera.position.toArray(), target: control.target.toArray(), zoom: (camera as THREE.OrthographicCamera).zoom, ...(sourceGraph.view === 'architecture-map' ? { viewportAnchor: viewportAnchor.current } : {}) });
    publishProjection();
  }, [camera, publishProjection, sourceGraph.view]);
  // Resizing for the detail panel changes projection callbacks, not the orbit
  // lifetime. Recreating controls would reset its target to the world origin.
  const saveCurrentCamera = useRef(save);
  useLayoutEffect(() => { saveCurrentCamera.current = save; }, [save]);
  useEffect(() => {
    const control = new OrbitControls(camera, gl.domElement); controls.current = control;
    control.enableDamping = false; control.screenSpacePanning = true; control.minZoom = .000001; control.maxZoom = 8;
    control.mouseButtons.LEFT = THREE.MOUSE.ROTATE; control.mouseButtons.RIGHT = THREE.MOUSE.PAN;
    gl.domElement.tabIndex = 0; gl.domElement.setAttribute('aria-label', '全体3D。ドラッグで回転、右ドラッグで移動。検索結果からも選択できます。');
    control.listenToKeyEvents(gl.domElement);
    const unbindKeyboard = bindSemanticFlowKeyboard(gl.domElement, () => callbacks.current.onClear());
    // OrbitControls keyboard changes do not emit its pointer gesture end event.
    const saveCamera = () => saveCurrentCamera.current();
    const saveKeyboardCamera = (event: KeyboardEvent) => { if (event.key.startsWith('Arrow')) saveCamera(); };
    gl.domElement.addEventListener('keydown', saveKeyboardCamera);
    const change = () => { labelDirty.current = true; invalidate(); };
    control.addEventListener('change', change); control.addEventListener('end', saveCamera);
    const lost = (event: Event) => { event.preventDefault(); callbacks.current.onUnavailable(); };
    gl.domElement.addEventListener('webglcontextlost', lost);
    return registerCanvasDisposal(canvasDisposals, () => {
      unbindKeyboard(); gl.domElement.removeEventListener('keydown', saveKeyboardCamera); gl.domElement.removeEventListener('webglcontextlost', lost);
      control.removeEventListener('change', change); control.removeEventListener('end', saveCamera); control.dispose(); controls.current = null;
    });
  }, [camera, gl, invalidate, canvasDisposals]);
  const fit = useCallback((ids?: string[], reset = false, context = false) => {
    const control = controls.current; if (!control) return;
    const requestedIds = new Set(ids);
    const targets = requestedIds.size ? [...allPositions, ...positions.filter(point => point.node.attributes.displayAggregate === true)].filter(point => requestedIds.has(point.node.id)) : allPositions;
    if (!targets.length) return;
    const targetIds = new Set(targets.map(point => point.node.id));
    const fitPoints = [...targets, ...(!ids || ids.length > 1 ? paths.filter(path => !ids || targetIds.has(path.edge.source) && targetIds.has(path.edge.target)).flatMap(path => path.points) : [])];
    const box = new THREE.Box3().setFromPoints(fitPoints.map(point => new THREE.Vector3(point.x, point.y, point.z)));
    const center = box.getCenter(new THREE.Vector3());
    const direction = reset ? new THREE.Vector3(.6, .45, 2.2).normalize() : camera.position.clone().sub(control.target).normalize();
    control.target.copy(center); camera.position.copy(center).addScaledVector(direction, Math.max(2000, box.getSize(new THREE.Vector3()).length() * 2)); control.update(); camera.updateMatrixWorld();
    const projected = fitPoints.map(point => new THREE.Vector3(point.x, point.y, point.z).applyMatrix4(camera.matrixWorldInverse));
    const viewBox = new THREE.Box3().setFromPoints(projected).getSize(new THREE.Vector3());
    const cam = camera as THREE.OrthographicCamera;
    if (sourceGraph.view === 'architecture-map') {
      viewportAnchor.current = { width: size.width, centerY: semanticFlowPlot(size.width, size.height, overlayTop).centerY };
      configureSemanticFlowViewport(cam, size.width, size.height, overlayTop, viewportAnchor.current);
    }
    cam.zoom = Math.min((size.width - 70) / (viewBox.x + (context ? 850 : 80)), plotHeight / (viewBox.y + (context ? 600 : 80)), ids?.length === 1 ? 3 : 2);
    cam.updateProjectionMatrix(); control.update(); labelDirty.current = true; save(); invalidate();
  }, [positions, allPositions, paths, camera, size, plotHeight, save, invalidate, sourceGraph.view, overlayTop]);
  useEffect(() => {
    if (initialized.current || !positions.length || !controls.current) return;
    initialized.current = true;
    if (initialCamera.current) {
      const saved = initialCamera.current, cam = camera as THREE.OrthographicCamera;
      camera.position.fromArray(saved.position); controls.current.target.fromArray(saved.target); cam.zoom = saved.zoom; cam.updateProjectionMatrix(); controls.current.update(); publishProjection(); invalidate();
    } else fit(sourceGraph.architectureView?.scopeId ? sourceGraph.architectureView.detailIds : undefined, true, Boolean(sourceGraph.architectureView?.scopeId));
  }, [positions, camera, fit, invalidate, publishProjection, sourceGraph.architectureView]);
  useEffect(() => {
    if (!command || command.nonce === lastCommand.current) return;
    lastCommand.current = command.nonce;
    if (command.kind === 'fit' || command.kind === 'reset') fit(undefined, command.kind === 'reset');
    else if (command.kind === 'focus') fit(command.ids);
    else { const cam = camera as THREE.OrthographicCamera; cam.zoom = Math.max(.000001, Math.min(8, cam.zoom * (command.kind === 'zoom-in' ? 1.2 : 1 / 1.2))); cam.updateProjectionMatrix(); controls.current?.update(); labelDirty.current = true; save(); invalidate(); }
  }, [command, camera, fit, save, invalidate]);
  useEffect(() => {
    const element = gl.domElement, down = pointerGesture.current;
    const architecture = sourceGraph.view === 'architecture-map';
    const start = (event: PointerEvent) => { down.x = event.clientX; down.y = event.clientY; down.moved = false; element.focus({ preventScroll: true }); callbacks.current.onHover(); };
    const hit = (event: MouseEvent) => {
      const rect = element.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top, width: rect.width, height: rect.height };
    };
    const move = (event: PointerEvent) => {
      if (event.buttons) { if (Math.hypot(event.clientX - down.x, event.clientY - down.y) > 5) down.moved = true; return; }
      const p = hit(event), id = hitSemanticFlowPoint(camera, p, positions, p.x, p.y) ?? callbacks.current.hoverAt(p.x, p.y);
      const edgeId = id ? undefined : hitSemanticFlowEdge(camera, p, paths, p.x, p.y);
      element.style.cursor = id || edgeId ? 'pointer' : '';
      callbacks.current.onHover(id, edgeId);
    };
    const leave = () => { element.style.cursor = ''; callbacks.current.onHover(); };
    const end = (event: MouseEvent) => {
      if (event.button !== 0 || down.moved || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 5) return;
      const p = hit(event), id = hitSemanticFlowPoint(camera, p, positions, p.x, p.y);
      const edgeId = id ? undefined : hitSemanticFlowEdge(camera, p, paths, p.x, p.y);
      if (id) { if (architecture && callbacks.current.onArchitectureNodeClick) callbacks.current.onArchitectureNodeClick(id, event); else callbacks.current.onSelect(id); } else if (edgeId) callbacks.current.onSelectEdge(edgeId); else callbacks.current.onClear();
    };
    element.addEventListener('pointerdown', start); element.addEventListener(architecture ? 'click' : 'pointerup', end); element.addEventListener('pointermove', move); element.addEventListener('pointerleave', leave);
    return () => { element.removeEventListener('pointerdown', start); element.removeEventListener(architecture ? 'click' : 'pointerup', end); element.removeEventListener('pointermove', move); element.removeEventListener('pointerleave', leave); element.style.cursor = ''; };
  }, [camera, gl, positions, paths, sourceGraph.view]);
  const labelOrder = useMemo(() => [...positions].sort((a, b) => Number(selectedIds.has(b.node.id)) - Number(selectedIds.has(a.node.id)) || Number(matchIds.has(b.node.id)) - Number(matchIds.has(a.node.id)) || Number(connected.has(b.node.id)) - Number(connected.has(a.node.id)) || Number(b.node.kind === 'entry') - Number(a.node.kind === 'entry')), [positions, selectedIds, matchIds, connected]);
  useDisposableFrame((_, delta) => {
    const zoom = (camera as THREE.OrthographicCamera).zoom;
    nodeAsset.material.uniforms.zoom!.value = zoom;
    cameraRef.current = { scale: zoom, viewportWidth: size.width, viewportHeight: size.height };
    if (labelDirty.current) {
      const labels = projectSemanticFlowLabels(camera, size, zoom, labelOrder, selectedIds, matchIds, { quietBackground: autoAggregation && Boolean(selectedIds.size || selectedEdgeId || explicitPathNodeIds?.size), regions, relatedIds: connected, priorityIds, hoveredIds, overlayTop, previous: previousLabels.current, obstacles: labelObstacles, roles, relationKinds, displays, view: sourceGraph.view, emphasisIds: emphasis.nodeIds, scopeActiveIds });
      previousLabels.current = labels;
      callbacks.current.onLabels(labels);
      callbacks.current.onConnections(semanticFlowConnectionNotices(camera, size, positions, new Set([...connected, ...priorityIds].filter(id => !selectedIds.has(id))), labels, overlayTop, labelObstacles));
      labelDirty.current = false;
    }
    if (stateRef.current.active) { stateRef.current.distance += Math.min(delta, SPATIAL_FLOW_MAX_FRAME_SECONDS) * SPATIAL_FLOW_SPEED; invalidate(); }
  });
  return <><color attach="background" args={['#050c09']} />{showGroupBounds && <primitive object={boundaryAsset.object} />}<SpatialRelationLines paths={linePaths} /><primitive object={nodeAsset.object} />
    <SpatialFlowParticles paths={flowPaths} stateRef={stateRef} cameraRef={cameraRef} active={motion.enabled && motion.visible} />
  </>;
}

class FlowGraphBoundary extends Component<{ children: ReactNode; onUnavailable: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onUnavailable(); }
  render() { return this.state.failed ? <p role="status">3Dを利用できないため、2Dへ戻ります。</p> : this.props.children; }
}

export function SemanticFlow3D(props: Props) {
  const sceneVisit = props.graph.view === 'architecture-map' ? props.visitId : undefined;
  const currentVisit = useRef(sceneVisit); currentVisit.current = sceneVisit;
  const reportCamera = props.onCamera;
  const saveVisitCamera = useCallback((camera: CameraState) => { if (currentVisit.current === sceneVisit) reportCamera(camera); }, [reportCamera, sceneVisit]);
  const canvasDisposals = useCanvasDisposals();
  const [labels, setLabels] = useState<FlowLabelContent[]>([]);
  const [labelLayer] = useState(() => new FlowLabelLayer(setLabels));
  const updateLabels = useCallback((labels: FlowLabelPlacement[]) => { if (currentVisit.current === sceneVisit) labelLayer.update(labels); }, [labelLayer, sceneVisit]);
  const [hoveredId, setHoveredId] = useState<string>(), [focusedId, setFocusedId] = useState<string>();
  const [aggregateOpen, setAggregateOpen] = useState(false), [connectionsOpen, setConnectionsOpen] = useState(false), [memberPage, setMemberPage] = useState(0);
  const [localAggregation, setLocalAggregation] = useState<NonNullable<AnalyzerViewSession['aggregation']>>({ expandedGroupIds: [], collapsedGroupIds: [] });
  const aggregationState = props.aggregationState ?? localAggregation, changeAggregation = props.onAggregationState ?? setLocalAggregation;
  const expanded = aggregationState.unresolved === 'expanded';
  const [inspection, setInspection] = useState<AggregationInspection>();
  const [projection, setProjection] = useState<AggregationProjection>({ width: 1000, height: 700, zoom: props.camera?.zoom ?? 1 });
  const onProjection = useCallback((next: AggregationProjection) => { if (currentVisit.current === sceneVisit) setProjection(previous => previous.zoom === next.zoom && previous.width === next.width && previous.height === next.height
    && previous.matrix?.every((value, index) => value === next.matrix?.[index]) ? previous : next); }, [sceneVisit]);
  const previousActive = useRef<ReadonlySet<string>>(new Set(aggregationState.activeGroupIds));
  const previousRepresentation = useRef<AutoAggregationResult | undefined>(undefined);
  const [connections, setConnections] = useState<FlowConnectionNotice[]>([]);
  const disclosures = useRef<HTMLDivElement>(null);
  const [labelObstacles, setLabelObstacles] = useState<FlowLabelObstacle[]>([]);
  const combinedObstacles = useMemo(() => [...labelObstacles, ...props.extraLabelObstacles ?? []], [labelObstacles, props.extraLabelObstacles]);
  const { presentation, allPositions, aggregationInput, byId, preparedAggregation, projectDisplay } = useMemo(() => semanticFlow3DInput(props.graph, props.explorer), [props.graph, props.explorer]);
  const onConnections = useCallback((next: FlowConnectionNotice[]) => { if (currentVisit.current === sceneVisit) setConnections(previous => previous.length === next.length && previous.every((item, index) => item.id === next[index]!.id && item.status === next[index]!.status) ? previous : next); }, [sceneVisit]);
  useLayoutEffect(() => { labelLayer.update([]); setInspection(undefined); setConnections([]); }, [labelLayer, sceneVisit]);
  useLayoutEffect(() => {
    const element = disclosures.current, parent = element?.parentElement; if (!element || !parent) return;
    let disposed = false;
    const measure = () => {
      if (disposed) return;
      const rect = element.getBoundingClientRect(), container = parent.getBoundingClientRect();
      const next = { left: rect.left - container.left, top: rect.top - container.top, width: rect.width, height: rect.height };
      setLabelObstacles(previous => {
        if (!next.width || !next.height) return previous.length ? [] : previous;
        const old = previous[0];
        return old && old.left === next.left && old.top === next.top && old.width === next.width && old.height === next.height ? previous : [next];
      });
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return () => { disposed = true; };
    const observer = new ResizeObserver(measure); observer.observe(element); observer.observe(parent);
    return () => { disposed = true; observer.disconnect(); };
  }, [aggregateOpen, connectionsOpen, connections.length, presentation.members.length, inspection]);
  const clearHoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const focusedIdRef = useRef<string | undefined>(undefined);
  const focusOwner = useRef<{ id: string; handler?: SemanticFlowHoverHandler } | undefined>(undefined);
  const pointerOwner = useRef<{ handler?: SemanticFlowHoverHandler; labelId?: string } | undefined>(undefined);
  const onHoverTargetRef = useRef(props.onHoverTarget); onHoverTargetRef.current = props.onHoverTarget;
  const [localHoverTarget, setLocalHoverTarget] = useState<SemanticFlowHoverTarget>();
  const releaseFocus = useCallback((id?: string) => {
    const owner = focusOwner.current;
    if (!owner || id !== undefined && owner.id !== id) return;
    focusOwner.current = undefined; focusedIdRef.current = undefined;
    owner.handler?.(undefined, { source: `3d-focus:${owner.id}`, modality: 'focus' });
    setFocusedId(undefined); setLocalHoverTarget(undefined);
  }, []);
  const releasePointer = useCallback(() => {
    const owner = pointerOwner.current; pointerOwner.current = undefined;
    owner?.handler?.(undefined, { source: '3d-pointer', modality: 'pointer' });
  }, []);
  const onHover = useCallback((id?: string, edgeId?: string, labelId?: string) => {
    if (id || edgeId) {
      clearTimeout(clearHoverTimer.current); clearHoverTimer.current = undefined; setHoveredId(id);
      const target: SemanticFlowHoverTarget = id ? { kind: 'node', id } : { kind: 'edge', id: edgeId! };
      pointerOwner.current = { handler: onHoverTargetRef.current, labelId };
      setLocalHoverTarget(previous => previous?.kind === target.kind && previous.id === target.id ? previous : target); pointerOwner.current.handler?.(target, { source: '3d-pointer', modality: 'pointer' });
    } else if (clearHoverTimer.current === undefined) clearHoverTimer.current = setTimeout(() => {
      const target: SemanticFlowHoverTarget | undefined = focusedIdRef.current ? { kind: 'node', id: focusedIdRef.current } : undefined;
      setHoveredId(undefined); setLocalHoverTarget(target); releasePointer(); clearHoverTimer.current = undefined;
    }, 120);
  }, [releasePointer]);
  const hoverTarget = useMemo(() => props.onHoverTarget ? props.hoverTarget : focusedId ? { kind: 'node' as const, id: focusedId } : localHoverTarget, [props.onHoverTarget, props.hoverTarget, focusedId, localHoverTarget]);
  const hoveredIds = useMemo(() => new Set([hoveredId, focusedId, hoverTarget?.kind === 'node' ? hoverTarget.id : undefined].filter((id): id is string => Boolean(id))), [hoveredId, focusedId, hoverTarget]);
  const expandedIds = useMemo(() => new Set(aggregationState.expandedGroupIds), [aggregationState.expandedGroupIds]);
  const collapsedIds = useMemo(() => new Set(aggregationState.collapsedGroupIds), [aggregationState.collapsedGroupIds]);
  const protectedIds = useMemo(() => {
    const ids = new Set([...props.selectedIds, ...hoveredIds, ...props.explicitPathNodeIds ?? [], ...(props.graph.architectureView?.scopeId ? props.graph.architectureView.detailIds : []), ...(props.command?.kind === 'focus' ? props.command.ids ?? [] : [])]);
    const neighbours = new Set<string>();
    for (const edge of props.graph.edges) {
      if (edge.id === props.selectedEdgeId || hoverTarget?.kind === 'edge' && edge.id === hoverTarget.id || props.explicitPathEdgeIds?.has(edge.id)) { ids.add(edge.source); ids.add(edge.target); }
      if (props.selectedIds.has(edge.source) && props.direction !== 'incoming') neighbours.add(edge.target);
      if (props.selectedIds.has(edge.target) && props.direction !== 'outgoing') neighbours.add(edge.source);
    }
    if (neighbours.size <= 3) for (const id of neighbours) ids.add(id);
    if (expanded) for (const node of presentation.members) ids.add(node.id);
    return ids;
  }, [props.selectedIds, props.selectedEdgeId, props.graph.edges, props.graph.architectureView, props.direction, props.explicitPathNodeIds, props.explicitPathEdgeIds, props.command, hoveredIds, hoverTarget, expanded, presentation.members]);
  const manualUnresolved = useMemo<AggregationGroup | undefined>(() => presentation.aggregate ? {
    id: 'unresolved-calls', label: '呼び出し箇所別の未特定呼び出し（手動範囲）', memberIds: presentation.members.map(node => node.id), minimumMembers: 1,
    x: presentation.aggregate.x, y: presentation.aggregate.y, z: presentation.aggregate.z,
  } : undefined, [presentation]);
  const manualGroups = useMemo(() => [...aggregationInput.groups.filter(group => collapsedIds.has(group.id)), ...(aggregationState.unresolved === 'collapsed' && manualUnresolved ? [manualUnresolved] : [])], [aggregationInput.groups, collapsedIds, aggregationState.unresolved, manualUnresolved]);
  const aggregation = useMemo(() => stableAggregationRepresentation(projectAutoAggregation({ ...aggregationInput, prepared: preparedAggregation, enabled: props.autoAggregation !== false, retainOffscreen: true, protectedIds, expandedGroupIds: expandedIds,
    manualGroups, projection, previousActiveGroupIds: previousActive.current, matchIds: props.matchIds }), previousRepresentation.current), [aggregationInput, preparedAggregation, props.autoAggregation, protectedIds, expandedIds, manualGroups, projection, props.matchIds]);
  useEffect(() => { previousRepresentation.current = aggregation; }, [aggregation]);
  useEffect(() => {
    // A restored camera's real projection arrives after Canvas initialization. The
    // placeholder scale must not overwrite its stored hysteresis decision.
    if (props.autoAggregation === false || !projection.matrix || projection.width <= 0 || projection.height <= 0) return;
    previousActive.current = aggregation.activeGroupIds;
    const saved = aggregationState.activeGroupIds ?? [];
    if (saved.length !== aggregation.activeGroupIds.size || saved.some(id => !aggregation.activeGroupIds.has(id))) changeAggregation({ ...aggregationState, activeGroupIds: [...aggregation.activeGroupIds] });
  }, [aggregation.activeGroupIds, props.autoAggregation, projection, aggregationState, changeAggregation]);
  const { ownerById, individualIds, aggregates } = aggregation;
  const displayed = useMemo(() => projectDisplay({ ownerById, individualIds, aggregates }), [projectDisplay, ownerById, individualIds, aggregates]);
  const positions = displayed.positions;
  const activeRelation = displayed.graph.edges.find(edge => edge.id === (hoverTarget?.kind === 'edge' ? hoverTarget.id : props.selectedEdgeId));
  const reportRelation = props.onVisibleRelation;
  useEffect(() => { reportRelation?.(activeRelation); return () => reportRelation?.(undefined); }, [activeRelation, reportRelation]);
  const inspectRelations = Boolean(inspection);
  const originalRelations = useMemo(() => inspectRelations ? props.graph.edges.map(edge => ({ ...edge, confidence: confidenceLabels[edge.confidence],
    evidenceCount: new Set(edge.evidence.map(item => JSON.stringify([item.path, item.start, item.end, item.description]))).size,
    siteCount: new Set(edge.evidence.map(item => JSON.stringify([item.path, item.start, item.end]))).size })) : [], [props.graph.edges, inspectRelations]);
  const displays = useMemo(() => {
    const base = props.nodeDisplays ?? semanticNodeDisplays(props.graph.nodes);
    if (!props.graph.architectureView?.scopeId || !aggregation.aggregates.length) return base;
    const next = new Map(base);
    for (const group of aggregation.aggregates) {
      const roles = new Set(group.memberIds.map(id => base.get(id)?.scopeRole));
      const scopeRole = roles.has('inside') ? 'inside' : roles.has('direct') ? 'direct' : 'surrounding';
      const roleLabel = scopeRole === 'inside' ? '内部' : scopeRole === 'direct' ? roles.has('surrounding') ? '接続先を含む周辺' : '接続先' : '周辺';
      next.set(group.id, { title: group.label, location: `${group.memberIds.length}対象・表示上の集合`, dataRole: `${roleLabel} · 表示上の集合`, scopeRole, tooltip: `${group.label}\n${roleLabel}\n${group.memberIds.length}対象を表示上でまとめています。` });
    }
    return next;
  }, [props.nodeDisplays, props.graph.nodes, props.graph.architectureView?.scopeId, aggregation.aggregates]);
  const selectPoint = (id: string) => {
    const aggregate = aggregation.aggregates.find(group => group.id === id);
    if (aggregate) setInspection({ kind: 'group', id: aggregate.groupId });
    else props.onSelect(id);
  };
  const selectRelation = (id: string) => {
    const relation = displayed.relations.find(edge => edge.id === id);
    if (relation?.aggregated) setInspection({ kind: 'relation', id });
    else props.onSelectEdge(id);
  };
  const groupMode = (id: string, mode: AggregationGroupMode) => {
    if (!aggregationInput.groups.some(group => group.id === id) && !(id === 'unresolved-calls' && manualUnresolved)) return;
    if (id === 'unresolved-calls') { changeAggregation({ ...aggregationState, unresolved: mode === 'auto' ? undefined : mode }); return; }
    changeAggregation({ ...aggregationState, expandedGroupIds: [...aggregationState.expandedGroupIds.filter(value => value !== id), ...(mode === 'expanded' ? [id] : [])],
      collapsedGroupIds: [...aggregationState.collapsedGroupIds.filter(value => value !== id), ...(mode === 'collapsed' ? [id] : [])] });
  };
  const inspectedId = inspection?.kind === 'group' ? aggregation.aggregates.find(group => group.groupId === inspection.id)?.id : undefined;
  useEffect(() => {
    clearTimeout(clearHoverTimer.current); clearHoverTimer.current = undefined;
    releaseFocus(); releasePointer(); setHoveredId(undefined); setLocalHoverTarget(undefined);
  }, [props.selectedIds, props.selectedEdgeId, props.graph, props.direction, releaseFocus, releasePointer]);
  useLayoutEffect(() => {
    const id = focusOwner.current?.id;
    if (id && !labels.some(label => label.id === id && !label.region)) releaseFocus(id);
    const pointerLabel = pointerOwner.current?.labelId;
    if (pointerLabel && !labels.some(label => label.id === pointerLabel && !label.region)) {
      clearTimeout(clearHoverTimer.current); clearHoverTimer.current = undefined;
      releasePointer(); setHoveredId(undefined); setLocalHoverTarget(undefined);
    }
  }, [labels, releaseFocus, releasePointer]);
  const regionNodes = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const { node } of allPositions) { const identity = props.explorer ? explorerRegionIdentity(props.explorer, node.id) : semanticRegionIdentity(node);
      const id = `flow-region:${identity.id}`, nodes = map.get(id) ?? []; nodes.push(node.id); map.set(id, nodes); }
    return map;
  }, [allPositions, props.explorer]);
  const selected = props.selectedIds.size ? props.graph.nodes.find(node => props.selectedIds.has(node.id)) : undefined;
  const selectedRegion = selected ? props.explorer ? explorerRegionIdentity(props.explorer, selected.id) : semanticRegionIdentity(selected) : undefined;
  const description = props.graph.view === 'runtime-flow' && props.explorer?.runtimeMode !== 'grounded'
    ? props.explorer?.runtimeMode === 'mixed' ? '実行環境と、未判定対象の所属' : '実行環境未判定・所属別表示' : '所属を手掛かりに全体を探索';
  useLayoutEffect(() => { labelLayer.resume(); return () => {
    clearTimeout(clearHoverTimer.current); labelLayer.suspend(); releasePointer();
    const owner = focusOwner.current; focusOwner.current = undefined; focusedIdRef.current = undefined;
    owner?.handler?.(undefined, { source: `3d-focus:${owner.id}`, modality: 'focus' });
  }; }, [labelLayer, releasePointer]);
  return <div className="semantic-flow-3d" data-node-count={props.graph.nodes.length} data-edge-count={props.graph.edges.length} data-display-point-count={positions.length} data-unresolved-target-count={presentation.members.length} data-unresolved-expanded={expanded} data-group-bounds={props.showGroupBounds !== false}
    onKeyDown={event => {
      // Canvas exists before the R3F Scene installs its native keyboard listener.
      // That listener stops propagation once ready; fullscreen capture wins first.
      if (event.target instanceof HTMLCanvasElement && event.key === 'Escape' && !event.defaultPrevented && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) {
        event.preventDefault(); event.stopPropagation(); props.onClear();
      }
    }}>
    <FlowGraphBoundary onUnavailable={props.onUnavailable}><Canvas onCreated={initializeSemanticCanvas} orthographic frameloop="demand" dpr={[1, 1.7]} camera={{ position: [600, 450, 2200], zoom: 1, near: .1, far: 1000000 }} gl={defaults => recoverableWebGLRenderer({ ...defaults, antialias: true, alpha: true }, props.onUnavailable)}><Scene key={sceneVisit} {...props} canvasDisposals={canvasDisposals} nodeDisplays={displays} selectedIds={props.selectedIds} hoverTarget={hoverTarget} positions={positions} renderGraph={displayed.graph} allPositions={allPositions} onProjection={onProjection} onCamera={saveVisitCamera} labelObstacles={combinedObstacles} onArchitectureNodeClick={props.onArchitectureNodeClick ? (id, event) => { props.onArchitectureNodeClick?.(id, event, () => selectPoint(id)); } : undefined} onSelect={selectPoint} onSelectEdge={selectRelation} onConnections={onConnections} onLabels={updateLabels} hoveredIds={hoveredIds} onHover={onHover} hoverAt={labelLayer.hoverAt} /></Canvas></FlowGraphBoundary>
    <svg className="semantic-flow-label-leaders" aria-hidden="true">{labels.filter(label => !label.region && (aggregation.individualIds.has(label.id) || aggregation.aggregates.some(group => group.id === label.id))).map(label => <line key={label.id} ref={element => labelLayer.attachLeader(label.id, element)} />)}</svg>
    <div className="semantic-flow-3d-labels">{labels.filter(label => label.region ? regionNodes.has(label.id) : aggregation.individualIds.has(label.id) || aggregation.aggregates.some(group => group.id === label.id)).map(label => <button key={label.id} ref={element => labelLayer.attach(label.id, element)} type="button"
      data-flow-label-id={label.id} data-flow-inspected={label.id === inspectedId || undefined} data-flow-role={label.role} data-flow-emphasized={label.emphasized || undefined} className={`${label.selected ? 'is-selected' : ''}${label.match ? ' is-match' : ''}${label.hovered ? ' is-hovered' : ''}${label.related ? ' is-related' : ''}${label.region ? ' is-region' : ''}${label.aggregate ? ' is-aggregate' : ''}${label.emphasized ? ' is-emphasized' : ''}${label.dimmed ? ' is-dimmed' : ''}`} aria-pressed={label.region ? undefined : label.selected} title={`${label.tooltip ?? `${label.label}\n${label.path}`}${label.roleLabel ? `\n${label.roleLabel}` : ''}`}
      data-architecture-scope-role={label.scopeRole} data-architecture-active={label.scopeActive || undefined}
      aria-label={label.region ? `${label.label}の領域へ移動 · ${label.path}` : undefined}
      onPointerMove={event => { if (!label.region && event.buttons === 0) onHover(label.id, undefined, label.id); }} onPointerLeave={() => onHover()} onFocus={() => { if (!label.region) { focusedIdRef.current = label.id; focusOwner.current = { id: label.id, handler: props.onHoverTarget }; setFocusedId(label.id); props.onHoverTarget?.({ kind: 'node', id: label.id }, { source: `3d-focus:${label.id}`, modality: 'focus' }); } }} onBlur={() => releaseFocus(label.id)}
      onClick={event => { if (label.region) props.onFocusRegion?.(regionNodes.get(label.id) ?? []); else if (props.onArchitectureNodeClick) props.onArchitectureNodeClick(label.id, event, () => selectPoint(label.id)); else selectPoint(label.id); }}><strong>{label.label}</strong>{label.roleLabel && <span className="semantic-flow-3d-role">{label.roleLabel}</span>}{label.disambiguation && <small className="semantic-flow-3d-disambiguation">{label.disambiguation}</small>}{(label.region || label.selected || label.aggregate) && <small>{label.id === inspectedId ? `内訳を表示中 · ${label.path}` : label.region ? `所属 · ${label.path}` : label.path}</small>}</button>)}</div>
    <div className="semantic-flow-disclosures" ref={disclosures}>
      <AutoAggregationPanel enabled={props.autoAggregation !== false} totalCount={props.totalNodeCount} counts={aggregation.counts} groups={manualUnresolved ? [...aggregationInput.groups, manualUnresolved] : aggregationInput.groups} aggregates={aggregation.aggregates}
        ownerById={aggregation.ownerById}
        expandedIds={expandedIds} collapsedIds={collapsedIds} inspection={inspection} onInspection={setInspection} onGroupMode={groupMode} relations={displayed.relations} originalRelations={originalRelations}
        nodeLabel={id => ({ title: displays.get(id)?.title ?? id, subtitle: [displays.get(id)?.dataRole, displays.get(id)?.location].filter(Boolean).join(' · ') })}
        onSelectNode={id => { setInspection(undefined); props.onSelect(id); props.onFocusRegion?.([id]); }} onSelectRelation={id => { setInspection(undefined); props.onSelectEdge(id); }} />
      {presentation.aggregate && <details open={aggregateOpen} onToggle={event => setAggregateOpen(event.currentTarget.open)} className="semantic-flow-unresolved-control">
        <summary><span className="semantic-flow-aggregate-symbol" aria-hidden="true">○</span> 表示上の集約 · 定義先未特定 {presentation.members.length.toLocaleString()}対象</summary>
        {aggregateOpen && <div className="semantic-flow-disclosure-body">
          <p>呼び出し式は確認できていますが、Analyzerが呼び出し先の関数定義を特定できていません。</p>
          <p>現在の絞り込み内: {presentation.members.length.toLocaleString()}対象 · {presentation.relationCount.toLocaleString()}関係<br />その呼び出し関係の根拠: {presentation.callSiteCount.toLocaleString()}箇所</p>
          <button type="button" onClick={() => changeAggregation({ ...aggregationState, unresolved: expanded ? 'collapsed' : 'expanded' })}>{expanded ? '集約表示へ戻す' : 'すべての対象を点で展開'}</button>
          <button type="button" onClick={() => changeAggregation({ ...aggregationState, unresolved: undefined })}>自動表示に戻す</button>
          <small>{expanded ? 'すべての対象を個別表示中' : aggregationState.unresolved === 'collapsed' ? '手動折りたたみ中。選択・経路の対象は個別表示します。' : '自動省略の設定と密度に従って表示します。'}</small>
          <ul>{presentation.members.slice(Math.min(memberPage, Math.max(0, Math.ceil(presentation.members.length / 20) - 1)) * 20, (Math.min(memberPage, Math.max(0, Math.ceil(presentation.members.length / 20) - 1)) + 1) * 20).map(node => <li key={node.id}>
            <button type="button" onClick={() => { setAggregateOpen(false); setConnectionsOpen(false); props.onSelect(node.id); props.onFocusRegion?.([node.id]); }} title={`${node.label}\n${node.path ?? ''}:${node.line ?? ''}`}><strong>{node.label}</strong><small>呼び出し箇所: {node.path ?? '位置情報なし'}{node.line ? `:${node.line}` : ''}</small></button>
          </li>)}</ul>
          {presentation.members.length > 20 && <div className="semantic-flow-disclosure-pages"><button type="button" disabled={memberPage <= 0} onClick={() => setMemberPage(page => Math.max(0, page - 1))}>前の20対象</button><button type="button" disabled={(memberPage + 1) * 20 >= presentation.members.length} onClick={() => setMemberPage(page => page + 1)}>次の20対象</button></div>}
        </div>}
      </details>}
      {connections.length > 0 && <details open={connectionsOpen} onToggle={event => setConnectionsOpen(event.currentTarget.open)} className="semantic-flow-connection-notices">
        <summary>関係の両端・接続先 ほか{connections.length}対象{connections.some(item => item.status === 'offscreen') ? ` · 画面外 ${connections.filter(item => item.status === 'offscreen').length}対象` : ''}</summary>
        <div className="semantic-flow-disclosure-body"><ul>{connections.map(item => <li key={item.id}><button type="button" onClick={() => { setConnectionsOpen(false); setAggregateOpen(false); props.onFocusRegion?.([item.id]); }} title={byId.get(item.id)?.label}>
          <strong>{displays.get(item.id)?.title ?? displayed.graph.nodes.find(node => node.id === item.id)?.label ?? item.id}</strong><small>{item.status === 'offscreen' ? '画面外' : 'ラベルを省略'} · この対象へ移動</small>
        </button></li>)}</ul></div>
      </details>}
    </div>
    {!props.explorer && <SemanticFlowLocation label={`${regionNodes.size}のまとまり · ${props.graph.nodes.length.toLocaleString()}対象`} description={description} selection={selected ? `${selectedRegion?.label} · ${selected.kind === 'external' ? '呼び出し箇所: ' : ''}${selected.path ?? selected.label}` : undefined} />}
    <div className="semantic-flow-3d-selection-description" aria-live="polite">{[...props.selectedIds].map(id => props.graph.nodes.find(node => node.id === id)?.label).filter(Boolean).join('、')}</div>
  </div>;
}

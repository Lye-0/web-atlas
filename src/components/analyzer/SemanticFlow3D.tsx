import { Component, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { AnalyzerViewSession } from '../../analyzer/session';
import { semanticFlowEdgePaths } from '../../analyzer/semantic/flowPresentation';
import type { SemanticPosition } from '../../analyzer/semantic/presentation';
import { buildUnresolvedFlowPresentation, visibleUnresolvedFlowPositions } from '../../analyzer/semantic/flowUnresolvedPresentation';
import { semanticFlowRegions, semanticRegionIdentity } from '../../analyzer/semantic/flowRegions';
import { explorerRegionIdentity, type SemanticExplorerModel } from '../../analyzer/semantic/semanticExplorer';
import { SPATIAL_FLOW_PARTICLE_SPACING, SPATIAL_FLOW_SPEED, type SpatialFlowState } from '../../analyzer/spatialFlow';
import { SpatialFlowParticles } from './SpatialFlowParticles';
import type { SemanticFlowRenderProps } from './SemanticFlow2D';
import { bindSemanticFlowKeyboard } from './semanticFlowKeyboard';
import { FlowLabelLayer, hitSemanticFlowEdge, hitSemanticFlowPoint, projectSemanticFlowLabels, semanticFlowConnectionNotices, type FlowConnectionNotice, type FlowLabelContent, type FlowLabelObstacle, type FlowLabelPlacement } from './semanticFlowLabels';
import { SemanticFlowLocation } from './SemanticFlowMap';
import { configureSemanticFlowViewport, semanticFlowPlot } from './semanticFlowViewport';
import './semantic-flow-disclosures.css';

type CameraState = NonNullable<AnalyzerViewSession['semanticCamera']>;
interface Props extends SemanticFlowRenderProps { explorer?: SemanticExplorerModel; direction?: 'both' | 'incoming' | 'outgoing'; camera?: CameraState; onCamera: (camera: CameraState) => void; onUnavailable: () => void; onFocusRegion?: (ids: string[]) => void }

function Scene({ graph, explorer, positions, labelObstacles, direction = 'both', selectedIds, selectedEdgeId, matchIds, command, motion, overlayTop, camera: savedCamera, onCamera, onSelect, onSelectEdge, onClear, onUnavailable, onLabels, onConnections, hoveredIds, onHover, hoverAt }: Props & {
  positions: SemanticPosition[]; labelObstacles: readonly FlowLabelObstacle[]; onConnections: (notices: FlowConnectionNotice[]) => void;
  onLabels: (labels: FlowLabelPlacement[]) => void; hoveredIds: ReadonlySet<string>; onHover: (id?: string) => void; hoverAt: (x: number, y: number) => string | undefined;
}) {
  const { camera, gl, size, invalidate } = useThree();
  const controls = useRef<OrbitControls | null>(null);
  const callbacks = useRef({ onCamera, onSelect, onSelectEdge, onClear, onUnavailable, onLabels, onConnections, onHover, hoverAt });
  useEffect(() => { callbacks.current = { onCamera, onSelect, onSelectEdge, onClear, onUnavailable, onLabels, onConnections, onHover, hoverAt }; }, [onCamera, onSelect, onSelectEdge, onClear, onUnavailable, onLabels, onConnections, onHover, hoverAt]);
  useEffect(() => () => callbacks.current.onLabels([]), []);
  const regions = useMemo(() => semanticFlowRegions(positions.filter(point => point.node.attributes.displayAggregate !== true), '3d', explorer), [positions, explorer]);
  const priorityIds = useMemo(() => new Set(graph.edges.filter(edge => edge.id === selectedEdgeId).flatMap(edge => [edge.source, edge.target])), [graph.edges, selectedEdgeId]);
  const paths = useMemo(() => semanticFlowEdgePaths(graph, positions, selectedIds, selectedEdgeId, '3d', true)
    .filter(path => direction === 'both' || !path.direction || path.direction === 'internal' || path.direction === direction), [graph, positions, selectedIds, selectedEdgeId, direction]);
  const flowPaths = useMemo(() => paths.map(path => ({ id: path.edge.id, color: path.color, points: path.points })), [paths]);
  const stateRef = useRef<SpatialFlowState>({ active: false, distance: 0, reduced: false });
  const cameraRef = useRef({ scale: 1, viewportWidth: size.width, viewportHeight: size.height });
  const lastCommand = useRef<number | undefined>(undefined);
  const initialized = useRef(false);
  const initialCamera = useRef(savedCamera);
  const labelDirty = useRef(true);
  const previousLabels = useRef<FlowLabelPlacement[]>([]);
  const plotHeight = semanticFlowPlot(size.width, size.height, overlayTop).height;
  useLayoutEffect(() => {
    configureSemanticFlowViewport(camera as THREE.OrthographicCamera, size.width, size.height, overlayTop);
    labelDirty.current = true; invalidate();
  }, [camera, size.width, size.height, overlayTop, invalidate]);
  useEffect(() => { labelDirty.current = true; invalidate(); }, [positions, selectedIds, matchIds, selectedEdgeId, hoveredIds, size, overlayTop, labelObstacles, invalidate]);
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
      const aggregate = point.node.attributes.displayAggregate === true;
      colors.push(...new THREE.Color(aggregate ? '#edcc94' : selected ? '#c0e9dc' : matching ? '#edcc94' : connected.has(point.node.id) ? '#8db7b4' : '#698d81').toArray());
      sizes.push(aggregate ? 12 : selected ? 13 : matching ? 8 : connected.has(point.node.id) ? 7 : 5);
      aggregatePoints.push(aggregate ? 1 : 0);
    });
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geometry.setAttribute('nodeSize', new THREE.Float32BufferAttribute(sizes, 1)); geometry.setAttribute('aggregatePoint', new THREE.Float32BufferAttribute(aggregatePoints, 1));
    const material = new THREE.ShaderMaterial({ vertexColors: true, transparent: true, depthWrite: false,
      uniforms: { zoom: { value: 1 }, pixelRatio: { value: gl.getPixelRatio() } },
      vertexShader: 'attribute float nodeSize; attribute float aggregatePoint; uniform float zoom; uniform float pixelRatio; varying vec3 tint; varying float hollow; void main(){ tint=color; hollow=aggregatePoint; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); gl_PointSize=nodeSize*pixelRatio*clamp(sqrt(zoom),.85,2.); }',
      fragmentShader: 'varying vec3 tint; varying float hollow; void main(){float d=length(gl_PointCoord-.5)*2.; if(d>1.)discard; gl_FragColor=vec4(tint,(1.-smoothstep(.65,1.,d))*mix(1.,smoothstep(.28,.48,d),hollow));\n#include <colorspace_fragment>\n}' });
    const object = new THREE.Points(geometry, material); object.frustumCulled = false;
    return { object, geometry, material };
  }, [positions, selectedIds, matchIds, connected, gl]);
  useEffect(() => () => { nodeAsset.geometry.dispose(); nodeAsset.material.dispose(); }, [nodeAsset]);
  const edgeAsset = useMemo(() => {
    const vertices: number[] = [], colors: number[] = [], arrowVertices: number[] = [], previous: number[] = [], corners: number[] = [], arrowColors: number[] = [];
    for (const path of paths) {
      const color = new THREE.Color(path.color).toArray();
      for (let index = 1; index < path.points.length; index++) {
        const a = path.points[index - 1]!, b = path.points[index]!;
        vertices.push(a.x, a.y, a.z, b.x, b.y, b.z); colors.push(...color, ...color);
      }
      const a = path.points.at(-2)!, b = path.points.at(-1)!;
      for (const corner of [[0, 0], [-12, 5], [-12, -5]]) { arrowVertices.push(b.x, b.y, b.z); previous.push(a.x, a.y, a.z); corners.push(...corner); arrowColors.push(...color); }
    }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const material = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: .95, depthTest: false });
    const object = new THREE.LineSegments(geometry, material); object.frustumCulled = false;
    const arrowGeometry = new THREE.BufferGeometry(); arrowGeometry.setAttribute('position', new THREE.Float32BufferAttribute(arrowVertices, 3)); arrowGeometry.setAttribute('previous', new THREE.Float32BufferAttribute(previous, 3)); arrowGeometry.setAttribute('corner', new THREE.Float32BufferAttribute(corners, 2)); arrowGeometry.setAttribute('color', new THREE.Float32BufferAttribute(arrowColors, 3));
    const arrowMaterial = new THREE.ShaderMaterial({ vertexColors: true, depthTest: false, side: THREE.DoubleSide, uniforms: { viewport: { value: new THREE.Vector2(1, 1) } },
      vertexShader: 'attribute vec3 previous; attribute vec2 corner; uniform vec2 viewport; varying vec3 tint; void main(){tint=color; vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.); vec4 a=projectionMatrix*modelViewMatrix*vec4(previous,1.); vec2 d=(p.xy/p.w-a.xy/a.w)*viewport; d=length(d)>.0001?normalize(d):vec2(1.,0.); p.xy+=(d*corner.x+vec2(-d.y,d.x)*corner.y)*2./viewport*p.w; gl_Position=p;}',
      fragmentShader: 'varying vec3 tint; void main(){gl_FragColor=vec4(tint,1.);\n#include <colorspace_fragment>\n}' });
    const arrows = new THREE.Mesh(arrowGeometry, arrowMaterial); arrows.frustumCulled = false; arrows.renderOrder = 2;
    return { object, geometry, material, arrows, arrowGeometry, arrowMaterial };
  }, [paths]);
  useEffect(() => () => { edgeAsset.geometry.dispose(); edgeAsset.material.dispose(); edgeAsset.arrowGeometry.dispose(); edgeAsset.arrowMaterial.dispose(); }, [edgeAsset]);
  const save = useCallback(() => {
    const control = controls.current; if (!control) return;
    callbacks.current.onCamera({ position: camera.position.toArray(), target: control.target.toArray(), zoom: (camera as THREE.OrthographicCamera).zoom });
  }, [camera]);
  useEffect(() => {
    const control = new OrbitControls(camera, gl.domElement); controls.current = control;
    control.enableDamping = false; control.screenSpacePanning = true; control.minZoom = .000001; control.maxZoom = 8;
    control.mouseButtons.LEFT = THREE.MOUSE.ROTATE; control.mouseButtons.RIGHT = THREE.MOUSE.PAN;
    gl.domElement.tabIndex = 0; gl.domElement.setAttribute('aria-label', '全体3D。ドラッグで回転、右ドラッグで移動。検索結果からも選択できます。');
    control.listenToKeyEvents(gl.domElement);
    const unbindKeyboard = bindSemanticFlowKeyboard(gl.domElement, () => callbacks.current.onClear());
    // OrbitControls keyboard changes do not emit its pointer gesture end event.
    const saveKeyboardCamera = (event: KeyboardEvent) => { if (event.key.startsWith('Arrow')) save(); };
    gl.domElement.addEventListener('keydown', saveKeyboardCamera);
    const change = () => { labelDirty.current = true; invalidate(); };
    control.addEventListener('change', change); control.addEventListener('end', save);
    const lost = (event: Event) => { event.preventDefault(); callbacks.current.onUnavailable(); };
    gl.domElement.addEventListener('webglcontextlost', lost);
    return () => { unbindKeyboard(); gl.domElement.removeEventListener('keydown', saveKeyboardCamera); gl.domElement.removeEventListener('webglcontextlost', lost); control.dispose(); controls.current = null; };
  }, [camera, gl, invalidate, save]);
  const fit = useCallback((ids?: string[], reset = false) => {
    const control = controls.current; if (!control) return;
    const requestedIds = new Set(ids);
    const targets = requestedIds.size ? positions.filter(point => requestedIds.has(point.node.id)) : positions;
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
    cam.zoom = Math.min((size.width - 70) / (viewBox.x + 80), plotHeight / (viewBox.y + 80), ids?.length === 1 ? 3 : 2);
    cam.updateProjectionMatrix(); control.update(); labelDirty.current = true; save(); invalidate();
  }, [positions, paths, camera, size, plotHeight, save, invalidate]);
  useEffect(() => {
    if (initialized.current || !positions.length || !controls.current) return;
    initialized.current = true;
    if (initialCamera.current) {
      const saved = initialCamera.current, cam = camera as THREE.OrthographicCamera;
      camera.position.fromArray(saved.position); controls.current.target.fromArray(saved.target); cam.zoom = saved.zoom; cam.updateProjectionMatrix(); controls.current.update(); invalidate();
    } else fit(undefined, true);
  }, [positions, camera, fit, invalidate]);
  useEffect(() => {
    if (!command || command.nonce === lastCommand.current) return;
    lastCommand.current = command.nonce;
    if (command.kind === 'fit' || command.kind === 'reset') fit(undefined, command.kind === 'reset');
    else if (command.kind === 'focus') fit(command.ids);
    else { const cam = camera as THREE.OrthographicCamera; cam.zoom = Math.max(.000001, Math.min(8, cam.zoom * (command.kind === 'zoom-in' ? 1.2 : 1 / 1.2))); cam.updateProjectionMatrix(); controls.current?.update(); labelDirty.current = true; save(); invalidate(); }
  }, [command, camera, fit, save, invalidate]);
  useEffect(() => {
    const element = gl.domElement; let down = { x: 0, y: 0 };
    const start = (event: PointerEvent) => { down = { x: event.clientX, y: event.clientY }; element.focus({ preventScroll: true }); callbacks.current.onHover(); };
    const hit = (event: PointerEvent) => {
      const rect = element.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top, width: rect.width, height: rect.height };
    };
    const move = (event: PointerEvent) => {
      if (event.buttons) return;
      const p = hit(event), id = hitSemanticFlowPoint(camera, p, positions, p.x, p.y) ?? callbacks.current.hoverAt(p.x, p.y);
      element.style.cursor = id || hitSemanticFlowEdge(camera, p, paths, p.x, p.y) ? 'pointer' : '';
      callbacks.current.onHover(id);
    };
    const leave = () => { element.style.cursor = ''; callbacks.current.onHover(); };
    const end = (event: PointerEvent) => {
      if (event.button !== 0 || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 5) return;
      const p = hit(event), id = hitSemanticFlowPoint(camera, p, positions, p.x, p.y);
      const edgeId = id ? undefined : hitSemanticFlowEdge(camera, p, paths, p.x, p.y);
      if (id) callbacks.current.onSelect(id); else if (edgeId) callbacks.current.onSelectEdge(edgeId); else callbacks.current.onClear();
    };
    element.addEventListener('pointerdown', start); element.addEventListener('pointerup', end); element.addEventListener('pointermove', move); element.addEventListener('pointerleave', leave);
    return () => { element.removeEventListener('pointerdown', start); element.removeEventListener('pointerup', end); element.removeEventListener('pointermove', move); element.removeEventListener('pointerleave', leave); element.style.cursor = ''; };
  }, [camera, gl, positions, paths]);
  const labelOrder = useMemo(() => [...positions].sort((a, b) => Number(selectedIds.has(b.node.id)) - Number(selectedIds.has(a.node.id)) || Number(matchIds.has(b.node.id)) - Number(matchIds.has(a.node.id)) || Number(connected.has(b.node.id)) - Number(connected.has(a.node.id)) || Number(b.node.kind === 'entry') - Number(a.node.kind === 'entry')), [positions, selectedIds, matchIds, connected]);
  useFrame((_, delta) => {
    const zoom = (camera as THREE.OrthographicCamera).zoom;
    nodeAsset.material.uniforms.zoom!.value = zoom;
    (edgeAsset.arrowMaterial.uniforms.viewport!.value as THREE.Vector2).set(size.width, size.height);
    cameraRef.current = { scale: zoom, viewportWidth: size.width, viewportHeight: size.height };
    if (labelDirty.current) {
      const labels = projectSemanticFlowLabels(camera, size, zoom, labelOrder, selectedIds, matchIds, { regions, relatedIds: connected, priorityIds, hoveredIds, overlayTop, previous: previousLabels.current, obstacles: labelObstacles });
      previousLabels.current = labels;
      callbacks.current.onLabels(labels);
      callbacks.current.onConnections(semanticFlowConnectionNotices(camera, size, positions, new Set([...connected, ...priorityIds].filter(id => !selectedIds.has(id))), labels, overlayTop, labelObstacles));
      labelDirty.current = false;
    }
    if (stateRef.current.active) { stateRef.current.distance += Math.min(delta, .1) * SPATIAL_FLOW_SPEED; invalidate(); }
  });
  return <><color attach="background" args={['#050c09']} /><primitive object={edgeAsset.object} /><primitive object={edgeAsset.arrows} /><primitive object={nodeAsset.object} />
    <SpatialFlowParticles paths={flowPaths} stateRef={stateRef} cameraRef={cameraRef} active={motion.enabled && motion.visible} spacing={SPATIAL_FLOW_PARTICLE_SPACING} />
  </>;
}

class FlowGraphBoundary extends Component<{ children: ReactNode; onUnavailable: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onUnavailable(); }
  render() { return this.state.failed ? <p role="status">3Dを利用できないため、2Dへ戻ります。</p> : this.props.children; }
}

export function SemanticFlow3D(props: Props) {
  const [labels, setLabels] = useState<FlowLabelContent[]>([]);
  const [labelLayer] = useState(() => new FlowLabelLayer(setLabels));
  const [hoveredId, setHoveredId] = useState<string>(), [focusedId, setFocusedId] = useState<string>();
  const [expanded, setExpanded] = useState(false), [aggregateOpen, setAggregateOpen] = useState(false), [connectionsOpen, setConnectionsOpen] = useState(false), [memberPage, setMemberPage] = useState(0);
  const [connections, setConnections] = useState<FlowConnectionNotice[]>([]);
  const disclosures = useRef<HTMLDivElement>(null);
  const [labelObstacles, setLabelObstacles] = useState<FlowLabelObstacle[]>([]);
  const presentation = useMemo(() => buildUnresolvedFlowPresentation(props.graph, props.explorer), [props.graph, props.explorer]);
  const positions = useMemo(() => visibleUnresolvedFlowPositions(presentation, props.selectedIds, props.selectedEdgeId, expanded), [presentation, props.selectedIds, props.selectedEdgeId, expanded]);
  const byId = useMemo(() => new Map(props.graph.nodes.map(node => [node.id, node])), [props.graph.nodes]);
  const onConnections = useCallback((next: FlowConnectionNotice[]) => setConnections(previous => previous.length === next.length && previous.every((item, index) => item.id === next[index]!.id && item.status === next[index]!.status) ? previous : next), []);
  const aggregateId = presentation.aggregate?.node.id;
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
  }, [aggregateOpen, connectionsOpen, connections.length, presentation.members.length]);
  const selectPoint = (id: string) => {
    if (id === aggregateId) { setExpanded(value => !value); setAggregateOpen(true); }
    else props.onSelect(id);
  };
  const clearHoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onHover = useCallback((id?: string) => {
    if (id) { clearTimeout(clearHoverTimer.current); clearHoverTimer.current = undefined; setHoveredId(id); }
    else if (clearHoverTimer.current === undefined) clearHoverTimer.current = setTimeout(() => { setHoveredId(undefined); clearHoverTimer.current = undefined; }, 120);
  }, []);
  const hoveredIds = useMemo(() => new Set([hoveredId, focusedId].filter((id): id is string => Boolean(id))), [hoveredId, focusedId]);
  const regionNodes = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const { node } of positions) { if (node.attributes.displayAggregate === true) continue; const identity = props.explorer ? explorerRegionIdentity(props.explorer, node.id) : semanticRegionIdentity(node);
      const id = `flow-region:${identity.id}`, nodes = map.get(id) ?? []; nodes.push(node.id); map.set(id, nodes); }
    return map;
  }, [positions, props.explorer]);
  const selected = props.graph.nodes.find(node => props.selectedIds.has(node.id));
  const selectedRegion = selected ? props.explorer ? explorerRegionIdentity(props.explorer, selected.id) : semanticRegionIdentity(selected) : undefined;
  const description = props.graph.view === 'runtime-flow' && props.explorer?.runtimeMode !== 'grounded'
    ? props.explorer?.runtimeMode === 'mixed' ? '実行環境と、未判定対象の所属' : '実行環境未判定・所属別表示' : '所属を手掛かりに全体を探索';
  useLayoutEffect(() => { labelLayer.resume(); return () => { clearTimeout(clearHoverTimer.current); labelLayer.suspend(); }; }, [labelLayer]);
  return <div className="semantic-flow-3d" data-node-count={props.graph.nodes.length} data-edge-count={props.graph.edges.length} data-display-point-count={positions.length} data-unresolved-target-count={presentation.members.length} data-unresolved-expanded={expanded}>
    <FlowGraphBoundary onUnavailable={props.onUnavailable}><Canvas orthographic frameloop="demand" dpr={[1, 1.7]} camera={{ position: [600, 450, 2200], zoom: 1, near: .1, far: 1000000 }} gl={{ antialias: true, alpha: true }}><Scene {...props} positions={positions} labelObstacles={labelObstacles} onSelect={selectPoint} onConnections={onConnections} onLabels={labelLayer.update} hoveredIds={hoveredIds} onHover={onHover} hoverAt={labelLayer.hoverAt} /></Canvas></FlowGraphBoundary>
    <svg className="semantic-flow-label-leaders" aria-hidden="true">{labels.filter(label => !label.region).map(label => <line key={label.id} ref={element => labelLayer.attachLeader(label.id, element)} />)}</svg>
    <div className="semantic-flow-3d-labels">{labels.map(label => <button key={label.id} ref={element => labelLayer.attach(label.id, element)} type="button"
      data-flow-label-id={label.id} className={`${label.selected ? 'is-selected' : ''}${label.match ? ' is-match' : ''}${label.hovered ? ' is-hovered' : ''}${label.related ? ' is-related' : ''}${label.region ? ' is-region' : ''}${label.id === aggregateId ? ' is-aggregate' : ''}`} aria-pressed={label.region ? undefined : label.id === aggregateId ? expanded : label.selected} title={`${label.label}\n${label.path}`}
      aria-label={label.region ? `${label.label}の領域へ移動 · ${label.path}` : undefined}
      onPointerEnter={() => { if (!label.region) onHover(label.id); }} onPointerLeave={() => onHover()} onFocus={() => { if (!label.region) setFocusedId(label.id); }} onBlur={() => setFocusedId(undefined)}
      onClick={() => label.region ? props.onFocusRegion?.(regionNodes.get(label.id) ?? []) : selectPoint(label.id)}><strong>{label.label}</strong>{(label.region || label.selected || label.hovered || label.id === aggregateId) && <small>{label.region ? `所属 · ${label.path}` : label.path}</small>}</button>)}</div>
    <div className="semantic-flow-disclosures" ref={disclosures}>
      {presentation.aggregate && <details open={aggregateOpen} onToggle={event => setAggregateOpen(event.currentTarget.open)} className="semantic-flow-unresolved-control">
        <summary><span className="semantic-flow-aggregate-symbol" aria-hidden="true">○</span> 表示上の集約 · 定義先未特定 {presentation.members.length.toLocaleString()}対象</summary>
        {aggregateOpen && <div className="semantic-flow-disclosure-body">
          <p>呼び出し式は確認できていますが、Analyzerが呼び出し先の関数定義を特定できていません。</p>
          <p>現在の絞り込み内: {presentation.members.length.toLocaleString()}対象 · {presentation.relationCount.toLocaleString()}関係<br />その呼び出し関係の根拠: {presentation.callSiteCount.toLocaleString()}箇所</p>
          <button type="button" onClick={() => setExpanded(value => !value)}>{expanded ? '集約表示へ戻す' : 'すべての対象を点で展開'}</button>
          <small>{expanded ? 'すべての対象を個別表示中' : '選択した関係の対象は個別表示します'}</small>
          <ul>{presentation.members.slice(Math.min(memberPage, Math.max(0, Math.ceil(presentation.members.length / 20) - 1)) * 20, (Math.min(memberPage, Math.max(0, Math.ceil(presentation.members.length / 20) - 1)) + 1) * 20).map(node => <li key={node.id}>
            <button type="button" onClick={() => { setAggregateOpen(false); setConnectionsOpen(false); props.onSelect(node.id); props.onFocusRegion?.([node.id]); }} title={`${node.label}\n${node.path ?? ''}:${node.line ?? ''}`}><strong>{node.label}</strong><small>呼び出し箇所: {node.path ?? '位置情報なし'}{node.line ? `:${node.line}` : ''}</small></button>
          </li>)}</ul>
          {presentation.members.length > 20 && <div className="semantic-flow-disclosure-pages"><button type="button" disabled={memberPage <= 0} onClick={() => setMemberPage(page => Math.max(0, page - 1))}>前の20対象</button><button type="button" disabled={(memberPage + 1) * 20 >= presentation.members.length} onClick={() => setMemberPage(page => page + 1)}>次の20対象</button></div>}
        </div>}
      </details>}
      {connections.length > 0 && <details open={connectionsOpen} onToggle={event => setConnectionsOpen(event.currentTarget.open)} className="semantic-flow-connection-notices">
        <summary>関係の両端・接続先 ほか{connections.length}対象{connections.some(item => item.status === 'offscreen') ? ` · 画面外 ${connections.filter(item => item.status === 'offscreen').length}対象` : ''}</summary>
        <div className="semantic-flow-disclosure-body"><ul>{connections.map(item => <li key={item.id}><button type="button" onClick={() => { setConnectionsOpen(false); setAggregateOpen(false); props.onFocusRegion?.([item.id]); }} title={byId.get(item.id)?.label}>
          <strong>{byId.get(item.id)?.label ?? item.id}</strong><small>{item.status === 'offscreen' ? '画面外' : 'ラベルを省略'} · この対象へ移動</small>
        </button></li>)}</ul></div>
      </details>}
    </div>
    {!props.explorer && <SemanticFlowLocation label={`${regionNodes.size}のまとまり · ${props.graph.nodes.length.toLocaleString()}対象`} description={description} selection={selected ? `${selectedRegion?.label} · ${selected.kind === 'external' ? '呼び出し箇所: ' : ''}${selected.path ?? selected.label}` : undefined} />}
    <div className="semantic-flow-3d-selection-description" aria-live="polite">{[...props.selectedIds].map(id => props.graph.nodes.find(node => node.id === id)?.label).filter(Boolean).join('、')}</div>
  </div>;
}

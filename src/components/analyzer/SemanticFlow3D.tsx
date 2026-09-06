import { Component, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { AnalyzerViewSession } from '../../analyzer/session';
import { layoutSemanticFlow, semanticFlowEdgePaths } from '../../analyzer/semantic/flowPresentation';
import { semanticFlowRegions, semanticRegionIdentity } from '../../analyzer/semantic/flowRegions';
import { explorerRegionIdentity, type SemanticExplorerModel } from '../../analyzer/semantic/semanticExplorer';
import { SPATIAL_FLOW_PARTICLE_SPACING, SPATIAL_FLOW_SPEED, type SpatialFlowState } from '../../analyzer/spatialFlow';
import { SpatialFlowParticles } from './SpatialFlowParticles';
import type { SemanticFlowRenderProps } from './SemanticFlow2D';
import { bindSemanticFlowKeyboard } from './semanticFlowKeyboard';
import { FlowLabelLayer, hitSemanticFlowEdge, hitSemanticFlowPoint, projectSemanticFlowLabels, type FlowLabelContent, type FlowLabelPlacement } from './semanticFlowLabels';
import { SemanticFlowLocation } from './SemanticFlowMap';
import { configureSemanticFlowViewport, semanticFlowPlot } from './semanticFlowViewport';

type CameraState = NonNullable<AnalyzerViewSession['semanticCamera']>;
interface Props extends SemanticFlowRenderProps { explorer?: SemanticExplorerModel; direction?: 'both' | 'incoming' | 'outgoing'; camera?: CameraState; onCamera: (camera: CameraState) => void; onUnavailable: () => void; onFocusRegion?: (ids: string[]) => void }

function Scene({ graph, explorer, direction = 'both', selectedIds, selectedEdgeId, matchIds, command, motion, overlayTop, camera: savedCamera, onCamera, onSelect, onSelectEdge, onClear, onUnavailable, onLabels, hoveredIds, onHover, hoverAt }: Props & {
  onLabels: (labels: FlowLabelPlacement[]) => void; hoveredIds: ReadonlySet<string>; onHover: (id?: string) => void; hoverAt: (x: number, y: number) => string | undefined;
}) {
  const { camera, gl, size, invalidate } = useThree();
  const controls = useRef<OrbitControls | null>(null);
  const callbacks = useRef({ onCamera, onSelect, onSelectEdge, onClear, onUnavailable, onLabels, onHover, hoverAt });
  useEffect(() => { callbacks.current = { onCamera, onSelect, onSelectEdge, onClear, onUnavailable, onLabels, onHover, hoverAt }; }, [onCamera, onSelect, onSelectEdge, onClear, onUnavailable, onLabels, onHover, hoverAt]);
  useEffect(() => () => callbacks.current.onLabels([]), []);
  const positions = useMemo(() => layoutSemanticFlow(graph, '3d', explorer), [graph, explorer]);
  const regions = useMemo(() => semanticFlowRegions(positions, '3d', explorer), [positions, explorer]);
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
  useEffect(() => { labelDirty.current = true; invalidate(); }, [positions, selectedIds, matchIds, selectedEdgeId, hoveredIds, size, overlayTop, invalidate]);
  useEffect(() => {
    stateRef.current.active = motion.enabled && motion.visible && flowPaths.length > 0;
    stateRef.current.reduced = motion.reduced; invalidate();
  }, [motion.enabled, motion.visible, motion.reduced, flowPaths, invalidate]);
  const connected = useMemo(() => new Set(paths.flatMap(path => [path.edge.source, path.edge.target])), [paths]);
  const nodeAsset = useMemo(() => {
    const vertices: number[] = [], colors: number[] = [], sizes: number[] = [];
    positions.forEach(point => {
      vertices.push(point.x, point.y, point.z);
      const selected = selectedIds.has(point.node.id), matching = matchIds.has(point.node.id);
      colors.push(...new THREE.Color(selected ? '#c0e9dc' : matching ? '#edcc94' : connected.has(point.node.id) ? '#8db7b4' : '#698d81').toArray());
      sizes.push(selected ? 13 : matching ? 8 : connected.has(point.node.id) ? 7 : 5);
    });
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geometry.setAttribute('nodeSize', new THREE.Float32BufferAttribute(sizes, 1));
    const material = new THREE.ShaderMaterial({ vertexColors: true, transparent: true, depthWrite: false,
      uniforms: { zoom: { value: 1 }, pixelRatio: { value: gl.getPixelRatio() } },
      vertexShader: 'attribute float nodeSize; uniform float zoom; uniform float pixelRatio; varying vec3 tint; void main(){ tint=color; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); gl_PointSize=nodeSize*pixelRatio*clamp(sqrt(zoom),.85,2.); }',
      fragmentShader: 'varying vec3 tint; void main(){float d=length(gl_PointCoord-.5)*2.; if(d>1.)discard; gl_FragColor=vec4(tint,1.-smoothstep(.65,1.,d));\n#include <colorspace_fragment>\n}' });
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
    const targets = ids?.length ? positions.filter(point => ids.includes(point.node.id)) : positions;
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
      const labels = projectSemanticFlowLabels(camera, size, zoom, labelOrder, selectedIds, matchIds, { regions, relatedIds: connected, priorityIds, hoveredIds, overlayTop, previous: previousLabels.current });
      previousLabels.current = labels;
      callbacks.current.onLabels(labels);
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
  const clearHoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onHover = useCallback((id?: string) => {
    if (id) { clearTimeout(clearHoverTimer.current); clearHoverTimer.current = undefined; setHoveredId(id); }
    else if (clearHoverTimer.current === undefined) clearHoverTimer.current = setTimeout(() => { setHoveredId(undefined); clearHoverTimer.current = undefined; }, 120);
  }, []);
  const hoveredIds = useMemo(() => new Set([hoveredId, focusedId].filter((id): id is string => Boolean(id))), [hoveredId, focusedId]);
  const regionNodes = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const node of props.graph.nodes) { const identity = props.explorer ? explorerRegionIdentity(props.explorer, node.id) : semanticRegionIdentity(node);
      const id = `flow-region:${identity.id}`, nodes = map.get(id) ?? []; nodes.push(node.id); map.set(id, nodes); }
    return map;
  }, [props.graph.nodes, props.explorer]);
  const selected = props.graph.nodes.find(node => props.selectedIds.has(node.id));
  const selectedRegion = selected ? props.explorer ? explorerRegionIdentity(props.explorer, selected.id) : semanticRegionIdentity(selected) : undefined;
  const description = props.graph.view === 'runtime-flow' && props.explorer?.runtimeMode !== 'grounded'
    ? props.explorer?.runtimeMode === 'mixed' ? '実行環境と、未判定対象の所属' : '実行環境未判定・所属別表示' : '所属を手掛かりに全体を探索';
  useLayoutEffect(() => { labelLayer.resume(); return () => { clearTimeout(clearHoverTimer.current); labelLayer.suspend(); }; }, [labelLayer]);
  return <div className="semantic-flow-3d" data-node-count={props.graph.nodes.length} data-edge-count={props.graph.edges.length}>
    <FlowGraphBoundary onUnavailable={props.onUnavailable}><Canvas orthographic frameloop="demand" dpr={[1, 1.7]} camera={{ position: [600, 450, 2200], zoom: 1, near: .1, far: 1000000 }} gl={{ antialias: true, alpha: true }}><Scene {...props} onLabels={labelLayer.update} hoveredIds={hoveredIds} onHover={onHover} hoverAt={labelLayer.hoverAt} /></Canvas></FlowGraphBoundary>
    <svg className="semantic-flow-label-leaders" aria-hidden="true">{labels.filter(label => !label.region).map(label => <line key={label.id} ref={element => labelLayer.attachLeader(label.id, element)} />)}</svg>
    <div className="semantic-flow-3d-labels">{labels.map(label => <button key={label.id} ref={element => labelLayer.attach(label.id, element)} type="button"
      data-flow-label-id={label.id} className={`${label.selected ? 'is-selected' : ''}${label.match ? ' is-match' : ''}${label.hovered ? ' is-hovered' : ''}${label.related ? ' is-related' : ''}${label.region ? ' is-region' : ''}`} aria-pressed={label.region ? undefined : label.selected} title={`${label.label}\n${label.path}`}
      aria-label={label.region ? `${label.label}の領域へ移動 · ${label.path}` : undefined}
      onPointerEnter={() => { if (!label.region) onHover(label.id); }} onPointerLeave={() => onHover()} onFocus={() => { if (!label.region) setFocusedId(label.id); }} onBlur={() => setFocusedId(undefined)}
      onClick={() => label.region ? props.onFocusRegion?.(regionNodes.get(label.id) ?? []) : props.onSelect(label.id)}><strong>{label.label}</strong>{(label.region || label.selected || label.hovered) && <small>{label.region ? `所属 · ${label.path}` : label.path}</small>}</button>)}</div>
    {!props.explorer && <SemanticFlowLocation label={`${regionNodes.size}のまとまり · ${props.graph.nodes.length.toLocaleString()}対象`} description={description} selection={selected ? `${selectedRegion?.label} · ${selected.kind === 'external' ? '呼び出し箇所: ' : ''}${selected.path ?? selected.label}` : undefined} />}
    <div className="semantic-flow-3d-selection-description" aria-live="polite">{[...props.selectedIds].map(id => props.graph.nodes.find(node => node.id === id)?.label).filter(Boolean).join('、')}</div>
  </div>;
}
